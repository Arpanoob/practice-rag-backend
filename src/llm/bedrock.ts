import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { config } from "../config";

const clientConfig: ConstructorParameters<typeof BedrockRuntimeClient>[0] = {
  region: config.bedrock.region,
};

if (config.bedrock.accessKeyId && config.bedrock.secretAccessKey) {
  clientConfig.credentials = {
    accessKeyId: config.bedrock.accessKeyId,
    secretAccessKey: config.bedrock.secretAccessKey,
    ...(config.bedrock.sessionToken
      ? { sessionToken: config.bedrock.sessionToken }
      : {}),
  };
}

export const bedrockClient = new BedrockRuntimeClient(clientConfig);

