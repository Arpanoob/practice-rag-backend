import OpenAI from "openai";
import { config } from "../config";

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    const key = process.env.OPENAI_API_KEY || config.llm.apiKey;
    client = new OpenAI({
      baseURL: config.llm.baseURL,
      apiKey: key,
    });
  }
  return client;
}

const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    const c = getOpenAIClient();
    const val = (c as any)[prop];
    return typeof val === "function" ? val.bind(c) : val;
  },
  set(_target, prop, value) {
    const c = getOpenAIClient();
    (c as any)[prop] = value;
    return true;
  },
});

export default openai;

