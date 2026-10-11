import { YoutubeTranscript } from "youtube-transcript";
import { config } from "../../config";

export interface TimedTranscriptChunk {
  text: string;          // "[0:06] text..." with timestamp tag for LLM
  rawText: string;       // clean text without tag
  start: number;         // exact start time in seconds
  duration: number;      // segment duration in seconds
  formattedTime: string; // "MM:SS"
}

/**
 * Extracts YouTube video transcript and groups them into coherent chunks
 * while preserving the EXACT start timestamp for every chunk.
 */
export const extractTimedTranscriptChunks = async (
  videoUrl: string,
  targetChunkChars: number = 700
): Promise<TimedTranscriptChunk[]> => {
  let transcriptItems;
  try {
    transcriptItems = await YoutubeTranscript.fetchTranscript(videoUrl, {
      lang: "en",
    });
  } catch {
    transcriptItems = await YoutubeTranscript.fetchTranscript(videoUrl);
  }

  if (!transcriptItems || transcriptItems.length === 0) {
    throw new Error("No transcript items found for this video.");
  }

  const chunks: TimedTranscriptChunk[] = [];
  let currentGroup: string[] = [];
  let currentStart = 0;
  let currentDuration = 0;
  let currentLength = 0;

  for (let i = 0; i < transcriptItems.length; i++) {
    const item = transcriptItems[i];
    const itemStartSec = Math.floor(item.offset / 1000);

    if (currentGroup.length === 0) {
      currentStart = itemStartSec;
    }

    currentGroup.push(item.text);
    currentLength += item.text.length + 1;
    currentDuration =
      itemStartSec + Math.floor(item.duration / 1000) - currentStart;

    if (currentLength >= targetChunkChars || i === transcriptItems.length - 1) {
      const rawText = currentGroup.join(" ");
      const mins = Math.floor(currentStart / 60);
      const secs = (currentStart % 60).toString().padStart(2, "0");
      const formattedTime = `${mins}:${secs}`;

      chunks.push({
        start: currentStart,
        formattedTime,
        duration: Math.max(currentDuration, 15),
        rawText,
        text: `[${formattedTime}] ${rawText}`,
      });

      currentGroup = [];
      currentLength = 0;

      if (chunks.length > config.maxTranscriptChunks) {
        throw new Error(
          `Transcript exceeds the maximum supported length (${config.maxTranscriptChunks} chunks). This video is too long to ingest.`
        );
      }
    }
  }

  return chunks;
};

