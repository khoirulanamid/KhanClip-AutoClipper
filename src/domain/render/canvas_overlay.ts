import { SubtitleCue, SubtitleWord } from '@/domain/transcript/types';

export type SubtitlePresetStyle =
  | 'kinetic'
  | 'clean_bold'
  | 'podcast_premium'
  | 'alex_style'
  | 'editorial_elegant';

export interface OverlayRenderOptions {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  headlineText: string;
  activeCue: SubtitleCue | null;
  activeWord: SubtitleWord | null;
  presetStyle: SubtitlePresetStyle;
  showSafeArea?: boolean;
}

/**
 * Split text into max 2 lines with max characters per line
 */
export function wrapTextIntoLines(text: string, maxCharsPerLine = 40): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
      if (lines.length >= 1) break; // Limit to max 2 lines
    }
  }
  if (currentLine && lines.length < 2) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Professional Canvas Overlay Renderer for 9:16 Video Canvas.
 * Scales dynamically based on canvas.width / 1080 for 100% parity between 360x640 Preview & 1080x1920 Render.
 */
export function renderCanvasOverlays(options: OverlayRenderOptions): void {
  const { canvas, ctx, headlineText, activeCue, activeWord, presetStyle } = options;
  const scale = canvas.width / 1080;

  // 1. Render Top Headline Teaser Box (Hook Title)
  if (headlineText && headlineText.trim()) {
    const headScaleFont = Math.round(44 * scale);
    const headPaddingY = Math.round(14 * scale);
    const headRadius = Math.round(16 * scale);

    ctx.save();
    ctx.font = `800 ${headScaleFont}px 'Poppins', 'Outfit', sans-serif`;
    ctx.textAlign = 'center';

    const cleanHead = headlineText.toUpperCase();
    const headBoxWidth = canvas.width * 0.82;
    const headBoxX = (canvas.width - headBoxWidth) / 2;
    const headBoxY = canvas.height * 0.06;

    // Gradient Purple-Indigo Background
    const headGrad = ctx.createLinearGradient(0, headBoxY, 0, headBoxY + headScaleFont * 1.8);
    headGrad.addColorStop(0, '#6d6eff');
    headGrad.addColorStop(1, '#5a5cf0');

    ctx.fillStyle = headGrad;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 10 * scale;
    ctx.beginPath();
    ctx.roundRect(headBoxX, headBoxY, headBoxWidth, headScaleFont * 1.6 + headPaddingY, headRadius);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Headline Text (White)
    ctx.fillStyle = '#ffffff';
    ctx.fillText(cleanHead, canvas.width / 2, headBoxY + headScaleFont * 1.1);
    ctx.restore();
  }

  // 2. Render Bottom Subtitle Box (Spoken Voice Text)
  if (activeCue && activeCue.text && activeCue.text.trim()) {
    ctx.save();

    const subScaleFont = Math.round(38 * scale);
    const kwScaleFont = Math.round(44 * scale);
    const boxWidth = canvas.width * 0.84;
    const boxX = (canvas.width - boxWidth) / 2;
    const boxY = canvas.height * 0.76;

    const lines = wrapTextIntoLines(activeCue.text, 38);
    const boxHeight = lines.length > 1 ? Math.round(110 * scale) : Math.round(76 * scale);

    // Apply Presets
    if (presetStyle === 'clean_bold') {
      // Opsi A: Clean Bold (No Box, Outline & Shadow)
      ctx.textAlign = 'center';
      ctx.font = `700 ${subScaleFont}px 'Inter', 'Poppins', sans-serif`;

      lines.forEach((line, idx) => {
        const lineY = boxY + (idx + 1) * (subScaleFont * 1.2);
        // Stroke
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.lineWidth = 6 * scale;
        ctx.strokeText(line, canvas.width / 2, lineY);
        // Fill
        ctx.fillStyle = '#ffffff';
        ctx.fillText(line, canvas.width / 2, lineY);
      });
    } else if (presetStyle === 'podcast_premium') {
      // Dark Glass Luxury Box
      ctx.fillStyle = 'rgba(8, 12, 20, 0.72)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1 * scale;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 12 * scale;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 18 * scale);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.textAlign = 'center';
      ctx.font = `700 ${subScaleFont}px 'Inter', sans-serif`;
      ctx.fillStyle = '#ffffff';

      lines.forEach((line, idx) => {
        const lineY = boxY + Math.round(40 * scale) + idx * Math.round(42 * scale);
        ctx.fillText(line, canvas.width / 2, lineY);
      });
    } else if (presetStyle === 'alex_style') {
      // Alex Hormozi Style (Bold Yellow Accent, Clean Border)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxWidth, boxHeight + Math.round(20 * scale), 14 * scale);
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.font = `800 ${subScaleFont}px 'Montserrat', 'Inter', sans-serif`;
      ctx.fillStyle = '#ffffff';

      lines.forEach((line, idx) => {
        const lineY = boxY + Math.round(38 * scale) + idx * Math.round(40 * scale);
        ctx.fillText(line, canvas.width / 2, lineY);
      });

      if (activeWord) {
        ctx.fillStyle = '#FFD54A';
        ctx.font = `900 ${kwScaleFont}px 'Montserrat', sans-serif`;
        ctx.fillText(activeWord.text.toUpperCase(), canvas.width / 2, boxY + boxHeight + Math.round(12 * scale));
      }
    } else {
      // Kinetic Modern (Default: Glass Box + Gold Accent)
      ctx.fillStyle = 'rgba(8, 12, 20, 0.65)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1 * scale;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 10 * scale;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxWidth, boxHeight + (activeWord ? Math.round(28 * scale) : 0), 20 * scale);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.textAlign = 'center';
      ctx.font = `700 ${subScaleFont}px 'Inter', 'Poppins', sans-serif`;
      ctx.fillStyle = '#f8fafc';

      lines.forEach((line, idx) => {
        const lineY = boxY + Math.round(36 * scale) + idx * Math.round(40 * scale);
        // Subtle Stroke
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 2 * scale;
        ctx.strokeText(line, canvas.width / 2, lineY);
        ctx.fillText(line, canvas.width / 2, lineY);
      });

      // Active Word Gold Badge
      if (activeWord) {
        ctx.fillStyle = '#FFD54A';
        ctx.font = `800 ${kwScaleFont}px 'Outfit', 'Poppins', sans-serif`;
        const kwY = boxY + boxHeight + Math.round(20 * scale);
        ctx.fillText(`👉 ${activeWord.text.toUpperCase()} 👈`, canvas.width / 2, kwY);
      }
    }

    ctx.restore();
  }
}
