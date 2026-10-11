import express from "express";
import {
  streamIngestion,
  flushDatabase,
} from "../controller/video.search.controller";
import { requireAdmin } from "../middleware/auth";

const router = express.Router();

router.get("/ingest-stream", streamIngestion);

// Destructive: wipes the entire vector collection. Guarded by admin auth and
// disabled entirely unless ADMIN_TOKEN is configured.
router.delete("/flush", requireAdmin, flushDatabase);

export default router;
