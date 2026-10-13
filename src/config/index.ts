import dotenv from "dotenv";

// Load .env as early as possible, before any other module reads config.
dotenv.config();

type NodeEnv = "development" | "production" | "test";

function str(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function optionalStr(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new TypeError(`Invalid integer for env var ${name}: "${raw}"`);
  }
  return parsed;
}

const nodeEnv = str("NODE_ENV", "development") as NodeEnv;

export const config = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: int("PORT", 5000),

  // Comma-separated list of allowed CORS origins.
  corsOrigins: str("CORS_ORIGIN", "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  // Vector database
  qdrant: {
    url: str("QDRANT_URL", "http://127.0.0.1:6333"),
    apiKey: optionalStr("QDRANT_API_KEY"),
    collectionName: str("QDRANT_COLLECTION", "youtube_transcripts"),
    vectorSize: int("EMBED_DIM", 768),
  },

  // Ollama / OpenAI-compatible LLM endpoint
  llm: {
    baseURL: str("OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1"),
    apiKey: str("OLLAMA_API_KEY", "ollama"),
    embedModel: str("EMBED_MODEL", "nomic-embed-text"),
    chatModel: str("LLM_MODEL", "llama3.2"),
  },

  // Request body size limit
  bodyLimit: str("BODY_LIMIT", "256kb"),

  // Rate limiting (fixed window, per IP)
  rateLimit: {
    windowMs: int("RATE_LIMIT_WINDOW_MS", 60_000),
    max: int("RATE_LIMIT_MAX", 60),
  },

  // Caching
  summaryCache: {
    maxEntries: int("SUMMARY_CACHE_MAX", 500),
    ttlMs: int("SUMMARY_CACHE_TTL_MS", 6 * 60 * 60 * 1000), // 6h
  },

  // Guardrails
  maxTranscriptChunks: int("MAX_TRANSCRIPT_CHUNKS", 1000),
} as const;

/**
 * Validates configuration invariants at startup so the process fails fast
 * with a clear message instead of misbehaving later.
 */
export function validateConfig(): void {
  if (config.isProduction) {
    if (
      config.corsOrigins.length === 0 ||
      config.corsOrigins.includes("*")
    ) {
      throw new Error(
        "CORS_ORIGIN must be an explicit origin list in production (wildcard is not allowed)."
      );
    }
  }
}
