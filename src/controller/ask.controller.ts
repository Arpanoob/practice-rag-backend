import { Request, Response } from "express";
import {
  askQuestionService,
  getVideoSummaryService,
} from "../service/ask.service";
import { isValidYouTubeUrl } from "../utils/youtube";
import { logger } from "../utils/logger";
import { clientErrorMessage } from "../middleware/errorHandler";

/**
 * Controller to handle video question requests via the RAG retrieval pipeline.
 */
export const askQuestionController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const videoUrl =
      (req.body?.videoUrl as string) || (req.query?.videoUrl as string);
    const query = (req.body?.query as string) || (req.query?.query as string);

    if (!videoUrl || typeof videoUrl !== "string" || !isValidYouTubeUrl(videoUrl)) {
      res.status(400).json({
        success: false,
        error: 'Missing or invalid "videoUrl" parameter. A valid YouTube URL is required.',
      });
      return;
    }

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'Missing or invalid "query" parameter.',
      });
      return;
    }

    // Execute complete RAG data retrieval pipeline
    const result = await askQuestionService({ videoUrl, query });

    res.status(200).json({
      success: true,
      message: "Answer generated successfully from knowledge base.",
      data: result,
    });
  } catch (error: unknown) {
    logger.error("Error in askQuestionController", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: clientErrorMessage(error, "Failed to retrieve and generate answer."),
    });
  }
};

/**
 * Controller to generate or fetch a comprehensive AI summary of a video.
 */
export const getVideoSummaryController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const videoUrl =
      (req.query?.videoUrl as string) || (req.body?.videoUrl as string);
    const forceRefresh =
      req.query?.refresh === "true" ||
      req.query?.refresh === "1" ||
      req.body?.refresh === true;

    if (!videoUrl || typeof videoUrl !== "string" || !isValidYouTubeUrl(videoUrl)) {
      res.status(400).json({
        success: false,
        error: 'Missing or invalid "videoUrl" parameter. A valid YouTube URL is required.',
      });
      return;
    }

    const summary = await getVideoSummaryService(videoUrl, forceRefresh);

    res.status(200).json({
      success: true,
      message: "Video summary retrieved successfully.",
      data: {
        videoUrl,
        summary,
      },
    });
  } catch (error: unknown) {
    logger.error("Error in getVideoSummaryController", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: clientErrorMessage(error, "Failed to generate video summary."),
    });
  }
};
