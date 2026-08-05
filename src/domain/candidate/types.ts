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
}
