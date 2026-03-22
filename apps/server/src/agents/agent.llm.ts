import { genAI } from "../lib/gemini";

export interface LlmCallOptions {
  messages: { role: "user" | "model" | "system"; content: string }[];
  model?: string;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface LlmCallResult {
  content: string;
  tokensUsed: number;
}

/**
 * Thin wrapper around the Gemini SDK.
 * Handles system instructions, chat history, and JSON mode in one place
 * so individual agents don't have to think about it.
 */
export async function callLlm(opts: LlmCallOptions): Promise<LlmCallResult> {
  const modelName = opts.model ?? "gemini-2.0-flash";

  const systemMsg = opts.messages.find((m) => m.role === "system");
  const chatMessages = opts.messages.filter((m) => m.role !== "system");

  const jsonInstruction = opts.jsonMode ? "\nRespond with valid JSON only, no markdown fences." : "";
  const systemInstruction = (systemMsg?.content ?? "") + jsonInstruction;

  const geminiModel = genAI.getGenerativeModel({
    model: modelName,
    ...(systemInstruction ? { systemInstruction } : {}),
  });

  // everything except the last message goes into history
  const history = chatMessages.slice(0, -1).map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));

  const lastMessage = chatMessages[chatMessages.length - 1]!;

  const chat = geminiModel.startChat({
    history,
    generationConfig: { maxOutputTokens: opts.maxTokens ?? 4096, temperature: 0 },
  });

  const result = await chat.sendMessage(lastMessage.content);
  const content = result.response.text();
  const tokensUsed = result.response.usageMetadata?.totalTokenCount ?? 0;

  return { content, tokensUsed };
}
