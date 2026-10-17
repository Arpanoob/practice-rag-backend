import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
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
  const browserFetch: typeof globalThis.fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("User-Agent")) {
      headers.set(
        "User-Agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
      );
    }
    if (!headers.has("Accept-Language")) {
      headers.set("Accept-Language", "en-US,en;q=0.9");
    }
    return fetch(input, { ...init, headers });
  };

  let transcriptItems;
  try {
    transcriptItems = await YoutubeTranscript.fetchTranscript(videoUrl, {
      lang: "en",
      fetch: browserFetch,
    });
  } catch (err: unknown) {
    try {
      transcriptItems = await YoutubeTranscript.fetchTranscript(videoUrl, {
        fetch: browserFetch,
      });
    } catch {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("Transcript is disabled") ||
        msg.includes("No transcripts are available")
      ) {
        throw new Error(
          "Captions or transcripts are disabled or restricted by YouTube for this video."
        );
      }
      throw err;
    }
  }

  if (!transcriptItems || transcriptItems.length === 0) {
    throw new Error(
      "Captions or transcripts are disabled or unavailable for this video."
    );
  }


  const fullTaggedText = transcriptItems
  .map((item) => {
    const sec = Math.floor(item.offset / 1000);
    const mins = Math.floor(sec / 60);
    const secs = (sec % 60).toString().padStart(2, "0");
    return `[${mins}:${secs}] ${item.text}`;
  })
  .join(" ");
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: targetChunkChars,
    chunkOverlap: 150,
  });
  const splitTexts = await splitter.splitText(fullTaggedText);
  
  if (splitTexts.length > config.maxTranscriptChunks) {
    throw new Error(
      `Transcript exceeds the maximum supported length (${config.maxTranscriptChunks} chunks).`
    );
  }
const chunks: TimedTranscriptChunk[] = splitTexts.map((chunkStr) => {
    const match = new RegExp(/\[(\d+):(\d+)\]/).exec(chunkStr);
    const mins = match ? Number.parseInt(match[1], 10) : 0;
    const secs = match ? Number.parseInt(match[2], 10) : 0;
    const start = mins * 60 + secs;
    const formattedTime = `${mins}:${secs.toString().padStart(2, "0")}`;
    // Clean text without all the [MM:SS] tags for the UI citation cards
    const rawText = chunkStr.replace(/\[\d+:\d+\]\s*/g, "").trim();
    return {
      start,
      formattedTime,
      duration: 30,
      rawText,
      text: `[${formattedTime}] ${rawText}`,
    };
  });
  return chunks;};

