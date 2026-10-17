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

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Fetches transcript from RapidAPI (youtube-transcript3) when RAPIDAPI_KEY is configured.
 * This completely bypasses datacenter IP blocking on cloud hosts like AWS EC2.
 */
async function fetchTranscriptViaRapidApi(
  videoUrl: string
): Promise<Array<{ text: string; duration: number; offset: number }> | null> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) return null;

  const host = process.env.RAPIDAPI_HOST || "youtube-transcript3.p.rapidapi.com";
  const encodedUrl = encodeURIComponent(videoUrl);

  const endpoints = [
    `https://${host}/api/transcript-with-url?url=${encodedUrl}&lang=en`,
    `https://${host}/api/transcript-with-url?url=${encodedUrl}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          "x-rapidapi-host": host,
          "x-rapidapi-key": apiKey,
        },
      });

      if (!res.ok) continue;

      const data: any = await res.json();
      if (data && data.success && Array.isArray(data.transcript) && data.transcript.length > 0) {
        return data.transcript.map((item: any) => ({
          text: decodeHtmlEntities(String(item.text || "")),
          duration: Math.round((parseFloat(item.duration) || 0) * 1000),
          offset: Math.round((parseFloat(item.offset ?? item.start) || 0) * 1000),
        }));
      }
    } catch (err: unknown) {
      console.warn(
        `[WARN] RapidAPI transcript fetch error (${endpoint}):`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return null;
}

/**
 * Extracts YouTube video transcript and groups them into coherent chunks
 * while preserving the EXACT start timestamp for every chunk.
 */
export const extractTimedTranscriptChunks = async (
  videoUrl: string,
  targetChunkChars: number = 700
): Promise<TimedTranscriptChunk[]> => {
  let transcriptItems: Array<{ text: string; duration: number; offset: number }> | undefined;

  // 1. Try RapidAPI first if key is present (bypasses cloud datacenter IP blocks)
  if (process.env.RAPIDAPI_KEY) {
    try {
      const rapidItems = await fetchTranscriptViaRapidApi(videoUrl);
      if (rapidItems && rapidItems.length > 0) {
        transcriptItems = rapidItems;
      }
    } catch (rapidErr) {
      console.warn("[WARN] RapidAPI extraction failed, falling back to direct fetch:", rapidErr);
    }
  }

  // 2. Fall back to direct YouTube scraper if RapidAPI is absent or returned no items
  if (!transcriptItems || transcriptItems.length === 0) {
    try {
      transcriptItems = await YoutubeTranscript.fetchTranscript(videoUrl, {
        lang: "en",
      });
    } catch {
      // Retry with default or any available language
      try {
        transcriptItems = await YoutubeTranscript.fetchTranscript(videoUrl);
      } catch (finalErr: unknown) {
        const msg =
          finalErr instanceof Error ? finalErr.message : String(finalErr);
        if (
          msg.includes("Transcript is disabled") ||
          msg.includes("No transcripts are available")
        ) {
          throw new Error(
            "Captions or transcripts are disabled or restricted by YouTube for this video."
          );
        }
        throw finalErr;
      }
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
  return chunks;
};

/**
 * Parses user-provided custom transcript text into semantic TimedTranscriptChunks.
 * Handles both timestamped text (e.g. "[01:30] text" or "01:30 text")
 * and plain continuous text.
 */
export const parseCustomTranscriptToTimedChunks = async (
  rawTranscript: string,
  targetChunkChars: number = 700
): Promise<TimedTranscriptChunk[]> => {
  if (!rawTranscript || !rawTranscript.trim()) {
    throw new Error("Transcript text cannot be empty.");
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: targetChunkChars,
    chunkOverlap: 150,
  });

  const splitTexts = await splitter.splitText(rawTranscript.trim());

  if (splitTexts.length > config.maxTranscriptChunks) {
    throw new Error(
      `Transcript exceeds the maximum supported length (${config.maxTranscriptChunks} chunks).`
    );
  }

  const chunks: TimedTranscriptChunk[] = splitTexts.map((chunkStr, index) => {
    const match = /\[?(\d{1,2}):(\d{2})\]?/.exec(chunkStr);
    let start: number;
    let formattedTime: string;

    if (match) {
      const mins = Number.parseInt(match[1], 10);
      const secs = Number.parseInt(match[2], 10);
      start = mins * 60 + secs;
      formattedTime = `${mins}:${secs.toString().padStart(2, "0")}`;
    } else {
      start = index * 30;
      const mins = Math.floor(start / 60);
      const secs = start % 60;
      formattedTime = `${mins}:${secs.toString().padStart(2, "0")}`;
    }

    const rawText = chunkStr.replace(/\[?\d{1,2}:\d{2}\]?\s*/g, "").trim();

    return {
      start,
      formattedTime,
      duration: 30,
      rawText: rawText || chunkStr,
      text: `[${formattedTime}] ${rawText || chunkStr}`,
    };
  });

  return chunks;
};


