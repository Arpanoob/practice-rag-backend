import { QdrantClient } from "@qdrant/js-client-rest";
import { config } from "../config";

let qdrantInstance: QdrantClient | null = null;

export function getQdrantClient(): QdrantClient {
  if (!qdrantInstance) {
    const url =
      process.env.DRANT_CLUSTER_ENDPOINT ||
      process.env.QDRANT_URL ||
      config.qdrant.url;
    const apiKey =
      process.env.DRANT_API_KEY ||
      process.env.QDRANT_API_KEY ||
      config.qdrant.apiKey;

    qdrantInstance = new QdrantClient({
      url,
      apiKey,
      checkCompatibility: false,
    });
  }
  return qdrantInstance;
}

export const qdrant = new Proxy({} as QdrantClient, {
  get(_target, prop) {
    const client = getQdrantClient();
    const val = (client as any)[prop];
    return typeof val === "function" ? val.bind(client) : val;
  },
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

