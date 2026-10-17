import { Request, Response, NextFunction } from "express";
import { config } from "../config";

/**
 * Minimal zero-dependency fixed-window rate limiter, keyed by client IP.
 *
 * Protects expensive downstream operations (YouTube scraping, OpenAI embeddings,
 * vector writes, and LLM inference) from abuse.
 */

interface WindowState {
  count: number;
  resetAt: number;
}

const CLEANUP_INTERVAL_MS = 5 * 60_000;

function clientKey(req: Request): string {
  // Express sets req.ip (honoring trust proxy when configured).
  return req.ip || req.socket.remoteAddress || "unknown";
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
}

export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    message = "Too many requests. Please slow down and try again shortly.",
  } = options;
  const buckets = new Map<string, WindowState>();

  // Periodically drop expired buckets so the map doesn't grow unbounded.
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, state] of buckets) {
      if (state.resetAt <= now) buckets.delete(key);
    }
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref?.();

  return function rateLimiterMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const key = clientKey(req);
    const now = Date.now();

    let state = buckets.get(key);
    if (!state || state.resetAt <= now) {
      state = { count: 0, resetAt: now + windowMs };
      buckets.set(key, state);
    }

    state.count += 1;

    const remaining = Math.max(0, max - state.count);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(state.resetAt / 1000)));

    if (state.count > max) {
      const retryAfterSec = Math.ceil((state.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        success: false,
        error: message,
      });
      return;
    }

    next();
  };
}

// Ingestion rate limiter: 10 requests per minute per IP (protects YouTube scraping & embeddings)
export const ingestRateLimiter = createRateLimiter({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.ingestMax,
  message:
    "Too many video ingestion requests. Please wait a minute before ingesting another video.",
});

// AI Chat & Summary limiter: 20 requests per minute per IP (protects OpenAI LLM quota)
export const askRateLimiter = createRateLimiter({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.askMax,
  message:
    "Too many questions asked in a short time. Please wait a moment before sending more messages.",
});

// General fallback limiter for all /api endpoints (60/min)
export const rateLimit = createRateLimiter({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
});
