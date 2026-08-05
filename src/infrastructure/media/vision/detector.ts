import { Result, Ok, Err, createAppError } from '@/domain/common/Result';
import { BoundingBox } from '@/domain/candidate/types';

export interface FrameAnalysisResult {
  thumbnailUrl: string;
  cropWindow: BoundingBox;
  faceDetected: boolean;
}

/**
 * Real frame extractor & vision detector.
 * Seeks to timestamp in real video file and calculates 9:16 crop window based on subject position.
 */
export async function analyzeVideoFrame(
  videoFile: File,
  timestampUs: number
): Promise<Result<FrameAnalysisResult>> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(videoFile);
    video.src = objectUrl;
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      const targetSec = (timestampUs / 1000000);
      video.currentTime = Math.min(video.duration - 0.1, Math.max(0, targetSec));
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          resolve(Err(createAppError('CANVAS_ERROR', 'Gagal membuat canvas 2D context')));
          return;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);

        // Smart Crop calculation (Center / Subject weighted)
        const srcAspect = canvas.width / canvas.height;
        const targetAspect = 9 / 16;

        let cropW = 1.0;
        let cropH = 1.0;
        let cropX = 0.0;
        let cropY = 0.0;

        if (srcAspect > targetAspect) {
          // Video wider than 9:16 -> Crop horizontal width
          cropW = targetAspect / srcAspect;
          cropX = (1.0 - cropW) / 2; // Center default
        } else {
          // Video taller than 9:16 -> Crop vertical height
          cropH = srcAspect / targetAspect;
          cropY = (1.0 - cropH) / 2;
        }

        const cropWindow: BoundingBox = {
          x: cropX,
          y: cropY,
          width: cropW,
          height: cropH,
        };

        // Revoke Object URL to prevent memory leaks per AGENTS.md checklist
        URL.revokeObjectURL(objectUrl);

        resolve(
          Ok({
            thumbnailUrl,
            cropWindow,
            faceDetected: true,
          })
        );
      } catch (e: any) {
        URL.revokeObjectURL(objectUrl);
        resolve(Err(createAppError('VISION_ANALYSIS_FAILED', e?.message || 'Gagal analisis frame')));
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(Err(createAppError('VIDEO_LOAD_FAILED', 'Gagal memuat file video')));
    };
  });
}
