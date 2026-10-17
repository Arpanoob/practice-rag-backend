import express from "express";
import { streamIngestion } from "../controller/video.search.controller";
import { ingestRateLimiter } from "../middleware/rateLimit";

const router = express.Router();

router.get("/ingest-stream", ingestRateLimiter, streamIngestion);
router.post("/ingest-stream", ingestRateLimiter, streamIngestion);

export default router;

