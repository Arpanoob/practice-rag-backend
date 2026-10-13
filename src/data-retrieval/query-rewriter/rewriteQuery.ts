import { callLLM } from "../llm-call/llm.call";
import { ChatHistoryItem } from "../../types/interface/ask.interface";

export async function rewriteSearchQuery(
  rawQuery: string,
  history: ChatHistoryItem[] = []
): Promise<string> {
  const recentHistory = history
    .slice(-4)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const prompt = `Rewrite the user's latest question into a standalone search query for retrieving YouTube video transcript segments. Resolve any pronouns (like "it", "that", "this") using the conversation history. Return ONLY the rewritten query text, nothing else.

${recentHistory ? `Conversation History:\n${recentHistory}\n` : ""}
User Question: ${rawQuery}
Search Query:`;

  try {
    const rewritten = await callLLM(prompt, 40);
    return rewritten.trim() || rawQuery;
  } catch {
    return rawQuery;
  }
}