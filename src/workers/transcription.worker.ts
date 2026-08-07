import { pipeline, env } from '@huggingface/transformers';
import { WorkerRequest, WorkerResponse } from './protocols/messages';
import {
  chunksToTranscriptDocument,
  mapLanguageToWhisper,
  pickWhisperModel,
  WhisperWordChunk,
} from '@/infrastructure/media/transcription/whisper';

// Only fetch models from the Hugging Face hub (cached in browser after first download).
env.allowLocalModels = false;

interface DownloadProgress {
  status: string;
  file?: string;
  progress?: number;
}

// Pipeline instance is reused across requests; typed loosely because the
// library's union return type is awkward inside a worker.
let transcriber: any = null;
let loadedModelId = '';

const post = (message: WorkerResponse): void => {
  (self as unknown as Worker).postMessage(message);
};

/**
 * Creates the ASR pipeline with automatic device fallback:
 * WebGPU (fast) -> WASM/CPU (universal). Runs on every device.
 */
async function getTranscriber(
  modelId: string,
  onDownloadProgress: (p: DownloadProgress) => void
): Promise<any> {
  if (transcriber && loadedModelId === modelId) return transcriber;

  if (transcriber && typeof transcriber.dispose === 'function') {
    await transcriber.dispose();
    transcriber = null;
  }

  const hasWebGPU = typeof navigator !== 'undefined' && !!(navigator as any).gpu;
  const attempts: { device: 'webgpu' | 'wasm'; dtype: unknown }[] = hasWebGPU
    ? [
        { device: 'webgpu', dtype: { encoder_model: 'fp16', decoder_model_merged: 'q8' } },
        { device: 'wasm', dtype: 'q8' },
      ]
    : [{ device: 'wasm', dtype: 'q8' }];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      transcriber = await pipeline('automatic-speech-recognition', modelId, {
        device: attempt.device,
        dtype: attempt.dtype,
        progress_callback: onDownloadProgress,
      } as any);
      loadedModelId = modelId;
      return transcriber;
    } catch (err) {
      lastError = err; // fall through to WASM
    }
  }
  throw lastError;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type !== 'START_TRANSCRIPTION') return;

  const sendProgress = (percent: number, stageMessage: string): void => {
    post({
      id: msg.id,
      timestampUs: Date.now() * 1000,
      type: 'PROGRESS',
      taskType: 'TRANSCRIPTION',
      percent,
      stageMessage,
    });
  };

  try {
    const deviceMemoryGb = (navigator as any).deviceMemory as number | undefined;
    const modelId = pickWhisperModel(msg.modelProfile, deviceMemoryGb);

    sendProgress(5, 'Menyiapkan model Whisper lokal...');

    let lastPercent = 5;
    const transcribe = await getTranscriber(modelId, (p: DownloadProgress) => {
      if (p.status === 'initiate') {
        sendProgress(lastPercent, `Mengunduh model ${p.file ?? ''} (di-cache untuk pemakaian offline)...`);
      } else if (p.status === 'progress' && typeof p.progress === 'number') {
        const pct = Math.min(45, 5 + Math.round(p.progress * 0.4));
        if (pct > lastPercent) {
          lastPercent = pct;
          sendProgress(pct, `Mengunduh model ${p.file ?? ''}: ${Math.round(p.progress)}%`);
        }
      } else if (p.status === 'done') {
        sendProgress(Math.min(45, lastPercent + 1), 'Model siap digunakan.');
        lastPercent = Math.min(45, lastPercent + 1);
      }
    });

    sendProgress(50, 'Mentranskripsi audio dengan Whisper (sepenuhnya lokal)...');

    const whisperLanguage = mapLanguageToWhisper(msg.language);
    const output = await transcribe(
      { audio: new Float32Array(msg.audioBuffer), sampling_rate: msg.sampleRate },
      {
        return_timestamps: 'word',
        chunk_length_s: 30,
        stride_length_s: 5,
        ...(whisperLanguage ? { language: whisperLanguage, task: 'transcribe' } : {}),
      }
    );

    const chunks: WhisperWordChunk[] = output?.chunks ?? [];
    const doc = chunksToTranscriptDocument(chunks, msg.projectId, msg.language, modelId);

    sendProgress(100, 'Transkripsi selesai.');
    post({
      id: msg.id,
      timestampUs: Date.now() * 1000,
      type: 'SUCCESS',
      taskType: 'TRANSCRIPTION',
      payload: doc,
    });
  } catch (err: any) {
    post({
      id: msg.id,
      timestampUs: Date.now() * 1000,
      type: 'ERROR',
      taskType: 'TRANSCRIPTION',
      errorCode: 'WHISPER_FAILED',
      errorMessage: `Transkripsi Whisper gagal: ${err?.message || err}`,
      suggestedFallback:
        'Pastikan koneksi internet untuk unduhan model pertama kali (±41 MB, sekali saja). Setelah ter-cache, transkripsi berjalan offline. Coba jalankan ulang analisis.',
    });
  }
};
