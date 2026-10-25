import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

type ExportState = 'idle' | 'exporting' | 'done' | 'error';
type PreviewState = 'idle' | 'loading' | 'playing';
type ConnectionState = 'idle' | 'testing' | 'success' | 'error';

interface SttSettings {
  baseUrl: string;
  apiKey: string;
  apiFormat: 'browser-whisper' | 'openai' | 'gemini' | 'custom';
  provider: string;
  model: string;
  language: string;
  timestamps: 'segment' | 'word';
}

interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export type SubtitlePreset = 'tiktok-yellow' | 'capsule-dark' | 'clean-cinema' | 'neon-cyan' | 'fire-red';
export type SubtitlePosition = 'bottom' | 'center' | 'top';
export type SubtitleSize = 'normal' | 'large' | 'huge';

export interface SubtitleStyleSettings {
  preset: SubtitlePreset;
  position: SubtitlePosition;
  posY: number;
  posX: number;
  size: SubtitleSize;
  uppercase: boolean;
}

const DEFAULT_SUBTITLE_STYLE: SubtitleStyleSettings = {
  preset: 'tiktok-yellow',
  position: 'bottom',
  posY: 0.78,
  posX: 0.50,
  size: 'normal',
  uppercase: true,
};

export type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

export interface WatermarkSettings {
  enabled: boolean;
  text: string;
  position: WatermarkPosition;
  opacity: number;
  size: 'small' | 'medium' | 'large';
}

const DEFAULT_WATERMARK_STYLE: WatermarkSettings = {
  enabled: false,
  text: '@khanclip',
  position: 'top-right',
  opacity: 0.8,
  size: 'medium',
};

const DEFAULT_STT_SETTINGS: SttSettings = {
  baseUrl: '',
  apiKey: '',
  apiFormat: 'browser-whisper',
  provider: 'Whisper Web (Bebas API Key)',
  model: 'Xenova/whisper-tiny',
  language: 'id',
  timestamps: 'segment',
};

const STT_PROVIDER_SUGGESTIONS = ['Gemini', 'OpenAI', 'Groq', 'OpenRouter', '9Router', 'Deepgram', 'AssemblyAI', 'Hugging Face', 'NVIDIA Parakeet'];

const MEDIAPIPE_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const FACE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;
const OUTPUT_VIDEO_BITRATE = 16_000_000;
const OUTPUT_AUDIO_BITRATE = 192_000;

const createFaceLandmarker = async () => {
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
  const options = {
    baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'GPU' as const },
    runningMode: 'VIDEO' as const,
    numFaces: 4,
    outputFaceBlendshapes: true,
    minFaceDetectionConfidence: 0.45,
    minFacePresenceConfidence: 0.45,
    minTrackingConfidence: 0.45,
  };

  try {
    return await FaceLandmarker.createFromOptions(vision, options);
  } catch {
    return FaceLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'CPU' as const },
    });
  }
};

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const centis = Math.floor((safe % 1) * 100);
  return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getSharpPortraitSize = (sourceWidth: number, sourceHeight: number) => {
  const targetAspect = 9 / 16;
  const sourceAspect = sourceWidth / sourceHeight;

  if (sourceAspect > targetAspect) {
    const height = Math.max(2, Math.floor(Math.min(OUTPUT_HEIGHT, sourceHeight) / 2) * 2);
    const width = Math.max(2, Math.floor((height * targetAspect) / 2) * 2);
    return { width, height };
  }

  const width = Math.max(2, Math.floor(Math.min(OUTPUT_WIDTH, sourceWidth) / 2) * 2);
  const height = Math.max(2, Math.floor((width / targetAspect) / 2) * 2);
  return { width, height };
};

const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(new Error('Audio gagal dibaca.'));
  reader.readAsDataURL(blob);
});

