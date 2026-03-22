import { AgentType, IAgent, AgentContext, AgentResult } from "../agent.types";
import { callLlm } from "../agent.llm";

export class TestGeneratorAgent implements IAgent {
  readonly type = AgentType.TEST_GENERATOR;
  readonly displayName = "Test Generator";
  readonly description = "Generates a Vitest test suite for a task, using generated code if available.";

  async run(ctx: AgentContext): Promise<AgentResult> {
    // if CODE_GENERATOR ran before us in the pipeline, use its output as context
    const codeArtifact = ctx.previousOutputs?.CODE_GENERATOR?.artifacts.find(
      (a) => a.type === "code",
    );

    const codeContext = codeArtifact
      ? `\n\nHere is the implementation to test:\n\`\`\`typescript\n${codeArtifact.content}\n\`\`\``
      : "";

    const { content, tokensUsed } = await callLlm({
      messages: [
        {
          role: "system",
          content: `You are an expert in TypeScript testing with Vitest.
Given a task and optionally its implementation, produce a comprehensive test suite.

Rules:
- Output ONLY the test code — no prose, no markdown fences.
- Use Vitest (import from "vitest": describe, it, expect, vi, beforeEach, afterEach).
- Cover: happy path, edge cases, and error cases.
- Mock external dependencies (databases, HTTP calls) with vi.mock().
- Each test must have a clear, descriptive name.
- Group related tests in describe blocks.`,
        },
        {
          role: "user",
          content: `Task: ${ctx.taskTitle}\n\nDescription: ${ctx.taskDescription}${codeContext}`,
        },
      ],
    });

    const filename =
      ctx.taskTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 50) + ".test.ts";

    return {
      agentType: this.type,
      summary: `Generated Vitest test suite for "${ctx.taskTitle}"`,
      artifacts: [{ type: "test", filename, content, language: "typescript" }],
      rawLlmOutput: content,
      tokensUsed,
    };
  }
}
