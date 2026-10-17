import type { Server } from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config, validateConfig } from "./config";
import { logger } from "./utils/logger";
import { rateLimit } from "./middleware/rateLimit";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";
import videoSearchRouter from "./route/video.search.route";
import askRouter from "./route/ask.route";
import { initCollection, qdrant } from "./knowledgeBase/db.vector";
import { fetchSecretFromSSM } from "./config/ssm";

validateConfig();

const app = express();

// Behind a reverse proxy/load balancer, trust X-Forwarded-* so req.ip is correct
// (needed for accurate rate limiting).
app.set("trust proxy", 1);

app.use(helmet());

app.use(
  cors({
    origin: config.corsOrigins,
  })
);

app.use(express.json({ limit: config.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: config.bodyLimit }));

// Liveness/readiness probe — checks the backend and its vector DB dependency.
app.get("/health", async (_req, res) => {
  try {
    await qdrant.getCollections();
    res.json({ status: "ok", qdrant: "up" });
  } catch {
    res.status(503).json({ status: "degraded", qdrant: "down" });
  }
});

app.get("/", (_req, res) => {
  res.send("Hello from the YouTube RAG backend!");
});

// Rate-limit the expensive API surface (keep /health and / unthrottled).
app.use("/api", rateLimit);
app.use("/api/search", videoSearchRouter);
app.use("/api/ask", askRouter);

app.use(notFoundHandler);
app.use(errorHandler);

let server: Server | null = null;

async function start() {
  if (!process.env.OPENAI_API_KEY && config.llmProvider === "openai") {
    try {
      logger.info("OPENAI_API_KEY not found in environment, checking AWS SSM Parameter Store...");
      const ssmKey = await fetchSecretFromSSM(
        "OPENAI_API_KEY",
        process.env.AWS_REGION || "ap-southeast-2"
      );
      if (ssmKey) {
        process.env.OPENAI_API_KEY = ssmKey;
        logger.info("Successfully loaded OPENAI_API_KEY from AWS SSM Parameter Store.");
      } else {
        logger.warn("OPENAI_API_KEY was not found in AWS SSM Parameter Store.");
      }
    } catch (err) {
      logger.warn("Could not retrieve OPENAI_API_KEY from AWS SSM", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  server = app.listen(config.port, () => {
    logger.info(`Server is running on http://localhost:${config.port}`, {
      env: config.nodeEnv,
    });
  });

  // Initialize the vector collection after binding the port, but surface failures.
  initCollection()
    .then(() => logger.info("Qdrant collection is ready."))
    .catch((err) =>
      logger.error("Failed to initialize Qdrant collection on startup", {
        error: err instanceof Error ? err.message : String(err),
      })
    );
}

start().catch((err) => {
  logger.error("Fatal startup error", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});

// Graceful shutdown so in-flight requests/SSE streams can drain.
function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  if (server) {
    server.close(() => {
      logger.info("HTTP server closed.");
      process.exit(0);
    });
    // Force-exit if connections don't close in time.
    setTimeout(() => process.exit(1), 10_000).unref();
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", {
    error: reason instanceof Error ? reason.stack || reason.message : String(reason),
  });
});