const drawSubtitle = (
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  cue?: SubtitleCue,
  styleSettings: SubtitleStyleSettings = DEFAULT_SUBTITLE_STYLE
) => {
  if (!cue?.text.trim()) return;

  // Base font size scaling
  let sizeMultiplier = 0.052;
  if (styleSettings.size === 'large') sizeMultiplier = 0.064;
  if (styleSettings.size === 'huge') sizeMultiplier = 0.076;
  const fontSize = Math.max(22, Math.round(canvas.width * sizeMultiplier));
  const maxWidth = canvas.width * 0.86;

  let rawText = cue.text.trim();
  if (styleSettings.uppercase) {
    rawText = rawText.toUpperCase();
  }

  context.save();
  const fontFam = styleSettings.preset === 'tiktok-yellow'
    ? '"Plus Jakarta Sans", "Impact", "Inter", sans-serif'
    : '"Plus Jakarta Sans", "Inter", sans-serif';
  context.font = `800 ${fontSize}px ${fontFam}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  const words = rawText.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  const visibleLines = lines.slice(0, 3);
  const lineHeight = fontSize * 1.25;
  const totalTextHeight = visibleLines.length * lineHeight;

  // Position (Free placement anywhere on canvas)
  const centerY = styleSettings.posY !== undefined
    ? canvas.height * styleSettings.posY
    : (styleSettings.position === 'center' ? canvas.height * 0.52 : (styleSettings.position === 'top' ? canvas.height * 0.28 : canvas.height * 0.78));

  const centerX = styleSettings.posX !== undefined
    ? canvas.width * styleSettings.posX
    : canvas.width / 2;

  // 1. Preset: Capsule Dark
  if (styleSettings.preset === 'capsule-dark') {
    const boxHeight = totalTextHeight + fontSize * 0.75;
    const boxWidth = Math.min(canvas.width * 0.90, Math.max(...visibleLines.map((l) => context.measureText(l).width)) + fontSize * 1.4);
    context.fillStyle = 'rgba(15, 17, 21, 0.78)';
    context.beginPath();
    context.roundRect(centerX - boxWidth / 2, centerY - boxHeight / 2, boxWidth, boxHeight, fontSize * 0.35);
    context.fill();

    context.fillStyle = '#ffffff';
    visibleLines.forEach((text, index) => {
      context.fillText(text, centerX, centerY + (index - (visibleLines.length - 1) / 2) * lineHeight);
    });
  }

  // 2. Preset: TikTok Yellow (Hormozi / Viral Pop)
  else if (styleSettings.preset === 'tiktok-yellow') {
    visibleLines.forEach((text, index) => {
      const lineY = centerY + (index - (visibleLines.length - 1) / 2) * lineHeight;

      // Heavy black stroke
      context.strokeStyle = '#000000';
      context.lineWidth = Math.max(5, fontSize * 0.18);
      context.lineJoin = 'miter';
      context.miterLimit = 2;
      context.strokeText(text, centerX, lineY);

      // Bright yellow fill
      context.fillStyle = '#FFE600';
      context.fillText(text, centerX, lineY);
    });
  }

  // 3. Preset: Clean Cinema (Pure White with Deep Shadow)
  else if (styleSettings.preset === 'clean-cinema') {
    context.shadowColor = 'rgba(0, 0, 0, 0.85)';
    context.shadowBlur = 12;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 4;

    visibleLines.forEach((text, index) => {
      const lineY = centerY + (index - (visibleLines.length - 1) / 2) * lineHeight;
      context.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      context.lineWidth = Math.max(3, fontSize * 0.08);
      context.strokeText(text, centerX, lineY);

      context.fillStyle = '#FFFFFF';
      context.fillText(text, centerX, lineY);
    });
  }

  // 4. Preset: Cyber Neon (Cyan Glowing Text)
  else if (styleSettings.preset === 'neon-cyan') {
    visibleLines.forEach((text, index) => {
      const lineY = centerY + (index - (visibleLines.length - 1) / 2) * lineHeight;

      context.strokeStyle = '#000000';
      context.lineWidth = Math.max(4, fontSize * 0.16);
      context.strokeText(text, centerX, lineY);

      context.fillStyle = '#00F0FF';
      context.shadowColor = 'rgba(0, 240, 255, 0.7)';
      context.shadowBlur = 15;
      context.fillText(text, centerX, lineY);
    });
  }

  // 5. Preset: Fire Red (High Alert Box)
  else if (styleSettings.preset === 'fire-red') {
    const boxHeight = totalTextHeight + fontSize * 0.7;
    const boxWidth = Math.min(canvas.width * 0.90, Math.max(...visibleLines.map((l) => context.measureText(l).width)) + fontSize * 1.3);
    context.fillStyle = '#DC2626';
    context.beginPath();
    context.roundRect(centerX - boxWidth / 2, centerY - boxHeight / 2, boxWidth, boxHeight, 8);
    context.fill();

    context.fillStyle = '#FFFFFF';
    visibleLines.forEach((text, index) => {
      context.fillText(text, centerX, centerY + (index - (visibleLines.length - 1) / 2) * lineHeight);
    });
  }

  context.restore();
};

const drawWatermark = (
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  watermark: WatermarkSettings = DEFAULT_WATERMARK_STYLE
) => {
  if (!watermark.enabled || !watermark.text.trim()) return;

  context.save();
  let fontSize = Math.max(18, Math.round(canvas.width * 0.034));
  if (watermark.size === 'small') fontSize = Math.max(14, Math.round(canvas.width * 0.024));
  if (watermark.size === 'large') fontSize = Math.max(24, Math.round(canvas.width * 0.046));

  context.font = `700 ${fontSize}px "Plus Jakarta Sans", "Inter", sans-serif`;
  context.textBaseline = 'middle';
  context.fillStyle = `rgba(255, 255, 255, ${watermark.opacity})`;
  context.shadowColor = 'rgba(0, 0, 0, 0.75)';
  context.shadowBlur = 8;
  context.shadowOffsetX = 1;
  context.shadowOffsetY = 1;

  const marginX = canvas.width * 0.06;
  const marginY = canvas.height * 0.05;

  let x = canvas.width - marginX;
  let y = marginY;
  context.textAlign = 'right';

  if (watermark.position === 'top-left') {
    x = marginX;
    y = marginY;
    context.textAlign = 'left';
  } else if (watermark.position === 'top-right') {
    x = canvas.width - marginX;
    y = marginY;
    context.textAlign = 'right';
  } else if (watermark.position === 'bottom-left') {
    x = marginX;
    y = canvas.height - marginY;
    context.textAlign = 'left';
  } else if (watermark.position === 'bottom-right') {
    x = canvas.width - marginX;
    y = canvas.height - marginY;
    context.textAlign = 'right';
  } else if (watermark.position === 'center') {
    x = canvas.width / 2;
    y = canvas.height / 2;
    context.textAlign = 'center';
  }

  context.fillText(watermark.text.trim(), x, y);
  context.restore();
};

const ExpandIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
  </svg>
);

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="6" y="4" width="4" height="16" fill="currentColor" />
    <rect x="14" y="4" width="4" height="16" fill="currentColor" />
  </svg>
);

const MoveIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <polyline points="5 9 2 12 5 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="9 5 12 2 15 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="15 19 12 22 9 19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="19 9 22 12 19 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const TagIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="7" cy="7" r="1.5" fill="currentColor" />
  </svg>
);

const FilmIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M17 9h4M3 15h4M17 15h4"/></svg>
);

const UploadIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>
);

const ScissorsIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="m8.7 8.3 11.3 8.2M8.7 15.7 20 7.5"/></svg>
);

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56V20.3h-3v-.08a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.56-1.04H5.3v-3h.14A1.7 1.7 0 0 0 7 9.92a1.7 1.7 0 0 0-.34-1.88L6.6 7.98l2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 11.7 4.7v-.08h3v.08a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.04h.08v3h-.08A1.7 1.7 0 0 0 19.4 15Z"/></svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
);

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
);

let cachedWhisperTranscriber: any = null;
let currentWhisperModel = '';

const getBrowserWhisper = async (modelName: string, onProgress: (msg: string) => void) => {
  if (cachedWhisperTranscriber && currentWhisperModel === modelName) {
    return cachedWhisperTranscriber;
  }

  currentWhisperModel = modelName;
  onProgress('Menyiapkan engine Whisper AI di browser…');
  // @ts-ignore
  const { pipeline, env } = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js');
  env.allowRemoteModels = true;
  env.allowLocalModels = false;

  cachedWhisperTranscriber = await pipeline('automatic-speech-recognition', modelName, {
    progress_callback: (item: any) => {
      if (item.status === 'progress') {
        const f = (item.file || '').replace(/^onnx\//, '');
        onProgress(`Mengunduh model: ${f} ${Math.round(item.progress || 0)}%`);
      } else if (item.status === 'ready') {
        onProgress('Model Whisper siap di browser!');
      }
    }
  });

  return cachedWhisperTranscriber;
};

export const App: React.FC = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const previewAnimationRef = useRef<number | null>(null);
  const previewFocusRef = useRef({ x: 0.5, y: 0.44, frame: 0 });
  const cancelExportRef = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [clipDuration, setClipDuration] = useState(30);
  const [dragging, setDragging] = useState(false);
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [exportLabel, setExportLabel] = useState('Menyiapkan video…');
  const [previewState, setPreviewState] = useState<PreviewState>('idle');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [verifiedSettingsKey, setVerifiedSettingsKey] = useState('');
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [subtitleStatus, setSubtitleStatus] = useState('');
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioTab, setStudioTab] = useState<'subtitles' | 'position' | 'watermark'>('subtitles');
  const [currentTimeProgress, setCurrentTimeProgress] = useState(0);
  const studioCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingSubtitle = useRef(false);

  const [watermarkStyle, setWatermarkStyle] = useState<WatermarkSettings>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('khanclip-watermark-style') || '{}');
      return { ...DEFAULT_WATERMARK_STYLE, ...saved };
    } catch {
      return DEFAULT_WATERMARK_STYLE;
    }
  });

  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyleSettings>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('khanclip-subtitle-style') || '{}');
      return { ...DEFAULT_SUBTITLE_STYLE, ...saved };
    } catch {
      return DEFAULT_SUBTITLE_STYLE;
    }
  });

  const redrawCurrentPreviewFrame = (
    style = subtitleStyle,
    wm = watermarkStyle,
    cues = subtitleCues
  ) => {
    const video = videoRef.current;
    if (!video || video.readyState < 1) return;

    const render = (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';

      const focus = previewFocusRef.current;
      const targetAspect = 9 / 16;
      const sourceAspect = video.videoWidth / video.videoHeight;
      let sourceWidth = video.videoWidth;
      let sourceHeight = video.videoHeight;
      if (sourceAspect > targetAspect) sourceWidth = sourceHeight * targetAspect;
      else sourceHeight = sourceWidth / targetAspect;
      const sourceX = clamp(focus.x * video.videoWidth - sourceWidth / 2, 0, video.videoWidth - sourceWidth);
      const sourceY = clamp(focus.y * video.videoHeight - sourceHeight / 2, 0, video.videoHeight - sourceHeight);
      context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);

      const localTime = Math.max(0, video.currentTime - start);
      const activeCue = cues.find((cue) => localTime >= cue.start && localTime < cue.end)
        || (cues.length ? cues[0] : { start: 0, end: 10, text: 'Contoh Gaya Subtitle' });

      drawSubtitle(context, canvas, activeCue, style);
      drawWatermark(context, canvas, wm);
    };

    render(previewCanvasRef.current);
    render(studioCanvasRef.current);
  };

  const updateSubtitleStyle = (next: Partial<SubtitleStyleSettings>) => {
    setSubtitleStyle((prev) => {
      const updated = { ...prev, ...next };
      localStorage.setItem('khanclip-subtitle-style', JSON.stringify(updated));
      setTimeout(() => redrawCurrentPreviewFrame(updated, watermarkStyle, subtitleCues), 10);
      return updated;
    });
  };

  const updateWatermarkStyle = (next: Partial<WatermarkSettings>) => {
    setWatermarkStyle((prev) => {
      const updated = { ...prev, ...next };
      localStorage.setItem('khanclip-watermark-style', JSON.stringify(updated));
      setTimeout(() => redrawCurrentPreviewFrame(subtitleStyle, updated, subtitleCues), 10);
      return updated;
    });
  };

  const updateCue = (index: number, next: Partial<SubtitleCue>) => {
    setSubtitleCues((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], ...next };
      }
      setTimeout(() => redrawCurrentPreviewFrame(subtitleStyle, watermarkStyle, updated), 10);
      return updated;
    });
  };

  const deleteCue = (index: number) => {
    setSubtitleCues((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      setTimeout(() => redrawCurrentPreviewFrame(subtitleStyle, watermarkStyle, updated), 10);
      return updated;
    });
  };

  const handleAddSubtitleLine = () => {
    const video = videoRef.current;
    const currentT = video ? Math.max(0, video.currentTime - start) : 0;
    const newStart = Math.round(currentT * 10) / 10;
    const newEnd = Math.round(Math.min(actualDuration, newStart + 2.5) * 10) / 10;

    setSubtitleCues((prev) => {
      const updated = [...prev, { start: newStart, end: newEnd, text: 'Teks Subtitle Baru' }];
      updated.sort((a, b) => a.start - b.start);
      setTimeout(() => redrawCurrentPreviewFrame(subtitleStyle, watermarkStyle, updated), 10);
      return updated;
    });
  };

  const seekToCue = (cueStart: number) => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = start + cueStart;
      setCurrentTimeProgress(start + cueStart);
      setTimeout(() => redrawCurrentPreviewFrame(), 30);
    }
  };

  const handleScrub = (newTime: number) => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = clamp(newTime, start, end);
      setCurrentTimeProgress(video.currentTime);
      setTimeout(() => redrawCurrentPreviewFrame(), 20);
    }
  };

  const handleCanvasDragMove = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!isDraggingSubtitle.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const relX = clamp((clientX - rect.left) / rect.width, 0.15, 0.85);
    const relY = clamp((clientY - rect.top) / rect.height, 0.10, 0.90);

    updateSubtitleStyle({ posX: relX, posY: relY });
  };

  const [sttSettings, setSttSettings] = useState<SttSettings>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('khanclip-stt-settings') || '{}');
      const loaded = { ...DEFAULT_STT_SETTINGS, ...saved, apiKey: sessionStorage.getItem('khanclip-stt-api-key') || '' };
      if (!saved.apiFormat || (saved.apiFormat === 'openai' && !loaded.apiKey && !loaded.baseUrl)) {
        loaded.apiFormat = 'browser-whisper';
        loaded.provider = 'Whisper Web (Bebas API Key)';
        loaded.model = 'Xenova/whisper-tiny';
      }
      return loaded;
    } catch {
      return DEFAULT_STT_SETTINGS;
    }
  });

  const end = useMemo(() => Math.min(duration, start + clipDuration), [duration, start, clipDuration]);
  const actualDuration = Math.max(0, end - start);
  const currentSettingsKey = JSON.stringify({
    baseUrl: sttSettings.baseUrl.trim().replace(/\/+$/, ''),
    apiKey: sttSettings.apiKey.trim(),
    apiFormat: sttSettings.apiFormat,
    provider: sttSettings.provider.trim(),
    model: sttSettings.model.trim(),
  });
  const settingsVerified = sttSettings.apiFormat === 'browser-whisper' || (connectionState === 'success' && verifiedSettingsKey === currentSettingsKey);

  useEffect(() => () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (previewAnimationRef.current !== null) cancelAnimationFrame(previewAnimationRef.current);
    previewLandmarkerRef.current?.close();
  }, [sourceUrl]);

  useEffect(() => {
    if (!settingsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [settingsOpen]);

  useEffect(() => {
    if (!verifiedSettingsKey || verifiedSettingsKey === currentSettingsKey) return;
    setVerifiedSettingsKey('');
    setConnectionState('idle');
    setConnectionMessage('');
  }, [currentSettingsKey, verifiedSettingsKey]);

  const saveSttSettings = (event: React.FormEvent) => {
    event.preventDefault();
    let normalizedBaseUrl = sttSettings.baseUrl.trim().replace(/\/+$/, '');
    if (sttSettings.apiFormat === 'openai') {
      if (normalizedBaseUrl === 'https://api.openai.com') normalizedBaseUrl = 'https://api.openai.com/v1';
      if (normalizedBaseUrl === 'https://api.groq.com' || normalizedBaseUrl === 'https://api.groq.com/openai') {
        normalizedBaseUrl = 'https://api.groq.com/openai/v1';
      }
    }
    const finalSettings = { ...sttSettings, baseUrl: normalizedBaseUrl };
    const { apiKey, ...safeSettings } = finalSettings;
    localStorage.setItem('khanclip-stt-settings', JSON.stringify(safeSettings));
    if (apiKey) sessionStorage.setItem('khanclip-stt-api-key', apiKey);
    else sessionStorage.removeItem('khanclip-stt-api-key');
    setSttSettings(finalSettings);
    setSubtitleCues([]);
    setSubtitleStatus('');
    setSettingsOpen(false);
  };

  const testSttConnection = async () => {
    setConnectionState('testing');
    setVerifiedSettingsKey('');

    if (sttSettings.apiFormat === 'browser-whisper') {
      setConnectionMessage('Memeriksa kesiapan Web Audio & browser…');
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) throw new Error('Web Audio API tidak didukung pada browser ini.');
        setVerifiedSettingsKey(currentSettingsKey);
        setConnectionState('success');
        setConnectionMessage('Siap. Whisper Web berjalan 100% di browser tanpa API key.');
      } catch (e: any) {
        setConnectionState('error');
        setConnectionMessage(e?.message || 'Gagal menyiapkan engine browser.');
      }
      return;
    }

    setConnectionMessage('Menghubungkan ke API…');
    try {
      let baseUrl = sttSettings.baseUrl.trim().replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(baseUrl)) throw new Error('Endpoint harus dimulai dengan http:// atau https://.');
      if (sttSettings.apiFormat === 'openai') {
        if (baseUrl === 'https://api.openai.com') baseUrl = 'https://api.openai.com/v1';
        if (baseUrl === 'https://api.groq.com' || baseUrl === 'https://api.groq.com/openai') {
          baseUrl = 'https://api.groq.com/openai/v1';
        }
      }
      if (!sttSettings.provider.trim()) throw new Error('Nama provider belum diisi.');
      if (!sttSettings.model.trim()) throw new Error('Model ID belum diisi.');
      const isGemini = sttSettings.apiFormat === 'gemini';
      const testUrl = isGemini
        ? `${baseUrl}/models${sttSettings.apiKey ? `?key=${encodeURIComponent(sttSettings.apiKey)}` : ''}`
        : sttSettings.apiFormat === 'openai' ? `${baseUrl}/models` : baseUrl;
      const response = await fetch(testUrl, {
        headers: !isGemini && sttSettings.apiKey ? { Authorization: `Bearer ${sttSettings.apiKey}` } : {},
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new Error('API key ditolak oleh provider.');
        throw new Error(`API merespons dengan status ${response.status}.`);
      }
      setVerifiedSettingsKey(currentSettingsKey);
      setConnectionState('success');
      setConnectionMessage(sttSettings.apiFormat === 'custom'
        ? 'Endpoint dapat dijangkau. Validasi API key untuk format custom dilakukan saat transkripsi.'
        : 'Terhubung. Endpoint dan API key dapat digunakan.');
    } catch (caught) {
      setVerifiedSettingsKey('');
      setConnectionState('error');
      const detail = caught instanceof Error ? caught.message : 'Koneksi gagal.';
      setConnectionMessage(`${detail} Pastikan provider mendukung model transkripsi suara (STT) dan mengizinkan akses browser (CORS).`);
    }
  };

  const loadFile = (nextFile?: File) => {
    if (!nextFile) return;
    if (!nextFile.type.startsWith('video/')) {
      setError('File tidak dikenali sebagai video. Pilih MP4, WebM, MOV, atau format video lain yang didukung browser.');
      return;
    }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    const nextUrl = URL.createObjectURL(nextFile);
    setFile(nextFile);
    setSourceUrl(nextUrl);
    setDuration(0);
    setStart(0);
    setClipDuration(30);
    setProgress(0);
    setExportState('idle');
    setPreviewState('idle');
    setError('');
    setSubtitleCues([]);
    setSubtitleStatus('');
  };

  const updateStart = (value: number) => {
    const maxStart = Math.max(0, duration - 0.1);
    setStart(clamp(Number.isFinite(value) ? value : 0, 0, maxStart));
    setExportState('idle');
    setSubtitleCues([]);
  };

  const updateClipDuration = (value: number) => {
    const available = Math.max(0.1, duration - start);
    setClipDuration(clamp(Number.isFinite(value) ? value : 0.1, 0.1, available));
    setExportState('idle');
    setSubtitleCues([]);
  };

  const recordSelectedAudio = async () => {
    const audioVideo = document.createElement('video');
    audioVideo.src = sourceUrl;
    audioVideo.preload = 'auto';
    audioVideo.muted = true;
    await new Promise<void>((resolve, reject) => {
      audioVideo.onloadedmetadata = () => resolve();
      audioVideo.onerror = () => reject(new Error('Audio video tidak dapat dibaca.'));
      audioVideo.load();
    });
    await new Promise<void>((resolve) => { audioVideo.onseeked = () => resolve(); audioVideo.currentTime = start; });
    const captured = (audioVideo as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
    const audioTrack = captured?.getAudioTracks()[0];
    if (!audioTrack) throw new Error('Browser tidak dapat mengambil audio dari video ini. Gunakan Chrome atau Edge terbaru.');
    const stream = new MediaStream([audioTrack]);
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm'].find((type) => MediaRecorder.isTypeSupported(type)) || '';
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 128_000 } : { audioBitsPerSecond: 128_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    const finished = new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => reject(new Error('Perekaman audio gagal.'));
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
    });
    recorder.start(500);
    await audioVideo.play();
    await new Promise<void>((resolve) => {
      const monitor = () => {
        if (audioVideo.currentTime >= end || audioVideo.ended) { audioVideo.pause(); resolve(); }
        else requestAnimationFrame(monitor);
      };
      monitor();
    });
    recorder.stop();
    const blob = await finished;
    stream.getTracks().forEach((track) => track.stop());
    audioVideo.remove();
    return blob;
  };

  const extractAudioFloat32 = async (url: string, startTime: number, endTime: number): Promise<Float32Array> => {
    try {
      const resp = await fetch(url);
      const arrayBuffer = await resp.arrayBuffer();

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      const targetRate = 16000;
      const clipDuration = Math.max(0.1, endTime - startTime);
      const targetLength = Math.ceil(clipDuration * targetRate);

      const resampleCtx = new OfflineAudioContext(1, targetLength, targetRate);
      const sourceNode = resampleCtx.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(resampleCtx.destination);
      sourceNode.start(0, startTime, clipDuration);

      const renderedBuffer = await resampleCtx.startRendering();
      audioCtx.close();
      return renderedBuffer.getChannelData(0);
    } catch (err) {
      console.warn('Direct decodeAudioData failed, falling back to recorded audio slice:', err);
      const audioBlob = await recordSelectedAudio();
      const audioBytes = await audioBlob.arrayBuffer();
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const audioBuffer = await audioCtx.decodeAudioData(audioBytes);

      const targetRate = 16000;
      const targetLength = Math.ceil(audioBuffer.duration * targetRate);
      const resampleCtx = new OfflineAudioContext(1, targetLength, targetRate);
      const sourceNode = resampleCtx.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(resampleCtx.destination);
      sourceNode.start(0);

      const renderedBuffer = await resampleCtx.startRendering();
      audioCtx.close();
      return renderedBuffer.getChannelData(0);
    }
  };

  const transcribeSelectedClip = async () => {
    if (sttSettings.apiFormat === 'browser-whisper') {
      setSubtitleStatus('Mengekstrak audio klip 16kHz…');
      const float32Data = await extractAudioFloat32(sourceUrl, start, end);

      setSubtitleStatus('Memuat model Whisper AI di browser…');
      const transcriber = await getBrowserWhisper(sttSettings.model || 'Xenova/whisper-tiny', (msg: string) => {
        setSubtitleStatus(msg);
      });

      setSubtitleStatus('Mentranskripsi subtitle otomatis…');
      const langParam = sttSettings.language === 'auto'
        ? null
        : (sttSettings.language === 'id' ? 'indonesian' : sttSettings.language);

      const output = await transcriber(float32Data, {
        language: langParam,
        task: 'transcribe',
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
      });

      const rawChunks = output.chunks || (output.text ? [{ text: output.text, timestamp: [0, actualDuration] }] : []);
      const cues: SubtitleCue[] = rawChunks.map((chunk: any) => {
        const cStart = Number(chunk.timestamp?.[0]) || 0;
        const cEnd = Number(chunk.timestamp?.[1]) || actualDuration;
        return {
          start: Math.max(0, cStart),
          end: Math.max(cStart + 0.5, cEnd),
          text: String(chunk.text || '').trim()
        };
      }).filter((cue: SubtitleCue) => cue.text.length > 0);

      if (!cues.length && output.text) {
        cues.push({ start: 0, end: actualDuration, text: output.text.trim() });
      }

      if (!cues.length) throw new Error('Tidak ada kata atau percakapan yang terdeteksi pada klip ini.');
      setSubtitleCues(cues);
      setSubtitleStatus(`${cues.length} subtitle dibuat oleh Whisper Web (Bebas API Key).`);
      return cues;
    }

    if (!sttSettings.baseUrl || !sttSettings.model || !sttSettings.provider) throw new Error('Lengkapi endpoint, provider, dan model pada Pengaturan terlebih dahulu.');
    const audio = await recordSelectedAudio();
    setSubtitleStatus('Mengirim audio ke provider…');
    const baseUrl = sttSettings.baseUrl.trim().replace(/\/+$/, '');
    let data: any;

    if (sttSettings.apiFormat === 'gemini') {
      const audioBase64 = await blobToBase64(audio);
      const prompt = `Transkripsikan audio ini dalam bahasa ${sttSettings.language === 'auto' ? 'aslinya' : sttSettings.language}. Kembalikan HANYA JSON array tanpa markdown: [{"start":0.0,"end":2.5,"text":"..."}]. Waktu relatif dari awal audio, pecah menjadi kalimat subtitle pendek.`;
      const response = await fetch(`${baseUrl}/models/${encodeURIComponent(sttSettings.model)}:generateContent?key=${encodeURIComponent(sttSettings.apiKey)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: audio.type || 'audio/webm', data: audioBase64 } }] }] }),
      });
      if (!response.ok) throw new Error(`Transkripsi gagal (${response.status}). Periksa endpoint, key, dan model Gemini.`);
      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '';
      data = JSON.parse(text.replace(/```json|```/g, '').trim());
    } else {
      const form = new FormData();
      form.append('file', audio, 'clip.webm');
      form.append('model', sttSettings.model);
      if (sttSettings.language !== 'auto') form.append('language', sttSettings.language);
      form.append('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', sttSettings.timestamps);
      const response = await fetch(`${baseUrl}/audio/transcriptions`, { method: 'POST', headers: sttSettings.apiKey ? { Authorization: `Bearer ${sttSettings.apiKey}` } : {}, body: form });
      if (!response.ok) throw new Error(`Transkripsi gagal (${response.status}). Periksa endpoint, API key, model, dan CORS.`);
      data = await response.json();
    }

    const rawCues = Array.isArray(data) ? data : sttSettings.timestamps === 'word' && data.words?.length ? data.words : data.segments;
    const cues: SubtitleCue[] = Array.isArray(rawCues)
      ? rawCues.map((cue: any) => ({ start: Number(cue.start) || 0, end: Number(cue.end) || actualDuration, text: String(cue.text || cue.word || '').trim() })).filter((cue) => cue.text && cue.end > cue.start)
      : data.text ? [{ start: 0, end: actualDuration, text: String(data.text) }] : [];
    if (!cues.length) throw new Error('Provider tidak mengembalikan teks atau timestamp subtitle.');
    setSubtitleCues(cues);
    setSubtitleStatus(`${cues.length} subtitle siap.`);
    return cues;
  };

  const stopPreview = () => {
    const video = videoRef.current;
    video?.pause();
    if (previewAnimationRef.current !== null) {
      cancelAnimationFrame(previewAnimationRef.current);
      previewAnimationRef.current = null;
    }
    setPreviewState('idle');
  };

  const previewFromStart = async () => {
    const video = videoRef.current;
    const canvas = previewCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!video || !canvas || !context) return;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    setError('');
    setPreviewState('loading');

    try {
      let activeCues = subtitleCues;
      if (!activeCues.length) {
        setSubtitleStatus(`Menyiapkan audio ${actualDuration.toFixed(0)} detik…`);
        activeCues = await transcribeSelectedClip();
      }
      if (!previewLandmarkerRef.current) previewLandmarkerRef.current = await createFaceLandmarker();
      video.currentTime = start;
      previewFocusRef.current = { x: 0.5, y: 0.44, frame: 0 };
      await video.play();
      setPreviewState('playing');

      const drawPreview = () => {
        if (video.paused || video.ended || video.currentTime >= end) {
          video.pause();
          video.currentTime = start;
          setPreviewState('idle');
          previewAnimationRef.current = null;
          return;
        }

        const focus = previewFocusRef.current;
        if (focus.frame % 5 === 0 && previewLandmarkerRef.current) {
          const result = previewLandmarkerRef.current.detectForVideo(video, performance.now());
          let bestScore = -1;
          result.faceLandmarks.forEach((landmarks, faceIndex) => {
            if (!landmarks.length) return;
            const xs = landmarks.map((point) => point.x);
            const ys = landmarks.map((point) => point.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            const faceArea = Math.max(0, (maxX - minX) * (maxY - minY));
            const jawOpen = result.faceBlendshapes[faceIndex]?.categories.find(
              (category) => category.categoryName === 'jawOpen'
            )?.score ?? 0;
            const score = jawOpen * 2.4 + faceArea;
            if (score > bestScore) {
              bestScore = score;
              focus.x += (((minX + maxX) / 2) - focus.x) * 0.22;
              focus.y += ((Math.max(0.2, (minY + maxY) / 2 - (maxY - minY) * 0.12)) - focus.y) * 0.16;
            }
          });
        }

        const targetAspect = 9 / 16;
        const sourceAspect = video.videoWidth / video.videoHeight;
        let sourceWidth = video.videoWidth;
        let sourceHeight = video.videoHeight;
        if (sourceAspect > targetAspect) sourceWidth = sourceHeight * targetAspect;
        else sourceHeight = sourceWidth / targetAspect;
        const sourceX = clamp(focus.x * video.videoWidth - sourceWidth / 2, 0, video.videoWidth - sourceWidth);
        const sourceY = clamp(focus.y * video.videoHeight - sourceHeight / 2, 0, video.videoHeight - sourceHeight);

        const localTime = video.currentTime - start;
        setCurrentTimeProgress(video.currentTime);
        const activeCue = activeCues.find((cue) => localTime >= cue.start && localTime < cue.end);

        const renderFrame = (targetCanvas: HTMLCanvasElement | null) => {
          if (!targetCanvas) return;
          const ctx = targetCanvas.getContext('2d');
          if (!ctx) return;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, targetCanvas.width, targetCanvas.height);
          drawSubtitle(ctx, targetCanvas, activeCue, subtitleStyle);
          drawWatermark(ctx, targetCanvas, watermarkStyle);
        };

        renderFrame(canvas);
        renderFrame(studioCanvasRef.current);

        focus.frame += 1;
        previewAnimationRef.current = requestAnimationFrame(drawPreview);
      };
      drawPreview();
    } catch (caught) {
      setPreviewState('idle');
      setError(caught instanceof Error ? `Preview gagal: ${caught.message}` : 'Preview gagal dimuat. Periksa koneksi lalu coba lagi.');
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (video) {
      setCurrentTimeProgress(video.currentTime);
      if (video.currentTime >= end) {
        video.pause();
        video.currentTime = start;
        setCurrentTimeProgress(start);
      }
    }
  };

  const exportClip = async () => {
    const preview = videoRef.current;
    if (!preview || !file || actualDuration <= 0) return;
    if (typeof MediaRecorder === 'undefined') {
      setError('Browser ini belum mendukung ekspor video. Gunakan Chrome atau Edge versi terbaru.');
      setExportState('error');
      return;
    }

    setError('');
    setProgress(0);
    setExportState('exporting');
    setExportLabel('Memuat pelacak wajah…');
    cancelExportRef.current = false;

    const renderVideo = document.createElement('video');
    renderVideo.src = sourceUrl;
    renderVideo.preload = 'auto';
    renderVideo.playsInline = true;
    renderVideo.crossOrigin = 'anonymous';

    let faceLandmarker: FaceLandmarker | null = null;
    try {
      let activeCues = subtitleCues;
      if (!activeCues.length && (sttSettings.apiFormat === 'browser-whisper' || (sttSettings.baseUrl && sttSettings.model))) {
        setExportLabel(`Menyiapkan subtitle ${actualDuration.toFixed(0)} detik…`);
        activeCues = await transcribeSelectedClip();
      }
      faceLandmarker = await createFaceLandmarker();
      setExportLabel('Mendeteksi wajah pembicara…');
      await new Promise<void>((resolve, reject) => {
        renderVideo.onloadedmetadata = () => resolve();
        renderVideo.onerror = () => reject(new Error('Video gagal dibaca oleh browser.'));
        renderVideo.load();
      });

      const canvas = document.createElement('canvas');
      const sharpOutputSize = getSharpPortraitSize(renderVideo.videoWidth, renderVideo.videoHeight);
      canvas.width = sharpOutputSize.width;
      canvas.height = sharpOutputSize.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas video tidak tersedia.');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';

      const canvasStream = canvas.captureStream(30);
      const sourceStream = (renderVideo as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
      sourceStream?.getAudioTracks().forEach((track) => canvasStream.addTrack(track));

      const candidates = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus'];
      const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
      const recorderOptions: MediaRecorderOptions = {
        videoBitsPerSecond: OUTPUT_VIDEO_BITRATE,
        audioBitsPerSecond: OUTPUT_AUDIO_BITRATE,
        ...(mimeType ? { mimeType } : {}),
      };
      const recorder = new MediaRecorder(canvasStream, recorderOptions);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };

      await new Promise<void>((resolve) => {
        renderVideo.onseeked = () => resolve();
        renderVideo.currentTime = start;
      });

      const finished = new Promise<Blob>((resolve, reject) => {
        recorder.onerror = () => reject(new Error('Proses perekaman klip gagal.'));
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
      });

      recorder.start(500);
      await renderVideo.play();
      const startedAt = performance.now();
      let frameIndex = 0;
      let focusX = 0.5;
      let focusY = 0.44;

      await new Promise<void>((resolve) => {
        const draw = () => {
          if (cancelExportRef.current || renderVideo.currentTime >= end || renderVideo.ended) {
            renderVideo.pause();
            resolve();
            return;
          }
          if (frameIndex % 5 === 0 && faceLandmarker) {
            const result = faceLandmarker.detectForVideo(renderVideo, frameIndex * (1000 / 30));
            let bestScore = -1;
            result.faceLandmarks.forEach((landmarks, faceIndex) => {
              if (!landmarks.length) return;
              const xs = landmarks.map((point) => point.x);
              const ys = landmarks.map((point) => point.y);
              const minX = Math.min(...xs);
              const maxX = Math.max(...xs);
              const minY = Math.min(...ys);
              const maxY = Math.max(...ys);
              const faceArea = Math.max(0, (maxX - minX) * (maxY - minY));
              const jawOpen = result.faceBlendshapes[faceIndex]?.categories.find(
                (category) => category.categoryName === 'jawOpen'
              )?.score ?? 0;
              const score = jawOpen * 2.4 + faceArea;
              if (score > bestScore) {
                bestScore = score;
                const targetX = (minX + maxX) / 2;
                const targetY = Math.max(0.2, (minY + maxY) / 2 - (maxY - minY) * 0.12);
                focusX += (targetX - focusX) * 0.22;
                focusY += (targetY - focusY) * 0.16;
              }
            });
          }

          const targetAspect = 9 / 16;
          const sourceAspect = renderVideo.videoWidth / renderVideo.videoHeight;
          let sourceWidth = renderVideo.videoWidth;
          let sourceHeight = renderVideo.videoHeight;
          if (sourceAspect > targetAspect) sourceWidth = sourceHeight * targetAspect;
          else sourceHeight = sourceWidth / targetAspect;
          const sourceX = clamp(focusX * renderVideo.videoWidth - sourceWidth / 2, 0, renderVideo.videoWidth - sourceWidth);
          const sourceY = clamp(focusY * renderVideo.videoHeight - sourceHeight / 2, 0, renderVideo.videoHeight - sourceHeight);
          context.drawImage(renderVideo, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
          const localTime = renderVideo.currentTime - start;
          drawSubtitle(context, canvas, activeCues.find((cue) => localTime >= cue.start && localTime < cue.end), subtitleStyle);
          drawWatermark(context, canvas, watermarkStyle);
          frameIndex += 1;
          setProgress(clamp(((performance.now() - startedAt) / 1000 / actualDuration) * 100, 0, 99));
          requestAnimationFrame(draw);
        };
        draw();
      });

      recorder.stop();
      const blob = await finished;
      canvasStream.getTracks().forEach((track) => track.stop());
      if (cancelExportRef.current) {
        setExportState('idle');
        setProgress(0);
        return;
      }

      const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const outputUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'video';
      link.href = outputUrl;
      link.download = `${baseName}_clip_${Math.floor(start)}-${Math.floor(end)}.${extension}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(outputUrl), 1000);
      setProgress(100);
      setExportState('done');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Klip gagal diekspor. Coba gunakan video MP4 di Chrome atau Edge terbaru.');
      setExportState('error');
    } finally {
      faceLandmarker?.close();
      renderVideo.remove();
    }
  };

  return (
    <div className="shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => window.location.reload()} aria-label="Muat ulang KHAN CLIP">
          <span className="brand-mark"><FilmIcon /></span>
          <span>KHAN CLIP</span>
        </button>
        <div className="header-actions">
          <span className="local-note"><span className="status-dot" />Diproses lokal</span>
          <button className="icon-button" type="button" onClick={() => { setSettingsOpen(true); setConnectionState('idle'); }} aria-label="Buka pengaturan"><SettingsIcon /></button>
        </div>
      </header>

      <main className="workspace">
        <section className="intro" aria-labelledby="page-title">
          <h1 id="page-title">Buat klip TikTok otomatis</h1>
          <p>Pilih durasi. KHAN CLIP membuat video 9:16 dan mengikuti wajah pembicara.</p>
        </section>

        {!file ? (
          <section
            className={`upload-zone${dragging ? ' is-dragging' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); loadFile(event.dataTransfer.files[0]); }}
            aria-labelledby="upload-title"
          >
            <input ref={inputRef} type="file" accept="video/*" hidden onChange={(event) => loadFile(event.target.files?.[0])} />
            <span className="upload-icon"><UploadIcon /></span>
            <h2 id="upload-title">Pilih video untuk dipotong</h2>
            <p>Tarik video ke sini, atau pilih file dari perangkat Anda.</p>
            <button className="button button-primary" type="button" onClick={() => inputRef.current?.click()}>Pilih video</button>
            <span className="file-support">Video diproses di perangkat Anda</span>
          </section>
        ) : (
          <section className="editor-card">
            <div className="section-head">
              <span className="step-number">1</span>
              <div><h2>Video Anda</h2><p>Putar video untuk mencari bagian yang ingin dipotong.</p></div>
            </div>
            <div className="preview-panel">
              <div className="preview-grid">
                <div><span className="preview-label">VIDEO ASLI</span><div className="video-frame">
                <video ref={videoRef} src={sourceUrl} controls playsInline onTimeUpdate={handleTimeUpdate} onLoadedMetadata={(event) => {
                  const nextDuration = event.currentTarget.duration;
                  setDuration(nextDuration);
                  setClipDuration(Math.min(30, nextDuration));
                }} /></div></div>
                <div>
                  <div className="preview-label-row">
                    <span className="preview-label">HASIL TIKTOK · 9:16</span>
                    <button
                      type="button"
                      className="expand-studio-btn"
                      onClick={() => { setStudioOpen(true); setTimeout(() => redrawCurrentPreviewFrame(), 50); }}
                      title="Perbesar & Buka Studio Editor"
                    >
                      <ExpandIcon /> Perbesar & Edit Studio
                    </button>
                  </div>
                  <div
                    className="tiktok-frame is-clickable"
                    onClick={() => { setStudioOpen(true); setTimeout(() => redrawCurrentPreviewFrame(), 50); }}
                    title="Klik untuk memperbesar dan membuka Studio Editor"
                  >
                    <canvas ref={previewCanvasRef} width={1080} height={1920} aria-label="Preview vertikal hasil tracking wajah" />
                    {previewState === 'idle' && (
                      <span className="preview-placeholder">
                        <ExpandIcon />
                        <strong>Klik untuk Perbesar & Edit</strong>
                        <small>Buka Studio Subtitle & Watermark</small>
                      </span>
                    )}
                    {previewState === 'loading' && <span className="preview-placeholder">Memuat pelacak wajah…</span>}
                    <div className="tiktok-hover-hint">
                      <span>🔍 Klik untuk Perbesar & Edit</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="file-row">
                <div className="file-copy"><strong>{file.name}</strong><span>{(file.size / 1024 / 1024).toFixed(1)} MB · Durasi {formatTime(duration)}</span></div>
                <button className="button button-quiet" type="button" onClick={() => inputRef.current?.click()}>Ganti video</button>
                <input ref={inputRef} type="file" accept="video/*" hidden onChange={(event) => loadFile(event.target.files?.[0])} />
              </div>
            </div>

            <div className="control-panel" aria-labelledby="clip-settings-title">
              <div className="section-head">
                <span className="step-number">2</span>
                <div><h2 id="clip-settings-title">Atur potongan</h2><p>Hasil otomatis 9:16 dengan resolusi tajam hingga 1080 × 1920.</p></div>
              </div>

              <div className="control-grid">
                <div className="field-group">
                  <label htmlFor="start-time">Mulai pada detik</label>
                  <div className="number-field"><input id="start-time" type="number" min="0" max={Math.max(0, duration - 0.1)} step="0.1" value={Number(start.toFixed(1))} onChange={(e) => updateStart(Number(e.target.value))} /><span>detik</span></div>
                  <input className="timeline" aria-label="Waktu mulai klip" type="range" min="0" max={Math.max(0.1, duration - 0.1)} step="0.1" value={start} onChange={(e) => updateStart(Number(e.target.value))} />
                </div>

                <div className="field-group">
                  <label htmlFor="clip-duration">Panjang video</label>
                  <div className="number-field"><input id="clip-duration" type="number" min="0.1" max={Math.max(0.1, duration - start)} step="0.1" value={Number(clipDuration.toFixed(1))} onChange={(e) => updateClipDuration(Number(e.target.value))} /><span>detik</span></div>
                  <div className="presets" aria-label="Pilihan cepat durasi">
                    {[15, 30, 60].map((value) => <button key={value} type="button" disabled={value > duration - start} className={Math.abs(clipDuration - value) < 0.05 ? 'is-active' : ''} onClick={() => updateClipDuration(value)}>{value} detik</button>)}
                  </div>
                </div>
              </div>

              <div className="clip-summary">
                <span><small>Potongan</small><strong>{formatTime(start)} — {formatTime(end)}</strong></span>
                <span className="duration-badge">{actualDuration.toFixed(1)} detik</span>
              </div>

              {/* Pilihan Gaya Subtitle */}
              <div className="subtitle-style-card">
                <div className="subtitle-style-head">
                  <span className="style-title"><ChatIcon /> Gaya Teks Subtitle</span>
                  <label className="checkbox-caps">
                    <input
                      type="checkbox"
                      checked={subtitleStyle.uppercase}
                      onChange={(e) => updateSubtitleStyle({ uppercase: e.target.checked })}
                    />
                    <span>KAPITAL (A-Z)</span>
                  </label>
                </div>

                <div className="style-presets-grid" role="radiogroup" aria-label="Pilihan gaya subtitle">
                  <button
                    type="button"
                    className={`style-pill style-pill-yellow${subtitleStyle.preset === 'tiktok-yellow' ? ' is-active' : ''}`}
                    onClick={() => updateSubtitleStyle({ preset: 'tiktok-yellow' })}
                  >
                    <span className="color-dot dot-yellow" />
                    <strong>Viral Pop</strong>
                    <small>Kuning + Outline</small>
                  </button>

                  <button
                    type="button"
                    className={`style-pill style-pill-capsule${subtitleStyle.preset === 'capsule-dark' ? ' is-active' : ''}`}
                    onClick={() => updateSubtitleStyle({ preset: 'capsule-dark' })}
                  >
                    <span className="color-dot dot-capsule" />
                    <strong>Matte Dark</strong>
                    <small>Kotak Elegan</small>
                  </button>

                  <button
                    type="button"
                    className={`style-pill style-pill-cinema${subtitleStyle.preset === 'clean-cinema' ? ' is-active' : ''}`}
                    onClick={() => updateSubtitleStyle({ preset: 'clean-cinema' })}
                  >
                    <span className="color-dot dot-white" />
                    <strong>Cinematic</strong>
                    <small>Putih + Shadow</small>
                  </button>

                  <button
                    type="button"
                    className={`style-pill style-pill-neon${subtitleStyle.preset === 'neon-cyan' ? ' is-active' : ''}`}
                    onClick={() => updateSubtitleStyle({ preset: 'neon-cyan' })}
                  >
                    <span className="color-dot dot-cyan" />
                    <strong>Cyber Neon</strong>
                    <small>Cyan Glow</small>
                  </button>

                  <button
                    type="button"
                    className={`style-pill style-pill-red${subtitleStyle.preset === 'fire-red' ? ' is-active' : ''}`}
                    onClick={() => updateSubtitleStyle({ preset: 'fire-red' })}
                  >
                    <span className="color-dot dot-red" />
                    <strong>Bold Red</strong>
                    <small>Kotak Merah</small>
                  </button>
                </div>

                <div className="subtitle-custom-options">
                  <div className="style-option-group">
                    <label>Posisi Teks:</label>
                    <div className="style-toggle-buttons">
                      <button
                        type="button"
                        className={subtitleStyle.position === 'bottom' ? 'is-active' : ''}
                        onClick={() => updateSubtitleStyle({ position: 'bottom' })}
                      >
                        Bawah
                      </button>
                      <button
                        type="button"
                        className={subtitleStyle.position === 'center' ? 'is-active' : ''}
                        onClick={() => updateSubtitleStyle({ position: 'center' })}
                      >
                        Tengah
                      </button>
                      <button
                        type="button"
                        className={subtitleStyle.position === 'top' ? 'is-active' : ''}
                        onClick={() => updateSubtitleStyle({ position: 'top' })}
                      >
                        Atas
                      </button>
                    </div>
                  </div>

                  <div className="style-option-group">
                    <label>Ukuran Font:</label>
                    <div className="style-toggle-buttons">
                      <button
                        type="button"
                        className={subtitleStyle.size === 'normal' ? 'is-active' : ''}
                        onClick={() => updateSubtitleStyle({ size: 'normal' })}
                      >
                        Sedang
                      </button>
                      <button
                        type="button"
                        className={subtitleStyle.size === 'large' ? 'is-active' : ''}
                        onClick={() => updateSubtitleStyle({ size: 'large' })}
                      >
                        Besar
                      </button>
                      <button
                        type="button"
                        className={subtitleStyle.size === 'huge' ? 'is-active' : ''}
                        onClick={() => updateSubtitleStyle({ size: 'huge' })}
                      >
                        Ekstra
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {error && <p className="error-message" role="alert">{error}</p>}
              {subtitleStatus && <p className="subtitle-status" role="status">{subtitleStatus}</p>}
              {exportState === 'exporting' && <div className="progress-wrap" aria-live="polite"><div className="progress-meta"><span>{exportLabel}</span><strong>{Math.round(progress)}%</strong></div><div className="progress-track"><span style={{ transform: `scaleX(${progress / 100})` }} /></div></div>}
              {exportState === 'done' && <p className="success-message" role="status">Klip selesai dan sudah diunduh.</p>}

              <div className="subtitle-quick-bar">
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => transcribeSelectedClip()}
                  disabled={!duration || exportState === 'exporting' || previewState === 'loading'}
                >
                  <ChatIcon /> {subtitleCues.length ? `Perbarui Subtitle (${subtitleCues.length} aktif)` : 'Buat Subtitle AI (Bebas API Key)'}
                </button>
              </div>

              <div className="actions">
                {previewState === 'playing' ? (
                  <button className="button button-secondary" type="button" onClick={stopPreview}>Hentikan preview</button>
                ) : (
                  <button className="button button-secondary" type="button" onClick={previewFromStart} disabled={!duration || exportState === 'exporting' || previewState === 'loading'}>{previewState === 'loading' ? 'Memuat preview…' : 'Lihat preview'}</button>
                )}
                {exportState === 'exporting' ? (
                  <button className="button button-danger" type="button" onClick={() => { cancelExportRef.current = true; }}>Batalkan</button>
                ) : (
                  <button className="button button-primary" type="button" onClick={exportClip} disabled={!duration}><ScissorsIcon />Potong dan unduh</button>
                )}
              </div>
              <p className="export-note">Resolusi mengikuti detail asli crop agar video tidak diperbesar dan menjadi buram. Maksimal 1080 × 1920.</p>
            </div>
          </section>
        )}
      </main>

      {studioOpen && (
        <div
          className="modal-backdrop studio-backdrop"
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setStudioOpen(false); }}
        >
          <section className="studio-dialog" role="dialog" aria-modal="true" aria-labelledby="studio-title">
            <header className="studio-header">
              <div className="studio-header-copy">
                <span className="settings-kicker">STUDIO EDITOR 9:16</span>
                <h2 id="studio-title">Studio Subtitle & Watermark</h2>
                <p>Klik teks subtitle untuk mengedit kata, geser letak teks bebas di layar, dan tambahkan watermark.</p>
              </div>
              <div className="studio-header-actions">
                <button
                  className="button button-primary studio-export-btn"
                  type="button"
                  onClick={exportClip}
                  disabled={!duration || exportState === 'exporting'}
                >
                  <ScissorsIcon /> Potong & Unduh
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setStudioOpen(false)}
                  aria-label="Tutup studio"
                >
                  <CloseIcon />
                </button>
              </div>
            </header>

            <div className="studio-body">
              {/* Left Column: Big Interactive 9:16 Screen */}
              <div className="studio-player-col">
                <div
                  className="studio-canvas-wrap"
                  onMouseDown={(e) => { isDraggingSubtitle.current = true; handleCanvasDragMove(e); }}
                  onMouseMove={handleCanvasDragMove}
                  onMouseUp={() => { isDraggingSubtitle.current = false; }}
                  onTouchStart={(e) => { isDraggingSubtitle.current = true; handleCanvasDragMove(e); }}
                  onTouchMove={handleCanvasDragMove}
                  onTouchEnd={() => { isDraggingSubtitle.current = false; }}
                  title="Klik & geser untuk memindahkan teks subtitle ke mana saja"
                >
                  <canvas ref={studioCanvasRef} width={1080} height={1920} className="studio-canvas" />
                  <div className="canvas-drag-hint">
                    <span><MoveIcon /> Klik & geser subtitle ke mana saja</span>
                  </div>
                </div>

                <div className="studio-player-bar">
                  <button
                    type="button"
                    className="studio-play-btn"
                    onClick={previewState === 'playing' ? stopPreview : previewFromStart}
                  >
                    {previewState === 'playing' ? <PauseIcon /> : <PlayIcon />}
                    <span>{previewState === 'playing' ? 'Jeda' : 'Putar'}</span>
                  </button>

                  <div className="studio-timeline-wrap">
                    <span className="time-tag">
                      {formatTime(Math.max(0, currentTimeProgress - start))} / {formatTime(actualDuration)}
                    </span>
                    <input
                      className="timeline"
                      type="range"
                      min={start}
                      max={end}
                      step="0.05"
                      value={clamp(currentTimeProgress, start, end)}
                      onChange={(e) => handleScrub(Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>

              {/* Right Column: Tabbed Tools */}
              <div className="studio-tools-col">
                <div className="studio-tabs" role="tablist">
                  <button
                    type="button"
                    className={`studio-tab-btn ${studioTab === 'subtitles' ? 'is-active' : ''}`}
                    onClick={() => setStudioTab('subtitles')}
                  >
                    <ChatIcon /> Subtitle ({subtitleCues.length})
                  </button>
                  <button
                    type="button"
                    className={`studio-tab-btn ${studioTab === 'position' ? 'is-active' : ''}`}
                    onClick={() => setStudioTab('position')}
                  >
                    <MoveIcon /> Letak & Gaya
                  </button>
                  <button
                    type="button"
                    className={`studio-tab-btn ${studioTab === 'watermark' ? 'is-active' : ''}`}
                    onClick={() => setStudioTab('watermark')}
                  >
                    <TagIcon /> Watermark
                  </button>
                </div>

                <div className="studio-tab-content">
                  {/* Tab 1: Subtitle Cue Editor */}
                  {studioTab === 'subtitles' && (
                    <div className="subtitle-editor-pane">
                      <div className="editor-pane-toolbar">
                        <span><strong>{subtitleCues.length}</strong> kalimat terdaftar</span>
                        <div className="toolbar-buttons">
                          <button
                            type="button"
                            className="button button-quiet button-sm"
                            onClick={() => transcribeSelectedClip()}
                            disabled={previewState === 'loading'}
                          >
                            ⚡ Auto Subtitle AI
                          </button>
                          <button
                            type="button"
                            className="button button-secondary button-sm"
                            onClick={handleAddSubtitleLine}
                          >
                            + Tambah Baris
                          </button>
                        </div>
                      </div>

                      {subtitleCues.length === 0 ? (
                        <div className="empty-subtitles-card">
                          <ChatIcon />
                          <p>Belum ada subtitle pada klip ini.</p>
                          <button
                            type="button"
                            className="button button-primary button-sm"
                            onClick={() => transcribeSelectedClip()}
                          >
                            Buat Subtitle AI Sekarang
                          </button>
                        </div>
                      ) : (
                        <div className="subtitle-cues-list">
                          {subtitleCues.map((cue, idx) => (
                            <div key={idx} className="cue-row">
                              <div className="cue-timing">
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  max={actualDuration}
                                  value={Number(cue.start.toFixed(1))}
                                  onChange={(e) => updateCue(idx, { start: Math.max(0, Number(e.target.value)) })}
                                  title="Detik mulai"
                                />
                                <span>—</span>
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  max={actualDuration}
                                  value={Number(cue.end.toFixed(1))}
                                  onChange={(e) => updateCue(idx, { end: Math.max(0, Number(e.target.value)) })}
                                  title="Detik selesai"
                                />
                                <button
                                  type="button"
                                  className="cue-seek-btn"
                                  onClick={() => seekToCue(cue.start)}
                                  title="Lompat ke detik ini"
                                >
                                  ▶
                                </button>
                              </div>
                              <div className="cue-text-wrap">
                                <textarea
                                  rows={2}
                                  value={cue.text}
                                  onChange={(e) => updateCue(idx, { text: e.target.value })}
                                  placeholder="Ketik kalimat subtitle..."
                                />
                              </div>
                              <button
                                type="button"
                                className="cue-delete-btn"
                                onClick={() => deleteCue(idx)}
                                title="Hapus baris ini"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab 2: Position & Free Placement */}
                  {studioTab === 'position' && (
                    <div className="position-style-pane">
                      <div className="field-block">
                        <label>Preset Tampilan Subtitle</label>
                        <div className="style-presets-grid">
                          <button
                            type="button"
                            className={`style-pill style-pill-yellow${subtitleStyle.preset === 'tiktok-yellow' ? ' is-active' : ''}`}
                            onClick={() => updateSubtitleStyle({ preset: 'tiktok-yellow' })}
                          >
                            <span className="color-dot dot-yellow" />
                            <strong>Viral Pop</strong>
                            <small>Kuning + Outline</small>
                          </button>
                          <button
                            type="button"
                            className={`style-pill style-pill-capsule${subtitleStyle.preset === 'capsule-dark' ? ' is-active' : ''}`}
                            onClick={() => updateSubtitleStyle({ preset: 'capsule-dark' })}
                          >
                            <span className="color-dot dot-capsule" />
                            <strong>Matte Dark</strong>
                            <small>Kotak Elegan</small>
                          </button>
                          <button
                            type="button"
                            className={`style-pill style-pill-cinema${subtitleStyle.preset === 'clean-cinema' ? ' is-active' : ''}`}
                            onClick={() => updateSubtitleStyle({ preset: 'clean-cinema' })}
                          >
                            <span className="color-dot dot-white" />
                            <strong>Cinematic</strong>
                            <small>Putih + Shadow</small>
                          </button>
                          <button
                            type="button"
                            className={`style-pill style-pill-neon${subtitleStyle.preset === 'neon-cyan' ? ' is-active' : ''}`}
                            onClick={() => updateSubtitleStyle({ preset: 'neon-cyan' })}
                          >
                            <span className="color-dot dot-cyan" />
                            <strong>Cyber Neon</strong>
                            <small>Cyan Glow</small>
                          </button>
                          <button
                            type="button"
                            className={`style-pill style-pill-red${subtitleStyle.preset === 'fire-red' ? ' is-active' : ''}`}
                            onClick={() => updateSubtitleStyle({ preset: 'fire-red' })}
                          >
                            <span className="color-dot dot-red" />
                            <strong>Bold Red</strong>
                            <small>Kotak Merah</small>
                          </button>
                        </div>
                      </div>

                      <div className="field-block">
                        <div className="field-label-split">
                          <label>Letak Subtitle Bebas (Posisi Y: Atas ↔ Bawah)</label>
                          <strong>{Math.round((subtitleStyle.posY ?? 0.78) * 100)}%</strong>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="90"
                          step="1"
                          value={Math.round((subtitleStyle.posY ?? 0.78) * 100)}
                          onChange={(e) => updateSubtitleStyle({ posY: Number(e.target.value) / 100 })}
                          className="timeline"
                        />
                        <div className="range-hints">
                          <span>10% (Atas)</span>
                          <span>50% (Tengah)</span>
                          <span>90% (Bawah)</span>
                        </div>
                      </div>

                      <div className="field-block">
                        <div className="field-label-split">
                          <label>Posisi Horizontal (X: Kiri ↔ Kanan)</label>
                          <strong>{Math.round((subtitleStyle.posX ?? 0.50) * 100)}%</strong>
                        </div>
                        <input
                          type="range"
                          min="15"
                          max="85"
                          step="1"
                          value={Math.round((subtitleStyle.posX ?? 0.50) * 100)}
                          onChange={(e) => updateSubtitleStyle({ posX: Number(e.target.value) / 100 })}
                          className="timeline"
                        />
                        <div className="range-hints">
                          <span>Kiri (15%)</span>
                          <span>Tengah (50%)</span>
                          <span>Kanan (85%)</span>
                        </div>
                      </div>

                      <div className="field-row-split">
                        <div className="field-block">
                          <label>Ukuran Font</label>
                          <div className="style-toggle-buttons">
                            <button
                              type="button"
                              className={subtitleStyle.size === 'normal' ? 'is-active' : ''}
                              onClick={() => updateSubtitleStyle({ size: 'normal' })}
                            >
                              Sedang
                            </button>
                            <button
                              type="button"
                              className={subtitleStyle.size === 'large' ? 'is-active' : ''}
                              onClick={() => updateSubtitleStyle({ size: 'large' })}
                            >
                              Besar
                            </button>
                            <button
                              type="button"
                              className={subtitleStyle.size === 'huge' ? 'is-active' : ''}
                              onClick={() => updateSubtitleStyle({ size: 'huge' })}
                            >
                              Ekstra
                            </button>
                          </div>
                        </div>

                        <div className="field-block">
                          <label>Format Teks</label>
                          <label className="checkbox-caps">
                            <input
                              type="checkbox"
                              checked={subtitleStyle.uppercase}
                              onChange={(e) => updateSubtitleStyle({ uppercase: e.target.checked })}
                            />
                            <span>KAPITAL (A-Z)</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tab 3: Watermark */}
                  {studioTab === 'watermark' && (
                    <div className="watermark-pane">
                      <div className="watermark-toggle-row">
                        <label className="toggle-switch-label">
                          <input
                            type="checkbox"
                            checked={watermarkStyle.enabled}
                            onChange={(e) => updateWatermarkStyle({ enabled: e.target.checked })}
                          />
                          <strong>Tampilkan Watermark / Nama Akun di Video</strong>
                        </label>
                      </div>

                      <div className={`watermark-settings-form ${!watermarkStyle.enabled ? 'is-disabled' : ''}`}>
                        <div className="field-block">
                          <label htmlFor="wm-text">Teks Watermark</label>
                          <input
                            id="wm-text"
                            type="text"
                            value={watermarkStyle.text}
                            onChange={(e) => updateWatermarkStyle({ text: e.target.value })}
                            placeholder="Contoh: @khoirulanamid atau Channel Anda"
                            disabled={!watermarkStyle.enabled}
                          />
                        </div>

                        <div className="field-block">
                          <label>Posisi Watermark</label>
                          <div className="watermark-pos-grid">
                            <button
                              type="button"
                              className={watermarkStyle.position === 'top-left' ? 'is-active' : ''}
                              onClick={() => updateWatermarkStyle({ position: 'top-left' })}
                              disabled={!watermarkStyle.enabled}
                            >
                              ↖ Kiri Atas
                            </button>
                            <button
                              type="button"
                              className={watermarkStyle.position === 'top-right' ? 'is-active' : ''}
                              onClick={() => updateWatermarkStyle({ position: 'top-right' })}
                              disabled={!watermarkStyle.enabled}
                            >
                              ↗ Kanan Atas
                            </button>
                            <button
                              type="button"
                              className={watermarkStyle.position === 'center' ? 'is-active' : ''}
                              onClick={() => updateWatermarkStyle({ position: 'center' })}
                              disabled={!watermarkStyle.enabled}
                            >
                              ● Tengah
                            </button>
                            <button
                              type="button"
                              className={watermarkStyle.position === 'bottom-left' ? 'is-active' : ''}
                              onClick={() => updateWatermarkStyle({ position: 'bottom-left' })}
                              disabled={!watermarkStyle.enabled}
                            >
                              ↙ Kiri Bawah
                            </button>
                            <button
                              type="button"
                              className={watermarkStyle.position === 'bottom-right' ? 'is-active' : ''}
                              onClick={() => updateWatermarkStyle({ position: 'bottom-right' })}
                              disabled={!watermarkStyle.enabled}
                            >
                              ↘ Kanan Bawah
                            </button>
                          </div>
                        </div>

                        <div className="field-row-split">
                          <div className="field-block">
                            <label>Ukuran Font</label>
                            <div className="style-toggle-buttons">
                              <button
                                type="button"
                                className={watermarkStyle.size === 'small' ? 'is-active' : ''}
                                onClick={() => updateWatermarkStyle({ size: 'small' })}
                                disabled={!watermarkStyle.enabled}
                              >
                                Kecil
                              </button>
                              <button
                                type="button"
                                className={watermarkStyle.size === 'medium' ? 'is-active' : ''}
                                onClick={() => updateWatermarkStyle({ size: 'medium' })}
                                disabled={!watermarkStyle.enabled}
                              >
                                Sedang
                              </button>
                              <button
                                type="button"
                                className={watermarkStyle.size === 'large' ? 'is-active' : ''}
                                onClick={() => updateWatermarkStyle({ size: 'large' })}
                                disabled={!watermarkStyle.enabled}
                              >
                                Besar
                              </button>
                            </div>
                          </div>

                          <div className="field-block">
                            <div className="field-label-split">
                              <label>Transparansi</label>
                              <strong>{Math.round(watermarkStyle.opacity * 100)}%</strong>
                            </div>
                            <input
                              type="range"
                              min="20"
                              max="100"
                              step="5"
                              value={Math.round(watermarkStyle.opacity * 100)}
                              onChange={(e) => updateWatermarkStyle({ opacity: Number(e.target.value) / 100 })}
                              disabled={!watermarkStyle.enabled}
                              className="timeline"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <header className="settings-header">
              <div><p className="settings-kicker">PENGATURAN</p><h2 id="settings-title">Speech-to-Text</h2><p>Pilih mesin AI Whisper di browser atau hubungkan API luar.</p></div>
              <button className="icon-button" type="button" onClick={() => setSettingsOpen(false)} aria-label="Tutup pengaturan"><CloseIcon /></button>
            </header>

            <form className="settings-form" onSubmit={saveSttSettings}>
              <div className="settings-field settings-field-wide">
                <label>Pilihan Cepat Provider AI STT</label>
                <div className="stt-presets-bar">
                  <button
                    type="button"
                    className={`stt-preset-btn${sttSettings.apiFormat === 'browser-whisper' ? ' is-active' : ''}`}
                    onClick={() => {
                      setSttSettings({
                        ...sttSettings,
                        apiFormat: 'browser-whisper',
                        provider: 'Whisper Web (Bebas API Key)',
                        model: 'Xenova/whisper-tiny',
                        baseUrl: '',
                      });
                      setConnectionState('success');
                      setConnectionMessage('Whisper Web siap. 100% gratis & bebas API key.');
                    }}
                  >
                    ⚡ Whisper Web (Gratis)
                  </button>
                  <button
                    type="button"
                    className={`stt-preset-btn${sttSettings.provider.toLowerCase().includes('groq') ? ' is-active' : ''}`}
                    onClick={() => {
                      setSttSettings({
                        ...sttSettings,
                        apiFormat: 'openai',
                        provider: 'Groq',
                        baseUrl: 'https://api.groq.com/openai/v1',
                        model: 'whisper-large-v3',
                      });
                      setConnectionState('idle');
                      setConnectionMessage('');
                    }}
                  >
                    ⚡ Groq Whisper
                  </button>
                  <button
                    type="button"
                    className={`stt-preset-btn${sttSettings.apiFormat === 'gemini' ? ' is-active' : ''}`}
                    onClick={() => {
                      setSttSettings({
                        ...sttSettings,
                        apiFormat: 'gemini',
                        provider: 'Gemini',
                        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
                        model: 'gemini-1.5-flash',
                      });
                      setConnectionState('idle');
                      setConnectionMessage('');
                    }}
                  >
                    ⚡ Google Gemini
                  </button>
                  <button
                    type="button"
                    className={`stt-preset-btn${sttSettings.provider.toLowerCase() === 'openai' ? ' is-active' : ''}`}
                    onClick={() => {
                      setSttSettings({
                        ...sttSettings,
                        apiFormat: 'openai',
                        provider: 'OpenAI',
                        baseUrl: 'https://api.openai.com/v1',
                        model: 'whisper-1',
                      });
                      setConnectionState('idle');
                      setConnectionMessage('');
                    }}
                  >
                    ⚡ OpenAI Whisper
                  </button>
                </div>
              </div>

              <div className="settings-field settings-field-wide">
                <label htmlFor="stt-format">Format Mesin AI</label>
                <select id="stt-format" value={sttSettings.apiFormat} onChange={(event) => {
                  const nextFormat = event.target.value as SttSettings['apiFormat'];
                  if (nextFormat === 'browser-whisper') {
                    setSttSettings({
                      ...sttSettings,
                      apiFormat: 'browser-whisper',
                      provider: 'Whisper Web (Bebas API Key)',
                      model: 'Xenova/whisper-tiny'
                    });
                  } else {
                    setSttSettings({
                      ...sttSettings,
                      apiFormat: nextFormat,
                      provider: nextFormat === 'openai' ? 'Groq' : sttSettings.provider
                    });
                  }
                }}>
                  <option value="browser-whisper">⚡ Whisper Web (100% Gratis & Bebas API Key)</option>
                  <option value="openai">OpenAI-compatible (Groq Whisper, OpenAI, OpenRouter)</option>
                  <option value="gemini">Google Gemini native</option>
                  <option value="custom">Custom / Provider lain</option>
                </select>
              </div>

              {sttSettings.apiFormat === 'browser-whisper' ? (
                <div className="settings-field settings-field-wide whisper-banner">
                  <div className="whisper-banner-header">
                    <span className="status-dot" />
                    <strong>Mode 100% Client-Side Aktif (Gratis Selamanya)</strong>
                  </div>
                  <p>Model Whisper berjalan langsung di dalam memori browser Anda (WASM/WebGPU). Tidak memerlukan API key, tanpa kuota batas, dan audio Anda tidak dikirim ke server luar.</p>
                </div>
              ) : (
                <>
                  <div className="settings-field settings-field-wide">
                    <label htmlFor="stt-endpoint">API endpoint</label>
                    <input id="stt-endpoint" type="url" value={sttSettings.baseUrl} onChange={(event) => setSttSettings({ ...sttSettings, baseUrl: event.target.value })} placeholder="https://… atau http://localhost:…" required />
                    <small>Isi endpoint dari Groq (https://api.groq.com/openai/v1), Gemini, OpenAI, dll.</small>
                  </div>

                  <div className="settings-field settings-field-wide">
                    <label htmlFor="stt-key">API key</label>
                    <div className="secret-field">
                      <input id="stt-key" type={showApiKey ? 'text' : 'password'} value={sttSettings.apiKey} onChange={(event) => setSttSettings({ ...sttSettings, apiKey: event.target.value })} autoComplete="off" placeholder="sk-…" />
                      <button type="button" onClick={() => setShowApiKey(!showApiKey)}>{showApiKey ? 'Sembunyikan' : 'Tampilkan'}</button>
                    </div>
                    <small>Disimpan hanya selama sesi browser dan tidak dimasukkan ke GitHub.</small>
                  </div>
                </>
              )}

              <div className="settings-field">
                <label htmlFor="stt-provider">Nama provider</label>
                <input id="stt-provider" type="text" list="stt-provider-options" value={sttSettings.provider} onChange={(event) => setSttSettings({ ...sttSettings, provider: event.target.value })} placeholder="Contoh: Whisper Web" required />
                <datalist id="stt-provider-options">{STT_PROVIDER_SUGGESTIONS.map((provider) => <option key={provider} value={provider} />)}</datalist>
              </div>

              <div className="settings-field">
                <label htmlFor="stt-model">{sttSettings.apiFormat === 'browser-whisper' ? 'Ukuran Model Whisper' : 'Model ID'}</label>
                {sttSettings.apiFormat === 'browser-whisper' ? (
                  <select id="stt-model" value={sttSettings.model} onChange={(event) => setSttSettings({ ...sttSettings, model: event.target.value })}>
                    <option value="Xenova/whisper-tiny">Whisper Tiny (~39 MB, Cepat & Ringan)</option>
                    <option value="Xenova/whisper-base">Whisper Base (~74 MB, Lebih Teliti)</option>
                  </select>
                ) : (
                  <input id="stt-model" type="text" value={sttSettings.model} onChange={(event) => setSttSettings({ ...sttSettings, model: event.target.value })} placeholder="Contoh: whisper-large-v3" required />
                )}
              </div>

              <div className="settings-field">
                <label htmlFor="stt-language">Bahasa audio</label>
                <select id="stt-language" value={sttSettings.language} onChange={(event) => setSttSettings({ ...sttSettings, language: event.target.value })}>
                  <option value="id">Bahasa Indonesia</option>
                  <option value="auto">Deteksi otomatis</option>
                  <option value="en">English</option>
                </select>
              </div>

              <div className="settings-field">
                <label htmlFor="stt-timestamps">Timestamp subtitle</label>
                <select id="stt-timestamps" value={sttSettings.timestamps} onChange={(event) => setSttSettings({ ...sttSettings, timestamps: event.target.value as SttSettings['timestamps'] })}>
                  <option value="segment">Per kalimat (lebih rapi)</option>
                  <option value="word">Per kata (lebih rapat)</option>
                </select>
              </div>

              {connectionState !== 'idle' && <p className={`connection-message is-${connectionState}`} role="status">{connectionMessage}</p>}
              {connectionState === 'idle' && sttSettings.apiFormat !== 'browser-whisper' && <p className="settings-check-hint">Cek pengaturan terlebih dahulu. Tombol simpan akan aktif jika koneksi berhasil.</p>}

              <footer className="settings-actions">
                <button className="button button-secondary" type="button" onClick={testSttConnection} disabled={connectionState === 'testing'}>{connectionState === 'testing' ? 'Memeriksa…' : settingsVerified ? 'Cek ulang' : 'Cek koneksi'}</button>
                <button className="button button-primary" type="submit">Simpan pengaturan</button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};
