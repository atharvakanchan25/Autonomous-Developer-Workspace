import { openai } from "../lib/openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export interface LlmCallOptions {
  messages: ChatCompletionMessageParam[];
  model?: string;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface LlmCallResult {
  content: string;
  tokensUsed: number;
}

export async function callLlm(opts: LlmCallOptions): Promise<LlmCallResult> {
  const completion = await openai.chat.completions.create({
    model: opts.model ?? "gpt-4o-mini",
    temperature: 0,
    max_tokens: opts.maxTokens ?? 4096,
    ...(opts.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    messages: opts.messages,
  });

  const content = completion.choices[0]?.message?.content ?? "";
  const tokensUsed = completion.usage?.total_tokens ?? 0;

  return { content, tokensUsed };
}
