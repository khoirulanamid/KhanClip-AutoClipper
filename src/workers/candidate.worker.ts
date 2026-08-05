import { WorkerRequest, WorkerResponse } from './protocols/messages';

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === 'DETECT_CANDIDATES') {
    const response: WorkerResponse = {
      id: msg.id,
      timestampUs: Date.now() * 1000,
      type: 'PROGRESS',
      taskType: 'CANDIDATE_DETECTION',
      percent: 100,
      stageMessage: 'Deteksi kandidat selesai.',
    };
    self.postMessage(response);
  }
};
