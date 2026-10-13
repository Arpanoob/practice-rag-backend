import { InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { bedrockClient } from "./bedrock";
import { config } from "../config";

export async function invokeBedrockEmbedding(
  inputText: string
): Promise<number[]> {
  const payload = {
    inputText,
    dimensions: config.bedrock.embedDimension,
    normalize: true,
  };

  const command = new InvokeModelCommand({
    modelId: config.bedrock.embedModel,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(payload),
  });

  const response = await bedrockClient.send(command);
  const result = JSON.parse(new TextDecoder().decode(response.body));
  if (!result.embedding || !Array.isArray(result.embedding)) {
    throw new Error("Bedrock did not return a valid embedding vector.");
  }
  return result.embedding;
}

