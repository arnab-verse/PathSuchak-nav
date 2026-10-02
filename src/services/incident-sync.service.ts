import { IncidentReport, SyncStatusStage, ServerIncidentRevision, PhotoAttachment } from '../types';
import { incidentOfflineStore } from './incident-offline-store.service';
import { incidentApiService } from './incident-api.service';
import { connectivityService } from './connectivity.service';

export interface SyncProgressEvent {
  report_id: string;
  stage: SyncStatusStage;
  message: string;
  progressPercent: number;
  error?: string;
  serverRevision?: ServerIncidentRevision;
}

type SyncEventListener = (event: SyncProgressEvent) => void;

class IncidentSyncService {
  private isProcessing: boolean = false;
  private listeners: Set<SyncEventListener> = new Set();
  private maxRetries: number = 5;

  public subscribe(listener: SyncEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(event: SyncProgressEvent) {
    this.listeners.forEach((l) => l(event));
  }

  /**
   * Synchronizes an individual incident through the strict pipeline:
   * LOCAL_ONLY -> QUEUED -> UPLOADING_PHOTOS -> SUBMITTING -> SYNCED
   * (or CONFLICT / FAILED)
   */
  public async syncIncident(incident: IncidentReport): Promise<{ success: boolean; stage: SyncStatusStage; error?: string }> {
    if (!connectivityService.isOnline()) {
      const msg = 'Device is offline. Queued for background synchronization.';
      await this.updateIncidentStage(incident, 'QUEUED', msg);
      return { success: false, stage: 'QUEUED', error: msg };
    }

    try {
      // Step 1: Transition to QUEUED
      this.notify({
        report_id: incident.report_id,
        stage: 'QUEUED',
        message: 'Synchronizing with HQ Command Server...',
        progressPercent: 15
      });
      await this.updateIncidentStage(incident, 'QUEUED');

      // Step 2: Upload Photos Before Incident
      const photosToUpload = await incidentOfflineStore.getPhotosForReport(incident.report_id);
      
      if (photosToUpload.length > 0) {
        this.notify({
          report_id: incident.report_id,
          stage: 'UPLOADING_PHOTOS',
          message: `Compressing & transmitting ${photosToUpload.length} field photo(s)...`,
          progressPercent: 35
        });
        await this.updateIncidentStage(incident, 'UPLOADING_PHOTOS');

        for (let i = 0; i < photosToUpload.length; i++) {
          const photo = photosToUpload[i];
          if (!photo.isUploaded) {
            const uploadRes = await incidentApiService.uploadPhoto(photo, incident.tenant_id);
            if (uploadRes.status === 201 && uploadRes.data) {
              photo.isUploaded = true;
              photo.remoteUrl = uploadRes.data.remoteUrl;
              await incidentOfflineStore.savePhoto(photo);
            } else if (uploadRes.status === 503) {
              throw new Error(uploadRes.error || 'Temporary upload failure (503)');
            }
          }
          this.notify({
            report_id: incident.report_id,
            stage: 'UPLOADING_PHOTOS',
            message: `Uploaded photo ${i + 1}/${photosToUpload.length}`,
            progressPercent: 35 + Math.round(((i + 1) / photosToUpload.length) * 35)
          });
        }
      }

      // Step 3: Submitting Incident Payload with Idempotency Key & Revision
      this.notify({
        report_id: incident.report_id,
        stage: 'SUBMITTING',
        message: 'Broadcasting telemetry payload & coordinates...',
        progressPercent: 75
      });
      await this.updateIncidentStage(incident, 'SUBMITTING');

      const submitRes = await incidentApiService.submitIncident(
        incident,
        incident.idempotency_key,
        incident.tenant_id
      );

      // Handle HTTP 409 Conflict
      if (submitRes.status === 409 && submitRes.serverRevision) {
        const errorMsg = 'HTTP 409 Conflict: A newer revision exists on HQ server.';
        await incidentOfflineStore.saveServerRevision(submitRes.serverRevision);
        
        const conflictIncident: IncidentReport = {
          ...incident,
          sync_stage: 'CONFLICT',
          syncStatus: 'failed',
          sync_error: errorMsg,
          server_version: submitRes.serverRevision
        };
        await incidentOfflineStore.saveIncident(conflictIncident);

        this.notify({
          report_id: incident.report_id,
          stage: 'CONFLICT',
          message: errorMsg,
          progressPercent: 100,
          error: errorMsg,
          serverRevision: submitRes.serverRevision
        });

        return { success: false, stage: 'CONFLICT', error: errorMsg };
      }

      // Handle Temporary 503
      if (submitRes.status === 503) {
        throw new Error(submitRes.error || '503 Service Unavailable');
      }

      // Step 4: Confirmed SYNCED
      const updatedIncident: IncidentReport = {
        ...incident,
        revision: submitRes.data?.revision || incident.revision + 1,
        sync_stage: 'SYNCED',
        syncStatus: 'synced',
        sync_error: undefined,
        retry_count: 0
      };
      await incidentOfflineStore.saveIncident(updatedIncident);

      // CRITICAL RULE: Remove local photo data ONLY AFTER successful synchronization!
      for (const p of photosToUpload) {
        await incidentOfflineStore.removePhotoAfterSync(p.id);
      }

      this.notify({
        report_id: incident.report_id,
        stage: 'SYNCED',
        message: 'Successfully synchronized to HQ Command Server',
        progressPercent: 100
      });

      return { success: true, stage: 'SYNCED' };
    } catch (err: any) {
      console.warn('Sync attempt failed:', err);
      const retryCount = (incident.retry_count || 0) + 1;
      const backoffDelay = this.calculateExponentialBackoff(retryCount);
      
      const failedIncident: IncidentReport = {
        ...incident,
        sync_stage: 'FAILED',
        syncStatus: 'failed',
        sync_error: `${err.message || 'Sync failed'}. Next retry in ${Math.round(backoffDelay / 1000)}s`,
        retry_count: retryCount,
        last_sync_attempt: Date.now()
      };
      await incidentOfflineStore.saveIncident(failedIncident);

      this.notify({
        report_id: incident.report_id,
        stage: 'FAILED',
        message: failedIncident.sync_error!,
        progressPercent: 0,
        error: failedIncident.sync_error
      });

      return { success: false, stage: 'FAILED', error: err.message };
    }
  }

  /**
   * Exponential backoff calculation with jitter: Math.min(30000, 2^attempt * 1000 + random jitter)
   */
  public calculateExponentialBackoff(attempt: number): number {
    const base = Math.min(30000, Math.pow(2, attempt) * 1000);
    const jitter = Math.random() * 500;
    return Math.round(base + jitter);
  }

  /**
   * Resolves a 409 Conflict according to user choice:
   * - 'keep_local': Bumps revision to match server and forces push
   * - 'accept_server': Overwrites local fields with server version
   * - 'merge': Merges local & server descriptions and photos
   */
  public async resolveConflict(
    report_id: string,
    choice: 'keep_local' | 'accept_server' | 'merge',
    customMergeText?: string
  ): Promise<IncidentReport> {
    const local = await incidentOfflineStore.getIncident(report_id);
    const server = await incidentOfflineStore.getServerRevision(report_id);

    if (!local || !server) {
      throw new Error('Cannot resolve conflict: Missing local or server incident records.');
    }

    let resolved: IncidentReport;

    if (choice === 'accept_server') {
      resolved = {
        ...local,
        title: server.title,
        severity: server.severity,
        category: server.category,
        description: server.description,
        district_road_segment: server.district_road_segment,
        revision: server.revision,
        sync_stage: 'SYNCED',
        syncStatus: 'synced',
        sync_error: undefined,
        server_version: undefined
      };
    } else if (choice === 'keep_local') {
      resolved = {
        ...local,
        revision: server.revision, // Adopt server's revision baseline to allow next write
        sync_stage: 'QUEUED',
        syncStatus: 'pending',
        sync_error: undefined,
        server_version: undefined
      };
    } else {
      // Merge
      resolved = {
        ...local,
        description: customMergeText || `${local.description}\n\n[HQ Integration Note: ${server.description}]`,
        revision: server.revision,
        sync_stage: 'QUEUED',
        syncStatus: 'pending',
        sync_error: undefined,
        server_version: undefined
      };
    }

    await incidentOfflineStore.saveIncident(resolved);

    // If online, immediately trigger sync
    if (connectivityService.isOnline() && choice !== 'accept_server') {
      await this.syncIncident(resolved);
    }

    return resolved;
  }

  /**
   * Helper to update incident stage in storage
   */
  private async updateIncidentStage(incident: IncidentReport, stage: SyncStatusStage, errorMsg?: string) {
    incident.sync_stage = stage;
    incident.syncStatus = stage === 'SYNCED' ? 'synced' : stage === 'FAILED' ? 'failed' : 'pending';
    if (errorMsg) incident.sync_error = errorMsg;
    await incidentOfflineStore.saveIncident(incident);
  }

  /**
   * Syncs all queued reports in batch
   */
  public async syncAllPending(): Promise<{ total: number; successful: number }> {
    if (this.isProcessing) return { total: 0, successful: 0 };
    this.isProcessing = true;

    try {
      const allIncidents = await incidentOfflineStore.getAllIncidents();
      const pending = allIncidents.filter(i => i.sync_stage !== 'SYNCED' && i.sync_stage !== 'CONFLICT');

      let successful = 0;
      for (const inc of pending) {
        const result = await this.syncIncident(inc);
        if (result.success) successful++;
      }
      return { total: pending.length, successful };
    } finally {
      this.isProcessing = false;
    }
  }
}

export const incidentSyncService = new IncidentSyncService();
