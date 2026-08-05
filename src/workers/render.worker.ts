import { WorkerRequest, WorkerResponse } from './protocols/messages';

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === 'START_RENDER') {
    const response: WorkerResponse = {
      id: msg.id,
      timestampUs: Date.now() * 1000,
      type: 'PROGRESS',
      taskType: 'RENDER_ENCODING',
      percent: 100,
      stageMessage: 'Render selesai.',
    };
    self.postMessage(response);
  }
};
