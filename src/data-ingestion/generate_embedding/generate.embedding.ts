import openai from "../../llm/openai";
import { config } from "../../config";

export async function extractYouTubeVideoEmbeddings(
  chunks: string[]
): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: config.llm.embedModel,
    input: chunks,
  });
  return response.data.map((item) => item.embedding);
}
