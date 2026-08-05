export type ProjectStatus =
  | 'created'
  | 'analyzing'
  | 'candidates_ready'
  | 'rendering'
  | 'completed'
  | 'error';

export interface SourceMediaRef {
  id: string;
  displayName: string;
  sizeBytes: number;
  durationUs: number;
  width: number;
  height: number;
  frameRate?: number;
  videoCodec?: string;
  audioCodec?: string;
  container?: string;
  fingerprint: string;
  fileHandleKey?: string;
}

export interface ProjectSettings {
  language: 'auto' | 'id' | 'en';
  candidateCount: 'auto' | 3 | 5 | 10 | 'all_passing';
  targetDurationSec: '15_30' | '30_60' | '60_90' | 'auto';
  layoutTemplate: 'smart_editorial' | 'center_focus' | 'bg_blur' | 'simple_subtitle';
  performanceProfile: 'eco' | 'balanced' | 'max';
  outputResolution: '720x1280' | '1080x1920';
}

export interface Project {
  id: string;
  schemaVersion: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  source: SourceMediaRef;
  settings: ProjectSettings;
  transcriptId?: string;
  candidateIds: string[];
  renderJobIds: string[];
  status: ProjectStatus;
}
