import OpenAI from "openai";
import { config } from "../config";

const openai = new OpenAI({
  baseURL: config.llm.baseURL,
  apiKey: config.llm.apiKey,
});

export default openai;
