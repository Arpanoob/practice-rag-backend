import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { bedrockClient } from "../../llm/bedrock";
import openai from "../../llm/openai";
import { config } from "../../config";
import { ChatHistoryItem } from "../../types/interface/ask.interface";

export async function callLLM(
  prompt: string,
  max_tokens?: number,
  history: ChatHistoryItem[] = []
): Promise<string> {
  if (config.llmProvider === "bedrock") {
    const messages = [
      ...history.slice(-6).map((item) => ({
        role: (item.role === "assistant" ? "assistant" : "user") as
          | "user"
          | "assistant",
        content: [{ text: item.content }],
      })),
      {
        role: "user" as const,
        content: [{ text: prompt }],
      },
    ];

    const command = new ConverseCommand({
      modelId: config.bedrock.chatModel,
      messages,
      inferenceConfig: {
        maxTokens: max_tokens || 600,
        temperature: 0.5,
      },
    });

    const response = await bedrockClient.send(command);
    const text = response.output?.message?.content?.[0]?.text;
    if (!text) {
      throw new Error("Bedrock returned an empty response.");
    }

    return text;
  }

  const response = await openai.chat.completions.create({
    model: config.llm.chatModel,
    messages: [
      ...history.slice(-6),
      { role: "user", content: prompt },
    ],
    ...(max_tokens ? { max_tokens } : {}),
  });

  const answer = response.choices?.[0]?.message?.content;
  if (!answer) {
    throw new Error("LLM returned an empty response.");
  }

  return answer;
}