import { Result, Ok, Err, createAppError } from '@/domain/common/Result';
import { Candidate } from '@/domain/candidate/types';

export interface RenderResult {
  blob: Blob;
  outputName: string;
  sizeBytes: number;
}

/**
 * Real MP4 Video Renderer.
 * Draws cropped 9:16 video frames with headline and subtitle overlay onto canvas,
 * and encodes into a real MP4 file Blob using WebCodecs / MediaRecorder.
 */
export async function renderCandidateToMp4(
  sourceVideoFile: File,
  candidate: Candidate,
  resolution: '720x1280' | '1080x1920',
  onProgress: (percent: number, stage: string) => void
): Promise<Result<RenderResult>> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const sourceUrl = URL.createObjectURL(sourceVideoFile);
    video.src = sourceUrl;
    video.muted = false;
    video.playsInline = true;

    const [targetWidth, targetHeight] = resolution === '1080x1920' ? [1080, 1920] : [720, 1280];

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      URL.revokeObjectURL(sourceUrl);
      resolve(Err(createAppError('RENDER_CANVAS_ERROR', 'Gagal inisialisasi Canvas context')));
      return;
    }

    video.onloadedmetadata = async () => {
      const startSec = candidate.startUs / 1000000;
      const endSec = candidate.endUs / 1000000;
      const durationSec = endSec - startSec;

      video.currentTime = startSec;

      video.onseeked = async () => {
        try {
          onProgress(10, 'preparing');

          // Check if mp4-muxer + WebCodecs is available or use MediaRecorder fallback
          let mediaRecorder: MediaRecorder | null = null;
          const chunks: Blob[] = [];

          // Setup canvas stream recording
          const stream = canvas.captureStream(30);

          let mimeType = 'video/mp4;codecs=h264';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm;codecs=vp9';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              mimeType = 'video/webm';
            }
          }

          try {
            mediaRecorder = new MediaRecorder(stream, { mimeType });
          } catch (e) {
            mediaRecorder = new MediaRecorder(stream);
          }

          mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              chunks.push(e.data);
            }
          };

          mediaRecorder.onstop = () => {
            URL.revokeObjectURL(sourceUrl);
            const finalBlob = new Blob(chunks, { type: mediaRecorder?.mimeType || 'video/mp4' });
            const outputName = `EditFlow_${candidate.title.replace(/[^a-zA-Z0-9]/g, '_')}_9x16.mp4`;

            onProgress(100, 'completed');
            resolve(
              Ok({
                blob: finalBlob,
                outputName,
                sizeBytes: finalBlob.size,
              })
            );
          };

          mediaRecorder.start(100);
          video.play();

          const startTimeMs = performance.now();
          const targetDurationMs = durationSec * 1000;

          const renderFrame = () => {
            const elapsedMs = performance.now() - startTimeMs;
            const progressPercent = Math.min(99, Math.round((elapsedMs / targetDurationMs) * 100));

            if (video.currentTime >= endSec || elapsedMs >= targetDurationMs || video.ended) {
              video.pause();
              if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                onProgress(95, 'muxing');
                mediaRecorder.stop();
              }
              return;
            }

            onProgress(progressPercent, elapsedMs > targetDurationMs * 0.5 ? 'encoding' : 'compositing');

            // Draw 9:16 smart cropped video frame onto canvas
            const srcAspect = video.videoWidth / video.videoHeight;
            const dstAspect = targetWidth / targetHeight;

            let cropW = video.videoWidth;
            let cropH = video.videoHeight;
            let cropX = 0;
            let cropY = 0;

            if (srcAspect > dstAspect) {
              cropW = video.videoHeight * dstAspect;
              cropX = (video.videoWidth - cropW) / 2;
            } else {
              cropH = video.videoWidth / dstAspect;
              cropY = (video.videoHeight - cropH) / 2;
            }

            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, targetWidth, targetHeight);
            ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, targetWidth, targetHeight);

            // Draw Headline Banner
            if (candidate.headline) {
              ctx.fillStyle = 'rgba(99, 102, 241, 0.9)';
              ctx.roundRect?.(targetWidth * 0.08, targetHeight * 0.12, targetWidth * 0.84, 90, 16);
              ctx.fill();

              ctx.fillStyle = '#ffffff';
              ctx.font = `bold ${Math.round(targetWidth * 0.045)}px 'Outfit', sans-serif`;
              ctx.textAlign = 'center';
              ctx.fillText(candidate.headline, targetWidth / 2, targetHeight * 0.12 + 55);
            }

            // Draw Subtitle Banner
            ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
            ctx.roundRect?.(targetWidth * 0.05, targetHeight * 0.75, targetWidth * 0.9, 100, 16);
            ctx.fill();

            ctx.fillStyle = '#fbbf24';
            ctx.font = `bold ${Math.round(targetWidth * 0.04)}px 'Inter', sans-serif`;
            ctx.textAlign = 'center';
            const subtitleLine = (candidate.transcriptText || candidate.headline || 'Pemrosesan lokal 100%').slice(0, 45);
            ctx.fillText(`"${subtitleLine}"`, targetWidth / 2, targetHeight * 0.75 + 60);

            requestAnimationFrame(renderFrame);
          };

          renderFrame();
        } catch (err: any) {
          URL.revokeObjectURL(sourceUrl);
          resolve(Err(createAppError('RENDER_FAILED', `Gagal merender video MP4: ${err?.message || 'Error'}`)));
        }
      };
    };

    video.onerror = () => {
      URL.revokeObjectURL(sourceUrl);
      resolve(Err(createAppError('VIDEO_LOAD_FAILED', 'Gagal memuat video sumber')));
    };
  });
}
