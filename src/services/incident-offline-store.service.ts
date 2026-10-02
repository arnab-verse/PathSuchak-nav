import { IncidentReport, PhotoAttachment, SyncQueueItem, ServerIncidentRevision } from '../types';

const DB_NAME = 'TacticalIncidentDB';
const DB_VERSION = 2;

const STORES = {
  INCIDENTS: 'incidents',
  PHOTOS: 'photos',
  SYNC_QUEUE: 'sync_queue',
  SERVER_REVISIONS: 'server_revisions'
};

class IncidentOfflineStoreService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  public async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB is not supported in this environment.'));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;

        // Incidents store: keyed by stable report_id
        if (!db.objectStoreNames.contains(STORES.INCIDENTS)) {
          const incidentStore = db.createObjectStore(STORES.INCIDENTS, { keyPath: 'report_id' });
          incidentStore.createIndex('timestamp', 'timestamp', { unique: false });
          incidentStore.createIndex('sync_stage', 'sync_stage', { unique: false });
          incidentStore.createIndex('tenant_id', 'tenant_id', { unique: false });
        }

        // Photos store: keyed by photo ID, holds raw/compressed Blobs
        if (!db.objectStoreNames.contains(STORES.PHOTOS)) {
          const photoStore = db.createObjectStore(STORES.PHOTOS, { keyPath: 'id' });
          photoStore.createIndex('report_id', 'report_id', { unique: false });
          photoStore.createIndex('isUploaded', 'isUploaded', { unique: false });
        }

        // Sync Queue store: keyed by queue item id
        if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
          const queueStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
          queueStore.createIndex('report_id', 'report_id', { unique: false });
          queueStore.createIndex('status', 'status', { unique: false });
          queueStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Server Revisions store: keyed by report_id
        if (!db.objectStoreNames.contains(STORES.SERVER_REVISIONS)) {
          db.createObjectStore(STORES.SERVER_REVISIONS, { keyPath: 'report_id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error || new Error('Failed to open IndexedDB'));
      };
    });

    return this.dbPromise;
  }

  // ===================== INCIDENTS =====================

  public async saveIncident(incident: IncidentReport): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.INCIDENTS], 'readwrite');
      const store = tx.objectStore(STORES.INCIDENTS);
      
      // Store clean incident data (photo blobs stored in separate photo store for performance)
      const sanitized = {
        ...incident,
        photo_attachments: incident.photo_attachments.map(p => ({
          ...p,
          blob: undefined // strip blob from main record to keep store light
        }))
      };

      const req = store.put(sanitized);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async getIncident(report_id: string): Promise<IncidentReport | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.INCIDENTS], 'readonly');
      const store = tx.objectStore(STORES.INCIDENTS);
      const req = store.get(report_id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  public async getAllIncidents(tenant_id?: string): Promise<IncidentReport[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.INCIDENTS], 'readonly');
      const store = tx.objectStore(STORES.INCIDENTS);
      const req = store.getAll();

      req.onsuccess = () => {
        let results: IncidentReport[] = req.result || [];
        if (tenant_id) {
          results = results.filter(i => i.tenant_id === tenant_id);
        }
        // Sort newest first
        results.sort((a, b) => b.timestamp - a.timestamp);
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async deleteIncident(report_id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.INCIDENTS, STORES.PHOTOS, STORES.SYNC_QUEUE], 'readwrite');
      
      // Delete incident
      tx.objectStore(STORES.INCIDENTS).delete(report_id);

      // Delete associated photos
      const photoStore = tx.objectStore(STORES.PHOTOS);
      const photoIndex = photoStore.index('report_id');
      const photoReq = photoIndex.getAllKeys(report_id);
      photoReq.onsuccess = () => {
        const keys = photoReq.result || [];
        keys.forEach(k => photoStore.delete(k));
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ===================== PHOTOS (BLOBS) =====================

  public async savePhoto(photo: PhotoAttachment): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.PHOTOS], 'readwrite');
      const store = tx.objectStore(STORES.PHOTOS);
      const req = store.put(photo);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async getPhoto(id: string): Promise<PhotoAttachment | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.PHOTOS], 'readonly');
      const store = tx.objectStore(STORES.PHOTOS);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  public async getPhotosForReport(report_id: string): Promise<PhotoAttachment[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.PHOTOS], 'readonly');
      const store = tx.objectStore(STORES.PHOTOS);
      const index = store.index('report_id');
      const req = index.getAll(report_id);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * CRITICAL REQUIREMENT: Remove local photo blob ONLY after successful server synchronization
   */
  public async removePhotoAfterSync(photoId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.PHOTOS], 'readwrite');
      const store = tx.objectStore(STORES.PHOTOS);
      const req = store.delete(photoId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // ===================== SYNC QUEUE =====================

  public async saveQueueItem(item: SyncQueueItem): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
      const store = tx.objectStore(STORES.SYNC_QUEUE);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async getAllQueueItems(): Promise<SyncQueueItem[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.SYNC_QUEUE], 'readonly');
      const store = tx.objectStore(STORES.SYNC_QUEUE);
      const req = store.getAll();
      req.onsuccess = () => {
        const list: SyncQueueItem[] = req.result || [];
        list.sort((a, b) => b.timestamp - a.timestamp);
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async deleteQueueItem(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
      const store = tx.objectStore(STORES.SYNC_QUEUE);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // ===================== SERVER REVISIONS (409 CONFLICT) =====================

  public async saveServerRevision(rev: ServerIncidentRevision): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.SERVER_REVISIONS], 'readwrite');
      const store = tx.objectStore(STORES.SERVER_REVISIONS);
      const req = store.put(rev);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async getServerRevision(report_id: string): Promise<ServerIncidentRevision | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.SERVER_REVISIONS], 'readonly');
      const store = tx.objectStore(STORES.SERVER_REVISIONS);
      const req = store.get(report_id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Resets and purges database for testing or factory reset
   */
  public async clearAllData(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.INCIDENTS, STORES.PHOTOS, STORES.SYNC_QUEUE, STORES.SERVER_REVISIONS], 'readwrite');
      tx.objectStore(STORES.INCIDENTS).clear();
      tx.objectStore(STORES.PHOTOS).clear();
      tx.objectStore(STORES.SYNC_QUEUE).clear();
      tx.objectStore(STORES.SERVER_REVISIONS).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const incidentOfflineStore = new IncidentOfflineStoreService();
