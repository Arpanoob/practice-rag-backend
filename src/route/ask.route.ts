import express from "express";
import {
  askQuestionController,
  getVideoSummaryController,
} from "../controller/ask.controller";

const router = express.Router();

router.post("/", askQuestionController);
router.get("/summary", getVideoSummaryController);

export default router;
