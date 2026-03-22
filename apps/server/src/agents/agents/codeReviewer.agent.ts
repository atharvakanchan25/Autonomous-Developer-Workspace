import { AgentType } from "@prisma/client";
import { IAgent, AgentContext, AgentResult } from "../agent.types";
import { callLlm } from "../agent.llm";

export class CodeReviewerAgent implements IAgent {
  readonly type = AgentType.CODE_REVIEWER;
  readonly displayName = "Code Reviewer";
  readonly description = "Reviews generated code and tests, produces a structured markdown report.";

  async run(ctx: AgentContext): Promise<AgentResult> {
    const codeArtifact = ctx.previousOutputs?.CODE_GENERATOR?.artifacts.find(
      (a) => a.type === "code",
    );
    const testArtifact = ctx.previousOutputs?.TEST_GENERATOR?.artifacts.find(
      (a) => a.type === "test",
    );

    const codeSection = codeArtifact
      ? `\n\n## Implementation\n\`\`\`typescript\n${codeArtifact.content}\n\`\`\``
      : "";

    const testSection = testArtifact
      ? `\n\n## Tests\n\`\`\`typescript\n${testArtifact.content}\n\`\`\``
      : "";

    const { content, tokensUsed } = await callLlm({
      messages: [
        {
          role: "system",
          content: `You are a senior software engineer conducting a thorough code review.
Analyse the provided code and tests, then produce a structured markdown review report.

Your report MUST contain exactly these sections:
# Code Review: <task title>

## Summary
One paragraph overall assessment.

## Strengths
Bullet list of what is done well.

## Issues
Bullet list of bugs, anti-patterns, or missing error handling. Rate each: [CRITICAL | MAJOR | MINOR].

## Security
Any security concerns (injection, secrets exposure, missing auth, etc.).

## Performance
Any performance concerns or optimisation opportunities.

## Test Coverage
Assessment of test quality and coverage gaps.

## Recommendations
Prioritised action items the developer should address.

## Score
Overall score: X/10 with one-line justification.`,
        },
        {
          role: "user",
          content: `Task: ${ctx.taskTitle}\n\nDescription: ${ctx.taskDescription}${codeSection}${testSection}`,
        },
      ],
      maxTokens: 2048,
    });

    const filename = ctx.taskTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) + "-review.md";

    // Extract score from the report for the summary line
    const scoreMatch = content.match(/Score[:\s]+(\d+)\/10/i);
    const score = scoreMatch ? `${scoreMatch[1]}/10` : "N/A";

    return {
      agentType: this.type,
      summary: `Code review completed for "${ctx.taskTitle}" — Score: ${score}`,
      artifacts: [
        {
          type: "review",
          filename,
          content,
          language: "markdown",
        },
      ],
      rawLlmOutput: content,
      tokensUsed,
    };
  }
}
