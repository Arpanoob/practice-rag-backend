import { Request, Response, NextFunction } from "express";
import { config } from "../config";

/**
 * Timing-safe comparison to avoid leaking token length/content via timing.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Guards destructive/admin endpoints.
 *
 * - If ADMIN_TOKEN is not configured, the endpoint is disabled (404-style 403)
 *   so a misconfigured deployment can't expose it accidentally.
 * - Otherwise requires a matching `Authorization: Bearer <token>` or
 *   `x-admin-token` header.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!config.adminToken) {
    res.status(403).json({
      success: false,
      error: "This endpoint is disabled. Set ADMIN_TOKEN to enable it.",
    });
    return;
  }

  const header = req.header("authorization");
  const bearer = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : undefined;
  const provided = bearer || req.header("x-admin-token") || "";

  if (!provided || !safeEqual(provided, config.adminToken)) {
    res.status(401).json({
      success: false,
      error: "Unauthorized.",
    });
    return;
  }

  next();
}
