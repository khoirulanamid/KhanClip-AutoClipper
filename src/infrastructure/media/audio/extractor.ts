import { Result, Ok, Err, createAppError } from '@/domain/common/Result';

export interface AudioExtractionResult {
  durationUs: number;
  sampleRate: number;
  channels: number;
  rmsEnergy: Float32Array;
  speechSegments: { startUs: number; endUs: number; avgEnergy: number }[];
  audioBuffer: AudioBuffer;
}

/** Optional stage/progress reporter so the UI can show the real extraction phase. */
export type AudioExtractionStage = (stageMessage: string, percent?: number) => void;

/**
 * Fallback decoder for containers that `decodeAudioData` cannot demux.
 * Plays the file muted in a hidden <video> element and records the output
 * stream in real time via captureStream(). Works on every device that can
 * play the file at all, regardless of codec/container quirks.
 */
function captureAudioViaPlayback(file: File, onStage?: AudioExtractionStage): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = url;
    video.muted = true; // mute only affects element output, not captureStream
    video.playsInline = true;
    video.preload = 'auto';

    const cleanup = (): void => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.remove();
    };

    video.onerror = (): void => {
      cleanup();
      reject(new Error('Browser tidak dapat memutar file ini (codec tidak didukung perangkat).'));
    };

    video.onloadedmetadata = (): void => {
      void (async () => {
        let ctx: AudioContext | null = null;
        let stream: MediaStream | null = null;
        try {
          const captureFn =
            (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream ??
            (video as HTMLVideoElement & { webkitCaptureStream?: () => MediaStream }).webkitCaptureStream;
          if (typeof captureFn !== 'function') {
            throw new Error('Peramban tidak mendukung perekaman audio dari elemen video.');
          }
          stream = captureFn.call(video);
          ctx = new AudioContext();
          await ctx.resume();

          const source = ctx.createMediaStreamSource(stream);
          const processor = ctx.createScriptProcessor(8192, 1, 1);
          const sink = ctx.createGain();
          sink.gain.value = 0; // never audible
          const chunks: Float32Array[] = [];
          let capturedSamples = 0;
          processor.onaudioprocess = (e: AudioProcessingEvent): void => {
            const data = e.inputBuffer.getChannelData(0);
            chunks.push(new Float32Array(data));
            capturedSamples += data.length;
          };
          source.connect(processor);
          processor.connect(sink);
          sink.connect(ctx.destination);

          const duration = video.duration;
          video.ontimeupdate = (): void => {
            if (Number.isFinite(duration) && duration > 0) {
              const pct = (video.currentTime / duration) * 100;
              onStage?.(
                `Dekode langsung tidak didukung container ini — merekam audio dari pemutaran: ${Math.round(pct)}%`,
                pct
              );
            }
          };
          video.onended = (): void => {
            void (async () => {
              const buffer = ctx!.createBuffer(1, capturedSamples, ctx!.sampleRate);
              const target = buffer.getChannelData(0);
              let offset = 0;
              for (const c of chunks) {
                target.set(c, offset);
                offset += c.length;
              }
              processor.disconnect();
              source.disconnect();
              sink.disconnect();
              stream?.getTracks().forEach((t) => t.stop());
              await ctx!.close();
              cleanup();
              resolve(buffer);
            })();
          };

          await video.play();
        } catch (err) {
          stream?.getTracks().forEach((t) => t.stop());
          await ctx?.close().catch(() => undefined);
          cleanup();
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      })();
    };
  });
}

/**
 * Extracts and decodes raw PCM audio from a local video file using Web Audio API.
 * Primary path: `decodeAudioData` on the container (fast).
 * Fallback path: real-time playback capture for containers the demuxer rejects.
 * 100% Local processing in browser.
 */
export async function extractAudioFromVideoFile(
  file: File,
  onStage?: AudioExtractionStage
): Promise<Result<AudioExtractionResult>> {
  try {
    let audioBuffer: AudioBuffer;
    try {
      onStage?.('Mendekode audio via Web Audio API...');
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      await audioContext.close();
    } catch {
      // Container/codec not demuxable directly; record from playback instead.
      audioBuffer = await captureAudioViaPlayback(file, onStage);
    }

    const durationUs = Math.round(audioBuffer.duration * 1000000);
    const sampleRate = audioBuffer.sampleRate;
    const channels = audioBuffer.numberOfChannels;

    // Calculate RMS Energy across time windows (100ms per window)
    const channelData = audioBuffer.getChannelData(0);
    const windowSize = Math.floor(sampleRate * 0.1); // 100ms
    const numWindows = Math.floor(channelData.length / windowSize);
    const rmsEnergy = new Float32Array(numWindows);

    let totalSquare = 0;
    for (let i = 0; i < numWindows; i++) {
      let sum = 0;
      const start = i * windowSize;
      for (let j = 0; j < windowSize; j++) {
        const sample = channelData[start + j];
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / windowSize);
      rmsEnergy[i] = rms;
      totalSquare += sum;
    }

    const overallRms = Math.sqrt(totalSquare / channelData.length);
    const threshold = Math.max(0.01, overallRms * 0.4);

    // Voice Activity Detection (VAD) to find speech segments
    const speechSegments: { startUs: number; endUs: number; avgEnergy: number }[] = [];
    let inSpeech = false;
    let speechStartWindow = 0;
    let accumulatedEnergy = 0;
    let windowCount = 0;

    for (let i = 0; i < numWindows; i++) {
      const energy = rmsEnergy[i];
      if (energy >= threshold) {
        if (!inSpeech) {
          inSpeech = true;
          speechStartWindow = i;
          accumulatedEnergy = 0;
          windowCount = 0;
        }
        accumulatedEnergy += energy;
        windowCount++;
      } else {
        if (inSpeech) {
          inSpeech = false;
          const startUs = Math.round((speechStartWindow * 0.1) * 1000000);
          const endUs = Math.round((i * 0.1) * 1000000);
          // Only segments longer than 1.5s
          if (endUs - startUs >= 1500000) {
            speechSegments.push({
              startUs,
              endUs,
              avgEnergy: accumulatedEnergy / windowCount,
            });
          }
        }
      }
    }

    if (inSpeech) {
      const startUs = Math.round((speechStartWindow * 0.1) * 1000000);
      const endUs = Math.round((numWindows * 0.1) * 1000000);
      if (endUs - startUs >= 1500000) {
        speechSegments.push({
          startUs,
          endUs,
          avgEnergy: accumulatedEnergy / windowCount,
        });
      }
    }

    return Ok({
      durationUs,
      sampleRate,
      channels,
      rmsEnergy,
      speechSegments,
      audioBuffer,
    });
  } catch (err: any) {
    return Err(
      createAppError('AUDIO_EXTRACTION_FAILED', `Gagal mengekstrak audio dari video: ${err?.message || 'Format tidak didukung'}`)
    );
  }
}
