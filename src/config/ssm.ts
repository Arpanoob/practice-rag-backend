import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

export async function fetchSecretFromSSM(
  paramName: string = "OPENAI_API_KEY",
  region: string = "ap-southeast-2"
): Promise<string | undefined> {
  try {
    const ssm = new SSMClient({ region });
    const command = new GetParameterCommand({
      Name: paramName,
      WithDecryption: true,
    });
    const res = await ssm.send(command);
    return res.Parameter?.Value;
  } catch {
    return undefined;
  }
}

