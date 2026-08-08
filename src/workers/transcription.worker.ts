import { pipeline, env } from '@huggingface/transformers';
import { WorkerRequest, WorkerResponse } from './protocols/messages';
import {
  chunksToTranscriptDocument,
  mapLanguageToWhisper,
  pickWhisperModel,
  planTranscriptionRanges,
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
 * WebGPU (fast) -> WASM/CPU (universal). Runs on every device.
 */
async function createTranscriber(
  modelId: string,
  onDownloadProgress: (p: DownloadProgress) => void
): Promise<any> {
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
      return await pipeline('automatic-speech-recognition', modelId, {
        device: attempt.device,
        dtype: attempt.dtype,
        progress_callback: onDownloadProgress,
      } as any);
    } catch (err) {
      lastError = err; // fall through to WASM
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
): Promise<any> {
  if (transcriber && loadedModelId === modelId) return transcriber;

  if (transcriber && typeof transcriber.dispose === 'function') {
    await transcriber.dispose();
    transcriber = null;
  }

  let lastError: unknown = null;
  for (const host of MODEL_SOURCES) {
    env.remoteHost = host;
    try {
      transcriber = await createTranscriber(modelId, onDownloadProgress);
      loadedModelId = modelId;
      return transcriber;
    } catch (err) {
      lastError = err; // fall through to the mirror source
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
    const transcribeOptions = {
      return_timestamps: 'word',
      chunk_length_s: 30,
      stride_length_s: 5,
      ...(whisperLanguage ? { language: whisperLanguage, task: 'transcribe' } : {}),
    };

    // Transcribe speech ranges separately instead of one giant call: silence
    // is skipped, progress is visible per range, and each call stays bounded.
    // The pipeline expects the raw 16 kHz Float32Array directly; an object
    // wrapper ({ audio, sampling_rate }) is not unwrapped and crashes chunking.
    const audio = new Float32Array(msg.audioBuffer);
    const totalUs = Math.round((audio.length / msg.sampleRate) * 1_000_000);
    const ranges = planTranscriptionRanges(msg.speechSegments, totalUs);

    const allChunks: WhisperWordChunk[] = [];
    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i];
      const startSample = Math.floor((range.startUs / 1_000_000) * msg.sampleRate);
      const endSample = Math.min(audio.length, Math.ceil((range.endUs / 1_000_000) * msg.sampleRate));
      if (endSample <= startSample) continue;

      const offsetSec = startSample / msg.sampleRate;
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

      sendProgress(
        50 + Math.round(((i + 1) / ranges.length) * 45),
        `Mentranskripsi bagian ${i + 1}/${ranges.length} dengan Whisper lokal...`
      );
    }

    const doc = chunksToTranscriptDocument(allChunks, msg.projectId, msg.language, modelId);

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
