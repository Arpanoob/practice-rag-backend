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
    collectionName: str("QDRANT_COLLECTION", "youtube_transcripts_openai"),
    vectorSize: int("EMBED_DIM", 1536),
  },

  // LLM Provider: "openai", "bedrock", or "ollama"
  llmProvider: str("LLM_PROVIDER", "openai"),

  // AWS Bedrock configuration
  bedrock: {
    region: str("AWS_REGION", "us-east-1"),
    chatModel: str("BEDROCK_CHAT_MODEL", "meta.llama3-2-3b-instruct-v1:0"),
    embedModel: str("BEDROCK_EMBED_MODEL", "amazon.titan-embed-text-v2:0"),
    embedDimension: int("BEDROCK_EMBED_DIM", 1024),
    accessKeyId: optionalStr("AWS_ACCESS_KEY_ID"),
    secretAccessKey: optionalStr("AWS_SECRET_ACCESS_KEY"),
    sessionToken: optionalStr("AWS_SESSION_TOKEN"),
  },

  // OpenAI / Ollama LLM endpoint
  llm: {
    baseURL: str("OPENAI_BASE_URL", str("OLLAMA_BASE_URL", "https://api.openai.com/v1")),
    apiKey: str("OPENAI_API_KEY", str("OLLAMA_API_KEY", "")),
    embedModel: str("EMBED_MODEL", "text-embedding-3-small"),
    chatModel: str("LLM_MODEL", "gpt-4o-mini"),
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
