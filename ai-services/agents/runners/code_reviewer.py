import re
import json
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent.parent / "backend"))

from agents.agent_types import AgentType, AgentContext, AgentResult, Artifact
from agents.agent_llm import call_llm, LlmMessage


class CodeReviewerAgent:
    type = AgentType.CODE_REVIEWER
    display_name = "Code Reviewer"
    description = "Reviews generated code and tests; produces structured review with numeric score."

    async def run(self, ctx: AgentContext) -> AgentResult:
        language = ctx.language

        def _get_artifact(agent_type: AgentType, art_type: str):
            prev = ctx.previousOutputs.get(agent_type)
            if not prev:
                return None
            return next((a for a in prev.artifacts if a.type == art_type), None)

        code_artifact = _get_artifact(AgentType.CODE_GENERATOR, "code")
        test_artifact = _get_artifact(AgentType.TEST_GENERATOR, "test")

        code_section = f"\n\nImplementation:\n```{language}\n{code_artifact.content}\n```" if code_artifact else ""
        test_section = f"\n\nTests:\n```{language}\n{test_artifact.content}\n```" if test_artifact else ""
        mcp_context = f"\n\nWorkspace context from MCP:\n{ctx.mcpContext}" if ctx.mcpContext else ""

        result = await call_llm(
            messages=[
                LlmMessage(role="system", content=(
                    f"You are a senior {language.title()} engineer doing a thorough code review.\n"
                    "Respond with a JSON object with exactly these keys:\n"
                    '  "score": integer 1-10\n'
                    '  "grade": one of "A", "B", "C", "D", "F"\n'
                    '  "summary": one sentence overall verdict\n'
                    '  "strengths": array of strings (max 5)\n'
                    '  "issues": array of strings (max 5, empty array if none)\n'
                    '  "recommendations": array of strings (max 5)\n'
                    '  "markdown": full markdown review text\n\n'
                    "Scoring rubric:\n"
                    "  10 — production-ready, exemplary\n"
                    "   8-9 — solid, minor improvements only\n"
                    "   6-7 — functional but has notable issues\n"
                    "   4-5 — works but significant problems\n"
                    "   1-3 — broken or fundamentally flawed\n\n"
                    "The 'markdown' field must follow this exact structure:\n"
                    "## Review: <task title>\n"
                    "**Score: X/10 (Grade: Y)** — <summary>\n\n"
                    "### Strengths\n- bullet points\n\n"
                    "### Issues\n- bullet points (or '- None' if clean)\n\n"
                    "### Recommendations\n- bullet points\n\n"
                    "Keep markdown under 300 words.\n\n"
                    "CRITICAL: Do NOT use triple-quoted strings. Use single-line # comments only. The entire response must be valid JSON."
                )),
                LlmMessage(role="user", content=(
                    f"Task: {ctx.taskTitle}\n"
                    f"Description: {ctx.taskDescription}"
                    f"{code_section}{test_section}{mcp_context}"
                )),
            ],
            max_tokens=1024,
            json_mode=True,
        )

        result.content = result.content.replace('"""', '#')

        try:
            parsed = json.loads(result.content)
            score = int(parsed.get("score", 0))
            grade = str(parsed.get("grade", "N/A"))
            summary = str(parsed.get("summary", ""))
            strengths = parsed.get("strengths", [])
            issues = parsed.get("issues", [])
            recommendations = parsed.get("recommendations", [])
            markdown = str(parsed.get("markdown", result.content))
        except (json.JSONDecodeError, ValueError):
            score_match = re.search(r"Score:\s*(\d+)/10", result.content, re.IGNORECASE)
            score = int(score_match.group(1)) if score_match else 0
            grade = "N/A"
            summary = ""
            strengths = []
            issues = []
            recommendations = []
            markdown = result.content

        score_label = f"{score}/10"

        # Store structured data as JSON in the artifact content so scaffold can parse it
        structured = json.dumps({
            "taskTitle": ctx.taskTitle,
            "score": score,
            "grade": grade,
            "summary": summary,
            "strengths": strengths,
            "issues": issues,
            "recommendations": recommendations,
            "markdown": markdown,
        })

        return AgentResult(
            agentType=self.type,
            summary=f'Code review for "{ctx.taskTitle}" — Score: {score_label} (Grade: {grade})',
            artifacts=[Artifact(
                type="review",
                filename="",        # in-memory only; scaffold embeds it in README
                content=structured,
                language="json",
            )],
            rawLlmOutput=result.content,
            tokensUsed=result.tokensUsed,
        )
