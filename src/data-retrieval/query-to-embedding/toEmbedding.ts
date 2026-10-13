import { invokeBedrockEmbedding } from "../../llm/bedrockEmbedding";
import openai from "../../llm/openai";
import { config } from "../../config";

export async function generateEmbedding(query: string): Promise<number[][]> {
  if (config.llmProvider === "bedrock") {
    const vector = await invokeBedrockEmbedding(query);
    return [vector];
  }

  const response = await openai.embeddings.create({
    model: config.llm.embedModel,
    input: query,
  });

  return response.data.map((item) => item.embedding);
}
