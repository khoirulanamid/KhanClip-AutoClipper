import { pipeline, env } from '@huggingface/transformers';
import { WorkerRequest, WorkerResponse } from './protocols/messages';
import {
  mapLanguageToWhisper,
  pickWhisperModel,
  TranscriptionWorkerPayload,
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
let loadedBackend = '';

// Model download sources, tried in order. The Hugging Face hub is primary;
// hf-mirror.com is a full URL-compatible mirror used automatically when the
// hub is unreachable (some networks/regions block huggingface.co), so the
// app keeps working for everyone.
const MODEL_SOURCES = ['https://huggingface.co/', 'https://hf-mirror.com/'];

const post = (message: WorkerResponse): void => {
  (self as unknown as Worker).postMessage(message);
};

/**
 * Creates the ASR pipeline with automatic device fallback:
 * WebGPU fp16 (fastest) -> WebGPU fp32 (universal GPU) -> WASM/CPU (universal).
 * Runs on every device.
 */
async function createTranscriber(
  modelId: string,
  onDownloadProgress: (p: DownloadProgress) => void
): Promise<{ pipe: any; backend: string }> {
  const hasWebGPU = typeof navigator !== 'undefined' && !!(navigator as any).gpu;
  const attempts: { device: 'webgpu' | 'wasm'; dtype: unknown; backend: string }[] = hasWebGPU
    ? [
        { device: 'webgpu', dtype: { encoder_model: 'fp16', decoder_model_merged: 'q8' }, backend: 'WebGPU (fp16)' },
        { device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' }, backend: 'WebGPU (fp32)' },
        { device: 'wasm', dtype: 'q8', backend: 'WASM/CPU' },
      ]
    : [{ device: 'wasm', dtype: 'q8', backend: 'WASM/CPU' }];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const pipe = await pipeline('automatic-speech-recognition', modelId, {
        device: attempt.device,
        dtype: attempt.dtype,
        progress_callback: onDownloadProgress,
      } as any);
      return { pipe, backend: attempt.backend };
    } catch (err) {
      lastError = err; // fall through to the next backend
    }
  }
  throw lastError;
}

/**
 * Creates (or reuses) the pipeline, retrying across model download sources
 * so a blocked Hugging Face hub does not break transcription.
 */
async function getTranscriber(
  modelId: string,
  onDownloadProgress: (p: DownloadProgress) => void
): Promise<{ pipe: any; backend: string }> {
  if (transcriber && loadedModelId === modelId) return { pipe: transcriber, backend: loadedBackend };

  if (transcriber && typeof transcriber.dispose === 'function') {
    await transcriber.dispose();
    transcriber = null;
  }

  let lastError: unknown = null;
  for (const host of MODEL_SOURCES) {
    env.remoteHost = host;
    try {
      const created = await createTranscriber(modelId, onDownloadProgress);
      transcriber = created.pipe;
      loadedModelId = modelId;
      loadedBackend = created.backend;
      return created;
    } catch (err) {
      lastError = err; // fall through to the mirror source
    }
  }
  throw lastError;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type !== 'START_TRANSCRIPTION') return;

  const sendProgress = (
    percent: number,
    stageMessage: string,
    backendLabel?: string,
    completedRanges?: number,
    totalRanges?: number
  ): void => {
    post({
      id: msg.id,
      timestampUs: Date.now() * 1000,
      type: 'PROGRESS',
      taskType: 'TRANSCRIPTION',
      percent,
      stageMessage,
      backend: backendLabel,
      completedRanges,
      totalRanges,
    });
  };

  try {
    const deviceMemoryGb = (navigator as any).deviceMemory as number | undefined;
    const modelId = pickWhisperModel(msg.modelProfile, deviceMemoryGb);

    sendProgress(5, 'Menyiapkan model Whisper lokal...');

    let lastPercent = 5;
    const { pipe: transcribe, backend } = await getTranscriber(modelId, (p: DownloadProgress) => {
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

    sendProgress(50, `Model siap via ${backend}. Mentranskripsi audio dengan Whisper (sepenuhnya lokal)...`, backend, 0, msg.ranges.length);

    const whisperLanguage = mapLanguageToWhisper(msg.language);
    const transcribeOptions = {
      return_timestamps: 'word',
      chunk_length_s: 30,
      stride_length_s: 5,
      ...(whisperLanguage ? { language: whisperLanguage, task: 'transcribe' } : {}),
    };

    // This worker only owns its assigned shard: audioBuffer is the slice
    // starting at audioOffsetUs. The pipeline expects the raw 16 kHz
    // Float32Array directly; an object wrapper ({ audio, sampling_rate }) is
    // not unwrapped and crashes chunking.
    const audio = new Float32Array(msg.audioBuffer);
    const offsetUs = msg.audioOffsetUs;

    const allChunks: WhisperWordChunk[] = [];
    let completed = 0;
    for (const range of msg.ranges) {
      const startSample = Math.max(
        0,
        Math.min(audio.length, Math.floor(((range.startUs - offsetUs) / 1_000_000) * msg.sampleRate))
      );
      const endSample = Math.max(
        startSample,
        Math.min(audio.length, Math.ceil(((range.endUs - offsetUs) / 1_000_000) * msg.sampleRate))
      );
      if (endSample <= startSample) {
        completed++;
        continue;
      }

      const offsetSec = offsetUs / 1_000_000 + startSample / msg.sampleRate;
      const output = await transcribe(audio.subarray(startSample, endSample), transcribeOptions);

      for (const chunk of (output?.chunks ?? []) as WhisperWordChunk[]) {
        const [startSec, endSec] = chunk.timestamp ?? [null, null];
        allChunks.push({
          text: chunk.text,
          timestamp: [
            startSec == null ? null : startSec + offsetSec,
            endSec == null ? null : endSec + offsetSec,
          ],
        });
      }

      completed++;
      sendProgress(
        50 + Math.round((completed / msg.ranges.length) * 45),
        `Mentranskripsi bagian ${completed}/${msg.ranges.length} dengan Whisper lokal...`,
        backend,
        completed,
        msg.ranges.length
      );
    }

    sendProgress(100, 'Transkripsi selesai.', backend, completed, msg.ranges.length);
    const payload: TranscriptionWorkerPayload = { chunks: allChunks, modelId, backend };
    post({
      id: msg.id,
      timestampUs: Date.now() * 1000,
      type: 'SUCCESS',
      taskType: 'TRANSCRIPTION',
      payload,
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
