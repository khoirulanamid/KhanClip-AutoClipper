export type RenderStage =
  | 'waiting'
  | 'preparing'
  | 'decoding'
  | 'compositing'
  | 'encoding'
  | 'muxing'
  | 'validating'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface RenderProgress {
  stage: RenderStage;
  percent: number; // 0..100
  processedFrames: number;
  totalFrames: number;
  currentFps?: number;
  etaSeconds?: number;
}

export interface RenderJob {
  id: string;
  projectId: string;
  candidateId: string;
  outputName: string;
  resolution: '720x1280' | '1080x1920';
  targetBitrateBps: number;
  status: RenderStage;
  progress: RenderProgress;
  outputPath?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}
