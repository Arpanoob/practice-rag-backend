import { QdrantClient } from "@qdrant/js-client-rest";
import { config } from "../config";

export const qdrant = new QdrantClient({
  url: config.qdrant.url,
  apiKey: config.qdrant.apiKey,
});

export const COLLECTION_NAME = config.qdrant.collectionName;

export async function initCollection() {
  const collections = await qdrant.getCollections();
  const exists = collections.collections.some(
    (c) => c.name === COLLECTION_NAME,
  );
  if (!exists) {
    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: {
        size: config.qdrant.vectorSize,
        distance: "Cosine",
      },
    });
  }

  await qdrant.createPayloadIndex(COLLECTION_NAME, {
    field_name: "text",
    field_schema: "text",
  });
}

