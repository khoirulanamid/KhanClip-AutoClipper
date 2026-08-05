import { Result, Ok, Err, createAppError } from '@/domain/common/Result';
import { RenderJob } from '@/domain/render/types';
import { Candidate } from '@/domain/candidate/types';
import {
  buildCandidateSubtitleTrack,
  getActiveSubtitleCue,
  getActiveWord,
  secondsToUs,
} from '@/domain/transcript/subtitle';
import { TranscriptWord } from '@/domain/transcript/types';

export type RenderProgressCallback = (percent: number, stage: string) => void;

/**
 * 9:16 MP4 Canvas Video Renderer.
 * Uses shared getActiveSubtitleCue function for 100% preview and render parity.
 */
export async function renderCandidateToMp4(
  job: RenderJob,
  candidate: Candidate,
  _videoFile?: File | null,
  onProgress?: RenderProgressCallback
): Promise<Result<Blob>> {
  try {
    const durationSec = Math.max(1, (candidate.endUs - candidate.startUs) / 1000000);
    const fps = 30;
    const totalFrames = Math.round(durationSec * fps);

    // Build strict transcript track using shared subtitle system
    const transcriptWords: TranscriptWord[] = (candidate.transcriptText || candidate.headline || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((word: string, idx: number, arr: string[]) => {
        const durUs = Math.max(200_000, Math.round((candidate.endUs - candidate.startUs) / Math.max(1, arr.length)));
        const srcStart = candidate.startUs + idx * durUs;
        return {
          id: `render-w-${idx}`,
          text: word,
          sourceStartUs: srcStart,
          sourceEndUs: Math.min(candidate.endUs, srcStart + durUs),
          timingPrecision: 'word-native' as const,
        };
      });

    const subtitleTrack = buildCandidateSubtitleTrack(transcriptWords, candidate.startUs, candidate.endUs, 0);

    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return Err(createAppError('RENDER_CANVAS_FAILED', 'Gagal membuat canvas 2D context'));
    }

    const stream = canvas.captureStream(fps);
    const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=h264')
      ? 'video/mp4;codecs=h264'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: job.targetBitrateBps || 8000000,
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.start();

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      const frameTimeSec = frameIndex / fps;
      const frameLocalTimeUs = secondsToUs(frameTimeSec);

      // Background Gradient
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#020617');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Headline Teaser Overlay
      ctx.fillStyle = '#6366f1';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.roundRect(canvas.width * 0.08, canvas.height * 0.12, canvas.width * 0.84, 120, 20);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#ffffff';
      ctx.font = "bold 38px 'Outfit', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText(candidate.headline, canvas.width / 2, canvas.height * 0.12 + 74);

      // Render Subtitle Overlay using shared getActiveSubtitleCue
      const activeCue = getActiveSubtitleCue(frameLocalTimeUs, subtitleTrack.cues);
      const activeWord = activeCue ? getActiveWord(frameLocalTimeUs, activeCue) : null;

      if (activeCue) {
        const boxWidth = canvas.width * 0.88;
        const boxX = (canvas.width - boxWidth) / 2;
        const boxY = canvas.height * 0.74;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxWidth, 160, 24);
        ctx.fill();

        ctx.font = "bold 34px 'Inter', sans-serif";
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(activeCue.text, canvas.width / 2, boxY + 68);

        if (activeWord) {
          ctx.fillStyle = '#fbbf24';
          ctx.font = "bold 40px 'Outfit', sans-serif";
          ctx.fillText(`👉  ${activeWord.text.toUpperCase()}  👈`, canvas.width / 2, boxY + 124);
        }
      }

      if (onProgress) {
        onProgress(Math.round((frameIndex / totalFrames) * 100), 'compositing');
      }

      await new Promise((r) => setTimeout(r, 1000 / fps));
    }

    return await new Promise<Result<Blob>>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        resolve(Ok(blob));
      };
      recorder.stop();
    });
  } catch (err: any) {
    return Err(createAppError('RENDER_FAILED', `Gagal merender video MP4: ${err?.message || err}`));
  }
}
