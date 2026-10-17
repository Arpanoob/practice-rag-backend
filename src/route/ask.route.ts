import express from "express";
import {
  askQuestionController,
  getVideoSummaryController,
} from "../controller/ask.controller";
import { askRateLimiter } from "../middleware/rateLimit";

const router = express.Router();

router.post("/", askRateLimiter, askQuestionController);
router.get("/summary", askRateLimiter, getVideoSummaryController);

export default router;
