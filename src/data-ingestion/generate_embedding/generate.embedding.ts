import { invokeBedrockEmbedding } from "../../llm/bedrockEmbedding";
import openai from "../../llm/openai";
import { config } from "../../config";

export async function extractYouTubeVideoEmbeddings(
  chunks: string[]
): Promise<number[][]> {
  if (config.llmProvider === "bedrock") {
    // Process in batches of 5 to avoid throttling
    const results: number[][] = [];
    const batchSize = 5;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const slice = chunks.slice(i, i + batchSize);
      const batchVectors = await Promise.all(
        slice.map((chunk) => invokeBedrockEmbedding(chunk))
      );
      results.push(...batchVectors);
    }
    return results;
  }

  const response = await openai.embeddings.create({
    model: config.llm.embedModel,
    input: chunks,
  });
  return response.data.map((item) => item.embedding);
}
