export type TimingPrecision = 'word-native' | 'segment-derived' | 'estimated';

export interface TranscriptWord {
  id: string;
  text: string;
  sourceStartUs: number;
  sourceEndUs: number;
  confidence?: number;
  timingPrecision: TimingPrecision;
}

export interface SubtitleWord {
  id: string;
  transcriptWordId: string;
  text: string;
  sourceStartUs: number;
  sourceEndUs: number;
  localStartUs: number;
  localEndUs: number;
  emphasis: 'none' | 'active' | 'keyword';
}

export interface SubtitleCue {
  id: string;
  words: SubtitleWord[];
  text: string;
  sourceStartUs: number;
  sourceEndUs: number;
  localStartUs: number;
  localEndUs: number;
  lineBreakAfterWordIds?: string[];
}

export interface SubtitleTrack {
  id: string;
  candidateId: string;
  transcriptId: string;
  candidateStartUs: number;
  candidateEndUs: number;
  mode: 'phrase' | 'active-word' | 'kinetic-editorial';
  globalOffsetUs: number;
  cues: SubtitleCue[];
}

export interface SubtitleCueOverride {
  cueId: string;
  text?: string;
  startOffsetUs?: number;
  endOffsetUs?: number;
  lineBreakAfterWordIds?: string[];
}

export interface WordTimestamp {
  word: string;
  startUs: number;
  endUs: number;
  confidence?: number;
}

export interface TranscriptSegment {
  id: string;
  startUs: number;
  endUs: number;
  text: string;
  words: WordTimestamp[];
}

export interface TranscriptDocument {
  id: string;
  projectId: string;
  language: string;
  modelId: string;
  segments: TranscriptSegment[];
  words?: TranscriptWord[];
}
