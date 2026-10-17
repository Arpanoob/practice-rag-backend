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

  // Process in safe batches of 100 chunks to prevent timeouts and token limit overflow
  const results: number[][] = [];
  const batchSize = 100;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const response = await openai.embeddings.create({
      model: config.llm.embedModel,
      input: batch,
    });
    results.push(...response.data.map((item) => item.embedding));
  }
  return results;
}
