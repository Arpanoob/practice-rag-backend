export interface VideoTranscriptChunk {
  text: string;
  start: number; // timestamp in seconds
  duration: number; // duration in seconds
  score?: number; // similarity score
}

export interface IngestionProgress {
  step: number; // 0 to 4
  progress: number; // 0 to 100%
  message: string;
}

export interface IngestVideoResult {
  videoUrl: string;
  chunksCount: number;
  message: string;
  initialOverview?: string;
  summary?: string;
  sampleChunks?: VideoTranscriptChunk[];
  alreadyIngested?: boolean;
}

export interface VideoChunkPayload {
  videoUrl: string;
  videoId?: string;
  text: string;
  rawText?: string;
  start: number;
  duration: number;
  formattedTime?: string;
  chunkIndex?: number;
}
