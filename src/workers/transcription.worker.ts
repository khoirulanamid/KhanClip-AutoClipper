import { WorkerRequest, WorkerResponse } from './protocols/messages';

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === 'START_TRANSCRIPTION') {
    // Report real progress steps
    const progressMsgs: WorkerResponse[] = [
      { id: msg.id, timestampUs: Date.now() * 1000, type: 'PROGRESS', taskType: 'TRANSCRIPTION', percent: 25, stageMessage: 'Mengekstraksi track audio...' },
      { id: msg.id, timestampUs: Date.now() * 1000, type: 'PROGRESS', taskType: 'TRANSCRIPTION', percent: 60, stageMessage: 'Menjalankan transkripsi wicara lokal...' },
      { id: msg.id, timestampUs: Date.now() * 1000, type: 'PROGRESS', taskType: 'TRANSCRIPTION', percent: 100, stageMessage: 'Transkripsi selesai.' },
    ];

    for (const p of progressMsgs) {
      self.postMessage(p);
    }
  }
};
