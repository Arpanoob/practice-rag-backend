import { Request, Response } from "express";
import { ingestVideoService } from "../service/video.search.service";
import { isValidYouTubeUrl } from "../utils/youtube";
import { logger } from "../utils/logger";
import { clientErrorMessage } from "../middleware/errorHandler";

/**
 * Controller to stream real-time video ingestion progress using Server-Sent Events (SSE).
 */
export const streamIngestion = async (
  req: Request,
  res: Response
): Promise<void> => {
  const videoUrl =
    (req.query.videoUrl as string) || (req.body?.videoUrl as string);

  if (!videoUrl || typeof videoUrl !== "string" || !isValidYouTubeUrl(videoUrl)) {
    res.status(400).json({
      success: false,
      error: 'Missing or invalid "videoUrl" parameter. A valid YouTube URL is required.',
    });
    return;
  }

  const force =
    req.query.force === "true" ||
    req.query.force === "1" ||
    req.body?.force === true;

  const transcript =
    (req.body?.transcript as string) || (req.query?.transcript as string);

  // Set SSE Headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let isClientConnected = true;

  const sendEvent = (data: object) => {
    if (!isClientConnected) return;
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Periodic heartbeat keeps the connection alive through idle-timeout proxies.
  const heartbeat = setInterval(() => {
    if (isClientConnected) res.write(`: keep-alive\n\n`);
  }, 15_000);

  const cleanup = () => {
    clearInterval(heartbeat);
  };

  req.on("close", () => {
    isClientConnected = false;
    cleanup();
  });

  try {
    const result = await ingestVideoService(
      videoUrl,
      (progress) => sendEvent(progress),
      force,
      transcript
    );

    sendEvent({ done: true, result });
  } catch (error: unknown) {
    logger.error("Error in streamIngestion controller", {
      error: error instanceof Error ? error.message : String(error),
    });
    sendEvent({
      error: clientErrorMessage(error, "Internal error during video ingestion."),
    });
  } finally {
    cleanup();
    res.end();
  }
};

