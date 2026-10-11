import { Request, Response, NextFunction } from "express";
import { config } from "../config";

/**
 * Minimal zero-dependency fixed-window rate limiter, keyed by client IP.
 *
 * Protects the expensive downstream work (YouTube fetches, embeddings, LLM
 * inference, vector writes) from being hammered by a single client. For
 * multi-instance deployments this should be backed by Redis instead.
 */

interface WindowState {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, WindowState>();

// Periodically drop expired buckets so the map doesn't grow unbounded.
const CLEANUP_INTERVAL_MS = 5 * 60_000;
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, state] of buckets) {
    if (state.resetAt <= now) buckets.delete(key);
  }
}, CLEANUP_INTERVAL_MS);
// Don't keep the event loop alive solely for cleanup.
cleanupTimer.unref?.();

function clientKey(req: Request): string {
  // Express sets req.ip (honoring trust proxy when configured).
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const { windowMs, max } = config.rateLimit;
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
      error: "Too many requests. Please slow down and try again shortly.",
    });
    return;
  }

  next();
}
