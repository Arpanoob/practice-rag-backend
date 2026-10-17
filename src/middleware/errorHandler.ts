import { Request, Response, NextFunction } from "express";
import { config } from "../config";
import { logger } from "../utils/logger";

/**
 * Normalizes an unknown thrown value into a safe, client-facing message.
 * Full details are logged server-side; clients get a generic message in
 * production to avoid leaking internals.
 */
export function clientErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const msg = error.message;
    if (
      msg.includes("Transcript is disabled") ||
      msg.includes("No transcripts are available") ||
      msg.includes("No transcript items found") ||
      msg.includes("Captions or transcripts are disabled")
    ) {
      return "Transcripts or captions are disabled or restricted by YouTube for this video.";
    }
    if (msg.includes("too many requests") || msg.includes("receiving too many requests")) {
      return "YouTube is temporarily rate-limiting requests from this server. Please try again shortly.";
    }
    if (
      msg.includes("Transcript exceeds") ||
      msg.includes("Invalid YouTube URL") ||
      msg.includes("video is no longer available")
    ) {
      return msg;
    }
  }

  if (config.isProduction) return fallback;
  if (error instanceof Error) return error.message;
  return fallback;
}

/** Catch-all 404 for unmatched routes. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
  });
}

/** Terminal Express error-handling middleware (must have 4 args). */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  logger.error("Unhandled request error", {
    method: req.method,
    path: req.path,
    error: err instanceof Error ? err.stack || err.message : String(err),
  });

  if (res.headersSent) return;

  res.status(500).json({
    success: false,
    error: clientErrorMessage(err, "Internal server error."),
  });
}
