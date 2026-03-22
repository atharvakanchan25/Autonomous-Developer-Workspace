import { AgentType } from "@prisma/client";
import { IAgent, AgentContext, AgentResult } from "../agent.types";
import { callLlm } from "../agent.llm";

export class CodeGeneratorAgent implements IAgent {
  readonly type = AgentType.CODE_GENERATOR;
  readonly displayName = "Code Generator";
  readonly description = "Generates TypeScript implementation code for a given task.";

  async run(ctx: AgentContext): Promise<AgentResult> {
    const { content, tokensUsed } = await callLlm({
      messages: [
        {
          role: "system",
          content: `You are an expert TypeScript/Node.js engineer.
Given a task title and description, produce clean, production-ready TypeScript implementation code.

Rules:
- Output ONLY the code — no prose, no markdown fences, no explanation.
- Use modern TypeScript (strict mode, async/await, proper types).
- Include all necessary imports at the top.
- Add concise JSDoc comments on exported functions only.
- Keep the implementation focused on exactly what the task describes.`,
        },
        {
          role: "user",
          content: `Task: ${ctx.taskTitle}\n\nDescription: ${ctx.taskDescription}\n\nProject context: ${ctx.projectId}`,
        },
      ],
    });

    // Derive a sensible filename from the task title
    const filename = ctx.taskTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) + ".ts";

    return {
      agentType: this.type,
      summary: `Generated TypeScript implementation for "${ctx.taskTitle}"`,
      artifacts: [
        {
          type: "code",
          filename,
          content,
          language: "typescript",
        },
      ],
      rawLlmOutput: content,
      tokensUsed,
    };
  }
}
