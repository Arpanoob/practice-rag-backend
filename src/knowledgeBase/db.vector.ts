import { QdrantClient } from "@qdrant/js-client-rest";
import { config } from "../config";

export const qdrant = new QdrantClient({
  url: config.qdrant.url,
  apiKey: config.qdrant.apiKey,
});

export const COLLECTION_NAME = config.qdrant.collectionName;

export async function initCollection() {
  const collections = await qdrant.getCollections();
  const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);
  if (!exists) {
    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: {
        size: config.qdrant.vectorSize,
        distance: "Cosine",
      },
    });
  }
}

export async function flushCollection() {
  const collections = await qdrant.getCollections();
  const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);
  if (exists) {
    await qdrant.deleteCollection(COLLECTION_NAME);
  }
  await initCollection();
}
