import { randomUUID } from "node:crypto";
import { COLLECTION_NAME, qdrant } from "./db.vector";
import { extractVideoId } from "../utils/youtube";
import { logger } from "../utils/logger";

export interface ChunkPayloadItem {
  text: string;
  start?: number;
  duration?: number;
  formattedTime?: string;
}

/**
 * Builds a resilient Qdrant filter condition matching either videoUrl OR videoId.
 */
export function buildVideoFilter(videoUrl: string) {
  const videoId = extractVideoId(videoUrl);
  if (videoId) {
    return {
      should: [
        { key: "videoUrl", match: { value: videoUrl } },
        { key: "videoId", match: { value: videoId } },
      ],
    };
  }
  return {
    must: [{ key: "videoUrl", match: { value: videoUrl } }],
  };
}

/**
 * Checks if a video has already been ingested into the Qdrant knowledge base.
 */
export async function isVideoAlreadyIngested(videoUrl: string): Promise<boolean> {
  try {
    const filter = buildVideoFilter(videoUrl);
    const countRes = await qdrant.count(COLLECTION_NAME, {
      filter,
      exact: true,
    });
    return countRes.count > 0;
  } catch (err) {
    logger.error("Error checking isVideoAlreadyIngested", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Returns the number of existing chunks indexed for a specific video.
 */
export async function getChunksCountForVideo(videoUrl: string): Promise<number> {
  try {
    const filter = buildVideoFilter(videoUrl);
    const countRes = await qdrant.count(COLLECTION_NAME, {
      filter,
      exact: true,
    });
    return countRes.count;
  } catch {
    return 0;
  }
}

export async function deleteChunksForVideo(videoUrl: string): Promise<void> {
  try {
    const filter = buildVideoFilter(videoUrl);
    await qdrant.delete(COLLECTION_NAME, {
      wait: true,
      filter,
    });
  } catch (err) {
    logger.warn("Could not delete previous chunks for video", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function saveChunksToQdrant(
  videoUrl: string,
  chunks: string[] | ChunkPayloadItem[],
  embeddings: number[][]
) {
  // Delete any previous points for this video to prevent duplicate or stale chunks
  await deleteChunksForVideo(videoUrl);

  const videoId = extractVideoId(videoUrl) || undefined;

  const points = chunks.map((item, index) => {
    const isString = typeof item === "string";
    const text = isString ? item : item.text;
    const start = isString ? index * 45 : (item.start ?? index * 45);
    const duration = isString ? 30 : (item.duration ?? 30);
    const mins = Math.floor(start / 60);
    const secs = (start % 60).toString().padStart(2, "0");
    const formattedTime = isString
      ? `${mins}:${secs}`
      : (item.formattedTime || `${mins}:${secs}`);

    return {
      id: randomUUID(),
      vector: embeddings[index],
      payload: {
        videoUrl,
        videoId,
        text,
        start,
        duration,
        formattedTime,
        chunkIndex: index,
      },
    };
  });

  await qdrant.upsert(COLLECTION_NAME, {
    wait: true,
    points,
  });
}

/**
 * Retrieve the first introductory chunk (chunkIndex = 0) of the video
 */
export async function getFirstChunk(videoUrl: string) {
  try {
    const videoFilter = buildVideoFilter(videoUrl);
    const results = await qdrant.query(COLLECTION_NAME, {
      limit: 1,
      with_payload: true,
      filter: {
        must: [videoFilter, { key: "chunkIndex", match: { value: 0 } }],
      },
    });
    return results.points[0] || null;
  } catch {
    return null;
  }
}

/**
 * Retrieve ALL chunks for a video ordered chronologically by chunkIndex.
 * Pages through the Qdrant scroll API so long videos are not silently truncated.
 */
export async function getAllChunksForVideo(videoUrl: string) {
  const PAGE_SIZE = 256;
  const MAX_POINTS = 5000; // hard safety ceiling
  try {
    const filter = buildVideoFilter(videoUrl);
    const collected: Awaited<
      ReturnType<typeof qdrant.scroll>
    >["points"] = [];
    let offset: string | number | undefined = undefined;

    while (collected.length < MAX_POINTS) {
      const scrollRes = await qdrant.scroll(COLLECTION_NAME, {
        filter,
        limit: PAGE_SIZE,
        with_payload: true,
        offset,
      });

      collected.push(...scrollRes.points);

      const next = scrollRes.next_page_offset;
      if (!next || scrollRes.points.length === 0) break;
      offset = next as string | number;
    }

    return collected.sort((a, b) => {
      const idxA = (a.payload as Record<string, unknown>)?.chunkIndex as number ?? 0;
      const idxB = (b.payload as Record<string, unknown>)?.chunkIndex as number ?? 0;
      return idxA - idxB;
    });
  } catch (err) {
    logger.error("Error in getAllChunksForVideo", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
