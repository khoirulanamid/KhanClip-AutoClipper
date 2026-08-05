import { Result, Ok, Err, createAppError } from '@/domain/common/Result';
import { Project } from '@/domain/project/types';
import { TranscriptDocument } from '@/domain/transcript/types';
import { Candidate } from '@/domain/candidate/types';
import { RenderJob } from '@/domain/render/types';

const DB_NAME = 'EditFlowAutoClipperDB';
const DB_VERSION = 1;

export class LocalStorageAdapter {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB tidak didukung pada lingkungan ini'));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('transcripts')) {
          db.createObjectStore('transcripts', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('candidates')) {
          db.createObjectStore('candidates', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('renderJobs')) {
          db.createObjectStore('renderJobs', { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  async saveProject(project: Project): Promise<Result<void>> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction('projects', 'readwrite');
        const store = tx.objectStore('projects');
        const req = store.put(project);
        req.onsuccess = () => resolve(Ok(undefined));
        req.onerror = () =>
          resolve(Err(createAppError('STORAGE_SAVE_FAILED', 'Gagal menyimpan proyek ke IndexedDB')));
      });
    } catch (err: any) {
      return Err(createAppError('STORAGE_ERROR', err?.message || 'Error IndexedDB'));
    }
  }

  async getProject(id: string): Promise<Result<Project | null>> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction('projects', 'readonly');
        const store = tx.objectStore('projects');
        const req = store.get(id);
        req.onsuccess = () => resolve(Ok(req.result || null));
        req.onerror = () =>
          resolve(Err(createAppError('STORAGE_READ_FAILED', 'Gagal membaca proyek dari IndexedDB')));
      });
    } catch (err: any) {
      return Err(createAppError('STORAGE_ERROR', err?.message || 'Error IndexedDB'));
    }
  }

  async saveTranscript(transcript: TranscriptDocument): Promise<Result<void>> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction('transcripts', 'readwrite');
        const store = tx.objectStore('transcripts');
        const req = store.put(transcript);
        req.onsuccess = () => resolve(Ok(undefined));
        req.onerror = () =>
          resolve(Err(createAppError('STORAGE_SAVE_FAILED', 'Gagal menyimpan transkrip')));
      });
    } catch (err: any) {
      return Err(createAppError('STORAGE_ERROR', err?.message || 'Error IndexedDB'));
    }
  }

  async saveCandidates(candidates: Candidate[]): Promise<Result<void>> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction('candidates', 'readwrite');
        const store = tx.objectStore('candidates');
        for (const candidate of candidates) {
          store.put(candidate);
        }
        tx.oncomplete = () => resolve(Ok(undefined));
        tx.onerror = () =>
          resolve(Err(createAppError('STORAGE_SAVE_FAILED', 'Gagal menyimpan kandidat')));
      });
    } catch (err: any) {
      return Err(createAppError('STORAGE_ERROR', err?.message || 'Error IndexedDB'));
    }
  }

  async saveRenderJob(job: RenderJob): Promise<Result<void>> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction('renderJobs', 'readwrite');
        const store = tx.objectStore('renderJobs');
        const req = store.put(job);
        req.onsuccess = () => resolve(Ok(undefined));
        req.onerror = () =>
          resolve(Err(createAppError('STORAGE_SAVE_FAILED', 'Gagal menyimpan pekerjaan render')));
      });
    } catch (err: any) {
      return Err(createAppError('STORAGE_ERROR', err?.message || 'Error IndexedDB'));
    }
  }

  async clearAllData(): Promise<Result<void>> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(['projects', 'transcripts', 'candidates', 'renderJobs'], 'readwrite');
        tx.objectStore('projects').clear();
        tx.objectStore('transcripts').clear();
        tx.objectStore('candidates').clear();
        tx.objectStore('renderJobs').clear();
        tx.oncomplete = () => resolve(Ok(undefined));
        tx.onerror = () => resolve(Err(createAppError('STORAGE_CLEAR_FAILED', 'Gagal menghapus data lokal')));
      });
    } catch (err: any) {
      return Err(createAppError('STORAGE_ERROR', err?.message || 'Error IndexedDB'));
    }
  }
}

export const localStorageAdapter = new LocalStorageAdapter();
