import { generateEmbedding } from "../data-retrieval/query-to-embedding/toEmbedding";
import { createPromptForQueryWithRetrievedContext } from "../data-retrieval/prompt/prompt";
import { callLLM } from "../data-retrieval/llm-call/llm.call";
import {
  searchSimilarChunks,
  getFirstChunk,
  getAllChunksForVideo,
} from "../knowledgeBase/dao";
import {
  AskQuestionParams,
  AskQuestionResult,
  VideoTranscriptChunk,
  VideoChunkPayload,
} from "../types/interface/ask.interface";
import { LruCache } from "../utils/lruCache";
import { logger } from "../utils/logger";
import { config } from "../config";

const summaryCache = new LruCache<string>(
  config.summaryCache.maxEntries,
  config.summaryCache.ttlMs
);


export async function askQuestionService(
  params: AskQuestionParams
): Promise<AskQuestionResult> {
  const { videoUrl, query, limit = 4 } = params;

  const embeddings = await generateEmbedding(query);
  const queryEmbedding = embeddings[0];

  if (!queryEmbedding) {
    throw new Error("Failed to generate embedding for query.");
  }

  const points = await searchSimilarChunks(videoUrl, queryEmbedding, limit);

  // If query is about video start or overview, include the introductory chunk
  const isIntroQuery = /start|when|time|begin|intro|first|overview/i.test(query);
  if (isIntroQuery) {
    const firstPoint = await getFirstChunk(videoUrl);
    if (firstPoint && !points.some((p) => p.id === firstPoint.id)) {
      points.unshift(firstPoint);
    }
  }

  // Deduplicate and order chronologically for coherent LLM context
  const uniquePoints = Array.from(
    new Map(points.map((p) => [String(p.id), p])).values()
  ).sort((a, b) => {
    const startA = (a.payload as unknown as VideoChunkPayload)?.start ?? 0;
    const startB = (b.payload as unknown as VideoChunkPayload)?.start ?? 0;
    return startA - startB;
  });

  const contextChunks = uniquePoints
    .map((point) => (point.payload as unknown as VideoChunkPayload)?.text)
    .filter((text): text is string => Boolean(text));

  if (contextChunks.length === 0) {
    return {
      videoUrl,
      query,
      answer:
        "No matching video transcript context was found in the knowledge base. Please ensure this video has been ingested first.",
      relevantChunks: [],
    };
  }

  const prompt = createPromptForQueryWithRetrievedContext(query, contextChunks);
  const answer = await callLLM(prompt);

  const relevantChunks: VideoTranscriptChunk[] = uniquePoints.map((point) => {
    const payload = point.payload as unknown as VideoChunkPayload;
    return {
      text: payload?.rawText || payload?.text || "",
      start: payload?.start ?? 0,
      duration: payload?.duration ?? 30,
      score: point.score ?? 0,
    };
  });

  return {
    videoUrl,
    query,
    answer,
    relevantChunks,
  };
}


const inFlightSummaries = new Map<string, Promise<string>>();

/**
 * Builds an immediate, structured summary directly from video chunks
 * with interactive timestamp tags (0 ms delay).
 */
export function buildInstantSummary(points: Array<{ payload?: any }>): string {
  if (!points || points.length === 0) {
    return "No transcript available for this video.";
  }

  const firstPayload = points[0]?.payload as VideoChunkPayload | undefined;
  const rawFirst = (firstPayload?.rawText || firstPayload?.text || "").replace(
    /^\[\d+:\d+\]\s*/,
    ""
  );
  const overviewSnippet = rawFirst.slice(0, 250).trim();

  // Pick up to 4 representative key moments across the video with real timestamps
  const keyMoments: string[] = [];
  const count = Math.min(4, points.length);
  const step = Math.max(1, Math.floor(points.length / count));

  for (let i = 0; i < points.length && keyMoments.length < 4; i += step) {
    const payload = points[i]?.payload as VideoChunkPayload | undefined;
    if (payload) {
      const startSec = payload.start ?? 0;
      const mins = Math.floor(startSec / 60);
      const secs = (startSec % 60).toString().padStart(2, "0");
      const timeTag = payload.formattedTime || `${mins}:${secs}`;
      const raw = (payload.rawText || payload.text || "").replace(
        /^\[\d+:\d+\]\s*/,
        ""
      );
      const snippet = raw.slice(0, 100).trim();
      keyMoments.push(`* [${timeTag}] ${snippet}...`);
    }
  }

  return `### 📌 Quick Overview
${overviewSnippet}...

### 🔑 Key Moments & Highlights
${keyMoments.join("\n")}

### 💡 Main Takeaway
Click any timestamp above or ask a question in the chat to jump directly to any topic in the video!`;
}

export async function getVideoSummaryService(
  videoUrl: string,
  forceRefresh: boolean = false
): Promise<string> {
  if (!forceRefresh && summaryCache.has(videoUrl)) {
    return summaryCache.get(videoUrl)!;
  }

  // Deduplicate in-flight requests for the same video
  if (!forceRefresh && inFlightSummaries.has(videoUrl)) {
    return inFlightSummaries.get(videoUrl)!;
  }

  const points = await getAllChunksForVideo(videoUrl);
  if (!points || points.length === 0) {
    throw new Error(
      "No video transcript found in knowledge base. Please ingest the video first."
    );
  }

  const instantSummary = buildInstantSummary(points);

  // Background promise to run concise LLaMA synthesis
  const generatePromise = (async () => {
    try {
      const transcriptText = sampleTranscript(points);
      const prompt = `You are a concise video summarizer.
Below are brief moments from a video with timestamps:
${transcriptText}

Create a structured summary in clean markdown:

### 📌 Quick Overview
2-3 sentence overview of what the video explains.

### 🔑 Key Moments & Highlights
3-4 bullets. Each MUST start with its exact timestamp in brackets like * [MM:SS] Topic: Brief explanation.

### 💡 Main Takeaway
1-2 sentence core conclusion.`;

      // Limit response to 180 tokens for fast generation
      const summary = await callLLM(prompt, 180);
      summaryCache.set(videoUrl, summary);
      return summary;
    } catch (err) {
      logger.warn("LLM summary generation failed, using instant summary", {
        error: err instanceof Error ? err.message : String(err),
      });
      summaryCache.set(videoUrl, instantSummary);
      return instantSummary;
    } finally {
      inFlightSummaries.delete(videoUrl);
    }
  })();

  inFlightSummaries.set(videoUrl, generatePromise);

  if (forceRefresh) {
    return generatePromise;
  }

  // Return within 2.5 seconds max so the browser NEVER hangs or times out
  const fastResult = await Promise.race([
    generatePromise,
    new Promise<string>((resolve) =>
      setTimeout(() => resolve(instantSummary), 2500)
    ),
  ]);

  return fastResult;
}

function sampleTranscript(points: Array<{ payload?: any }>): string {
  if (points.length === 0) return "";

  // Sample at most 4 brief moments across the video to keep prompt under 120 tokens
  const indices =
    points.length <= 4
      ? points.map((_, i) => i)
      : [
          0,
          Math.floor(points.length * 0.33),
          Math.floor(points.length * 0.66),
          points.length - 1,
        ];

  const unique = Array.from(new Set(indices));

  return unique
    .map((idx) => {
      const payload = points[idx]?.payload as VideoChunkPayload | undefined;
      const text = payload?.text || "";
      return text.length > 130 ? text.slice(0, 120) + "..." : text;
    })
    .join("\n\n");
}
