import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { YoutubeTranscript } from "youtube-transcript";
import { ProxyAgent } from "undici";
import { config } from "../../config";

export interface TimedTranscriptChunk {
  text: string;          // "[0:06] text..." with timestamp tag for LLM
  rawText: string;       // clean text without tag
  start: number;         // exact start time in seconds
  duration: number;      // segment duration in seconds
  formattedTime: string; // "MM:SS"
}

let cachedSessionCookies: string | null = null;
let cookiesExpiresAt = 0;

/**
 * Automatically initiates a YouTube visitor session by requesting youtube.com
 * and gathering real visitor cookies (VISITOR_INFO1_LIVE, __Secure-*, YSC, etc.)
 * Caches in memory for 1 hour to prevent redundant handshakes.
 */
export async function getYoutubeSessionCookies(forceRefresh = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh && cachedSessionCookies && now < cookiesExpiresAt) {
    return cachedSessionCookies;
  }

  const proxyUrl =
    process.env.YOUTUBE_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY;
  const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

  try {
    const res = await fetch("https://www.youtube.com", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
      ...(dispatcher ? { dispatcher } : {}),
    });

    const rawCookies: string[] =
      typeof (res.headers as any).getSetCookie === "function"
        ? (res.headers as any).getSetCookie()
        : [res.headers.get("set-cookie") || ""];

    const parsed = rawCookies
      .map((c) => c.split(";")[0].trim())
      .filter((c) => c.length > 0 && c.includes("="));

    // Append any explicit custom cookie from environment if supplied
    const envCookie = process.env.YOUTUBE_COOKIE;
    if (envCookie) {
      parsed.push(envCookie.trim());
    }

    cachedSessionCookies = parsed.join("; ");
    cookiesExpiresAt = now + 3600 * 1000; // cache for 1 hour
    return cachedSessionCookies;
  } catch (err: unknown) {
    console.warn(
      "[WARN] Failed to auto-gather YouTube visitor session cookies:",
      err instanceof Error ? err.message : String(err)
    );
    return process.env.YOUTUBE_COOKIE || "";
  }
}

/**
 * Extracts YouTube video transcript and groups them into coherent chunks
 * while preserving the EXACT start timestamp for every chunk.
 */
export const extractTimedTranscriptChunks = async (
  videoUrl: string,
  targetChunkChars: number = 700
): Promise<TimedTranscriptChunk[]> => {
  const proxyUrl =
    process.env.YOUTUBE_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY;
  const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

  const createSessionFetch = async (forceRefreshCookies = false) => {
    const sessionCookies = await getYoutubeSessionCookies(forceRefreshCookies);

    const sessionFetch: typeof globalThis.fetch = async (input, init) => {
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
      if (sessionCookies && !headers.has("Cookie")) {
        headers.set("Cookie", sessionCookies);
      }
      return fetch(input, {
        ...init,
        headers,
        ...(dispatcher ? { dispatcher } : {}),
      });
    };
    return sessionFetch;
  };

  let transcriptItems;
  let browserFetch = await createSessionFetch(false);

  try {
    transcriptItems = await YoutubeTranscript.fetchTranscript(videoUrl, {
      lang: "en",
      fetch: browserFetch,
    });
  } catch (firstErr: unknown) {
    // Retry with any available language
    try {
      transcriptItems = await YoutubeTranscript.fetchTranscript(videoUrl, {
        fetch: browserFetch,
      });
    } catch {
      // Force refresh session cookies and try one more time
      try {
        browserFetch = await createSessionFetch(true);
        transcriptItems = await YoutubeTranscript.fetchTranscript(videoUrl, {
          fetch: browserFetch,
        });
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


