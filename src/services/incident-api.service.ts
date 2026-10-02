import { IncidentReport, PhotoAttachment, ServerIncidentRevision } from '../types';

export interface APIResponse<T> {
  status: number;
  data?: T;
  error?: string;
  serverRevision?: ServerIncidentRevision;
  headers?: Record<string, string>;
}

export interface PhotoUploadResponse {
  photoId: string;
  remoteUrl: string;
  sizeBytes: number;
}

class IncidentAPIService {
  // Mock Server Ledger: keeps track of canonical server state & idempotency keys
  private serverIncidentLedger: Map<string, ServerIncidentRevision> = new Map();
  private idempotencyStore: Map<string, { response: any; timestamp: number }> = new Map();
  private simulatedPhotoStorage: Map<string, string> = new Map();
  
  // Test flag controls
  public simulateNetworkDelayMs: number = 400;
  public forceNextConflict: boolean = false;
  public forceNext503Error: boolean = false;

  constructor() {
    this.seedInitialServerData();
  }

  private seedInitialServerData() {
    this.serverIncidentLedger.set('IR-402', {
      report_id: 'IR-402',
      revision: 1,
      title: 'Active Rockfall - Sector 4B',
      category: 'landslide',
      severity: 'high',
      description: 'Initial HQ assessment: Debris blocking south lane. Caution advised.',
      district_road_segment: 'Sela Ridge Pass - Sector 4B',
      latitude: 27.5925,
      longitude: 91.8745,
      photos_count: 1,
      updated_at: Date.now() - 3600000,
      updated_by: 'HQ Command Dispatcher'
    });
  }

  /**
   * Uploads an individual photo before the incident payload
   */
  public async uploadPhoto(
    photo: PhotoAttachment,
    tenant_id: string
  ): Promise<APIResponse<PhotoUploadResponse>> {
    await new Promise(r => setTimeout(r, this.simulateNetworkDelayMs));

    if (this.forceNext503Error) {
      this.forceNext503Error = false;
      return {
        status: 503,
        error: '503 Service Unavailable: Tactical uplink link congested'
      };
    }

    const remoteUrl = `https://tactical-cdn.defense.mil/photos/${tenant_id}/${photo.id}.jpg`;
    this.simulatedPhotoStorage.set(photo.id, remoteUrl);

    return {
      status: 201,
      data: {
        photoId: photo.id,
        remoteUrl,
        sizeBytes: photo.sizeBytes
      }
    };
  }

  /**
   * Submits an incident report payload to HQ Server with Idempotency & Revision checking
   */
  public async submitIncident(
    incident: IncidentReport,
    idempotencyKey: string,
    tenant_id: string
  ): Promise<APIResponse<{ report_id: string; revision: number; status: string }>> {
    await new Promise(r => setTimeout(r, this.simulateNetworkDelayMs));

    // 1. Check Idempotency Key (Return cached response if duplicate request)
    if (this.idempotencyStore.has(idempotencyKey)) {
      const cached = this.idempotencyStore.get(idempotencyKey)!;
      return {
        status: 200,
        data: cached.response,
        headers: { 'X-Cache-Lookup': 'HIT', 'X-Idempotent-Replay': 'true' }
      };
    }

    // 2. Simulated 503 Server Failure to test Exponential Backoff
    if (this.forceNext503Error) {
      this.forceNext503Error = false;
      return {
        status: 503,
        error: '503 Service Unavailable: Satellite transponder timed out'
      };
    }

    // 3. Conflict Detection (HTTP 409 CONFLICT)
    const existingServer = this.serverIncidentLedger.get(incident.report_id);

    if (this.forceNextConflict || (existingServer && existingServer.revision > incident.revision)) {
      this.forceNextConflict = false;
      
      const serverVersion = existingServer || {
        report_id: incident.report_id,
        revision: incident.revision + 1,
        title: `${incident.title} (HQ Field Update)`,
        category: incident.category,
        severity: 'critical',
        description: 'Server Revision Conflict: Headquarters field operator modified clearance parameters and upgraded threat level.',
        district_road_segment: incident.district_road_segment,
        latitude: incident.latitude,
        longitude: incident.longitude,
        photos_count: 2,
        updated_at: Date.now() - 60000,
        updated_by: 'HQ Officer C. Reynolds'
      };

      // Store in ledger
      this.serverIncidentLedger.set(incident.report_id, serverVersion);

      return {
        status: 409,
        error: 'HTTP 409 Conflict: A newer revision of this incident exists on the server.',
        serverRevision: serverVersion
      };
    }

    // 4. Successful creation / revision update
    const newRevision = (existingServer?.revision || 0) + 1;
    const updatedServerRecord: ServerIncidentRevision = {
      report_id: incident.report_id,
      revision: newRevision,
      title: incident.title,
      category: incident.category,
      severity: incident.severity,
      description: incident.description,
      district_road_segment: incident.district_road_segment,
      latitude: incident.latitude,
      longitude: incident.longitude,
      photos_count: incident.photo_attachments.length || incident.photos.length,
      updated_at: Date.now(),
      updated_by: incident.reportedBy
    };

    this.serverIncidentLedger.set(incident.report_id, updatedServerRecord);

    const responsePayload = {
      report_id: incident.report_id,
      revision: newRevision,
      status: 'SYNCED_OK'
    };

    // Store in idempotency store
    this.idempotencyStore.set(idempotencyKey, {
      response: responsePayload,
      timestamp: Date.now()
    });

    return {
      status: 200,
      data: responsePayload,
      serverRevision: updatedServerRecord
    };
  }

  public getServerRecord(report_id: string): ServerIncidentRevision | undefined {
    return this.serverIncidentLedger.get(report_id);
  }

  public hasIdempotencyKey(key: string): boolean {
    return this.idempotencyStore.has(key);
  }
}

export const incidentApiService = new IncidentAPIService();
