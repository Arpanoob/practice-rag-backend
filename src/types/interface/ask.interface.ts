import { VideoTranscriptChunk, VideoChunkPayload } from "./video.search.interface";

export type { VideoTranscriptChunk, VideoChunkPayload };

export interface AskQuestionParams {
  videoUrl: string;
  query: string;
  limit?: number;
}

export interface AskQuestionResult {
  videoUrl: string;
  query: string;
  answer: string;
  relevantChunks: VideoTranscriptChunk[];
}

export interface VideoSummaryResult {
  videoUrl: string;
  summary: string;
}

export interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export interface AskQuestionParams {
  videoUrl: string;
  query: string;
  history?: ChatHistoryItem[];
  limit?: number;
}