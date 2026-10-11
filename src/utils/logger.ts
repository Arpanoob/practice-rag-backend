import { config } from "../config";

/**
 * Minimal zero-dependency structured logger.
 *
 * Emits single-line JSON in production (machine-parseable for log aggregators)
 * and human-readable lines in development. Keeps a consistent interface so it
 * can later be swapped for pino/winston without touching call sites.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const minLevel: Level = config.isProduction ? "info" : "debug";

function shouldLog(level: Level): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

function emit(level: Level, message: string, meta?: Record<string, unknown>) {
  if (!shouldLog(level)) return;

  if (config.isProduction) {
    const entry = {
      level,
      time: new Date().toISOString(),
      msg: message,
      ...(meta ?? {}),
    };
    const line = JSON.stringify(entry);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
    return;
  }

  const prefix = `[${level.toUpperCase()}]`;
  const args: unknown[] = [prefix, message];
  if (meta && Object.keys(meta).length > 0) args.push(meta);
  if (level === "error") console.error(...args);
  else if (level === "warn") console.warn(...args);
  else console.log(...args);
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) =>
    emit("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) =>
    emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) =>
    emit("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) =>
    emit("error", message, meta),
};
