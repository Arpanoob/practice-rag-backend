import { COLLECTION_NAME, qdrant } from "../../knowledgeBase/db.vector";
import { buildVideoFilter } from "../../knowledgeBase/dao";

export async function hybridSearchChunks(
  videoUrl: string,
  queryEmbedding: number[],
  queryText: string,
  limit: number = 4
) {
  const videoFilter = buildVideoFilter(videoUrl);

  const results = await qdrant.query(COLLECTION_NAME, {
    prefetch: [
      // 1. Dense Vector Search (Semantic meaning)
      {
        query: queryEmbedding,
        filter: videoFilter,
        limit: limit * 3,
      },
      // 2. Keyword Text Search directly inside Qdrant!
      {
        filter: {
          must: [
            videoFilter,
            { key: "text", match: { text: queryText } },
          ],
        },
        limit: limit * 3,
      },
    ],
    // 3. Qdrant merges both results using RRF inside the DB!
    query: { fusion: "rrf" },
    limit,
    with_payload: true,
  });

  return results.points;
}