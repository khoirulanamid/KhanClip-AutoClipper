import { TranscriptWord } from '@/domain/transcript/types';
import { SubtitlePresetStyle } from '@/domain/render/canvas_overlay';

/**
 * BoundingBox in normalized coordinates [0..1]
 */
export interface BoundingBox {
  x: number; // 0..1
  y: number; // 0..1
  width: number; // 0..1
  height: number; // 0..1
}

export interface CandidateScore {
  totalScore: number; // 0..100 Quality Candidate Score (NOT viral score)
  hookScore: number;
  flowScore: number;
  clarityScore: number;
  relevanceScore: number;
  reasons: string[];
}

export interface SmartCropPoint {
  timestampUs: number;
  cropWindow: BoundingBox;
  faceBox?: BoundingBox;
}

export interface Candidate {
  id: string;
  projectId: string;
  title: string;
  headline: string;
  transcriptText: string;
  /**
   * Per-word source timestamps for this candidate's window. Preview and
   * renderer must consume these instead of re-synthesizing timing.
   */
  transcriptWords?: TranscriptWord[];
  keywords: string[];
  startUs: number;
  endUs: number;
  durationUs: number;
  score: CandidateScore;
  recommendedLayout: 'smart_editorial' | 'center_focus' | 'bg_blur' | 'simple_subtitle';
  selectedLayout: 'smart_editorial' | 'center_focus' | 'bg_blur' | 'simple_subtitle';
  smartCropPoints: SmartCropPoint[];
  thumbnailUrl?: string;
  selectedForRender: boolean;
  manualOverride: boolean;
  /** Subtitle preset chosen in the editor; render must match preview. */
  subtitleStyle?: SubtitlePresetStyle;
  /** Global subtitle offset in microseconds (-500ms..+500ms). */
  globalOffsetUs?: number;
}
