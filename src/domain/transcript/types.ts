export interface WordTimestamp {
  word: string;
  startUs: number;
  endUs: number;
  confidence: number;
}

export interface TranscriptSegment {
  id: string;
  startUs: number;
  endUs: number;
  text: string;
  words: WordTimestamp[];
  speakerId?: string;
}

export interface TranscriptDocument {
  id: string;
  projectId: string;
  language: string;
  modelId: string;
  segments: TranscriptSegment[];
}
