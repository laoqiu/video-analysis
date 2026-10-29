export interface AnalysisConfig {
  ffmpegPath: string;
  volcengineApiKey: string;
}

export interface AnalysisVideoInput {
  id: string;
  localPath: string;
  title?: string;
  author?: string;
  type?: "video" | "image-text";
  durationMs?: number;
  sourceUrl?: string;
}

export interface TranscriptRecord extends AnalysisVideoInput {
  transcript: string;
  status: "pending" | "processing" | "completed" | "error";
  error?: string;
  updatedAt: string;
}

export interface TranscriptRunResult {
  total: number;
  completed: number;
  skipped: number;
  failed: number;
  items: Array<Pick<TranscriptRecord, "id" | "title" | "status" | "transcript" | "error">>;
}
