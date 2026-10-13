import express from "express";
import { streamIngestion } from "../controller/video.search.controller";

const router = express.Router();

router.get("/ingest-stream", streamIngestion);

export default router;

