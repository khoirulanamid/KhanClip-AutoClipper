export type WorkerTaskType =
  | 'TRANSCRIPTION'
  | 'CANDIDATE_DETECTION'
  | 'VISION_FACE_DETECTION'
  | 'PREVIEW_COMPOSITING'
  | 'RENDER_ENCODING';

export interface BaseWorkerMessage {
  id: string;
  timestampUs: number;
}

// Request Messages
export interface StartTranscriptionRequest extends BaseWorkerMessage {
  type: 'START_TRANSCRIPTION';
  projectId: string;
  /**
   * Mono PCM audio samples (Float32) transferred as an ArrayBuffer.
   * In pool mode this is only the shard slice assigned to this worker.
   */
  audioBuffer: ArrayBuffer;
  /** Sampling rate of audioBuffer in Hz (16000 expected by Whisper). */
  sampleRate: number;
  language: string;
  modelProfile: 'eco' | 'balanced' | 'max';
  /** Global microsecond time of the first sample in audioBuffer. */
  audioOffsetUs: number;
  /** Assigned transcription ranges in global microseconds. */
  ranges: { startUs: number; endUs: number }[];
}

export interface DetectCandidatesRequest extends BaseWorkerMessage {
  type: 'DETECT_CANDIDATES';
  projectId: string;
  transcriptId: string;
  targetDurationSec: string;
  candidateCount: string;
}

export interface StartRenderJobRequest extends BaseWorkerMessage {
  type: 'START_RENDER';
  jobId: string;
  candidateId: string;
  resolution: '720x1280' | '1080x1920';
  targetBitrateBps: number;
}

export type WorkerRequest =
  | StartTranscriptionRequest
  | DetectCandidatesRequest
  | StartRenderJobRequest;

// Response & Progress Event Messages
export interface WorkerProgressEvent extends BaseWorkerMessage {
  type: 'PROGRESS';
  taskType: WorkerTaskType;
  percent: number;
  stageMessage: string;
  /** Inference backend chosen by the worker (e.g. 'WebGPU (fp16)', 'WASM/CPU'). */
  backend?: string;
  /** Ranges finished by this worker so far (pool aggregation). */
  completedRanges?: number;
  /** Ranges assigned to this worker (pool aggregation). */
  totalRanges?: number;
}

export interface WorkerSuccessResponse<T = unknown> extends BaseWorkerMessage {
  type: 'SUCCESS';
  taskType: WorkerTaskType;
  payload: T;
}

export interface WorkerErrorResponse extends BaseWorkerMessage {
  type: 'ERROR';
  taskType: WorkerTaskType;
  errorCode: string;
  errorMessage: string;
  suggestedFallback?: string;
}

export type WorkerResponse =
  | WorkerProgressEvent
  | WorkerSuccessResponse
  | WorkerErrorResponse;
