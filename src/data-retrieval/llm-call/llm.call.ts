import openai from "../../llm/openai";
import { config } from "../../config";

export async function callLLM(
  prompt: string,
  max_tokens?: number
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: config.llm.chatModel,
    messages: [{ role: "user", content: prompt }],
    ...(max_tokens ? { max_tokens } : {}),
  });

  const answer = response.choices?.[0]?.message?.content;
  if (!answer) {
    throw new Error("LLM returned an empty response.");
  }

  return answer;
}
