import { Result, Ok, Err, createAppError } from '@/domain/common/Result';

export interface AudioExtractionResult {
  durationUs: number;
  sampleRate: number;
  channels: number;
  rmsEnergy: Float32Array;
  speechSegments: { startUs: number; endUs: number; avgEnergy: number }[];
  audioBuffer: AudioBuffer;
}

/**
 * Extracts and decodes raw PCM audio from a local video file using Web Audio API.
 * 100% Local processing in browser.
 */
export async function extractAudioFromVideoFile(
  file: File
): Promise<Result<AudioExtractionResult>> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Decode audio track directly from MP4/WebM/MOV container
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

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

    // Close AudioContext to release resources per AGENTS.md safety rule
    await audioContext.close();

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
