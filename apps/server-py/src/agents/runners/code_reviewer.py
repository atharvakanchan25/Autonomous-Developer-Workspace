import re
from src.agents.agent_types import AgentType, AgentContext, AgentResult, Artifact
from src.agents.agent_llm import call_llm, LlmMessage


class CodeReviewerAgent:
    type = AgentType.CODE_REVIEWER
    display_name = "Code Reviewer"
    description = "Reviews generated code and tests; review is embedded in README by scaffold agent."

    async def run(self, ctx: AgentContext) -> AgentResult:
        language = ctx.language

        def _get_artifact(agent_type: AgentType, art_type: str):
            prev = ctx.previousOutputs.get(agent_type)
            if not prev:
                return None
            return next((a for a in prev.artifacts if a.type == art_type), None)

        code_artifact = _get_artifact(AgentType.CODE_GENERATOR, "code")
        test_artifact = _get_artifact(AgentType.TEST_GENERATOR, "test")

        code_section = f"\n\n```{language}\n{code_artifact.content}\n```" if code_artifact else ""
        test_section = f"\n\nTests:\n```{language}\n{test_artifact.content}\n```" if test_artifact else ""

        result = await call_llm(
            messages=[
                LlmMessage(role="system", content=(
                    f"You are a senior {language.title()} engineer doing a concise code review.\n"
                    "Output a SHORT markdown review with these sections only:\n"
                    "## Review: <task title>\n"
                    "**Score: X/10** — one-line justification\n\n"
                    "**Strengths:** bullet points\n"
                    "**Issues:** bullet points (or 'None' if clean)\n"
                    "**Recommendations:** bullet points\n\n"
                    "Keep it under 200 words total."
                )),
                LlmMessage(role="user", content=(
                    f"Task: {ctx.taskTitle}\n"
                    f"Description: {ctx.taskDescription}"
                    f"{code_section}{test_section}"
                )),
            ],
            max_tokens=512,
        )

        score_match = re.search(r"Score:\s*(\d+)/10", result.content, re.IGNORECASE)
        score = f"{score_match.group(1)}/10" if score_match else "N/A"

        return AgentResult(
            agentType=self.type,
            summary=f'Code review for "{ctx.taskTitle}" — Score: {score}',
            artifacts=[Artifact(
                type="review",
                filename="",        # empty = in-memory only; scaffold embeds it in README
                content=result.content,
                language="markdown",
            )],
            rawLlmOutput=result.content,
            tokensUsed=result.tokensUsed,
        )
