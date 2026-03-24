import re
from src.agents.agent_types import AgentType, AgentContext, AgentResult, Artifact
from src.agents.agent_llm import call_llm, LlmMessage


class CodeReviewerAgent:
    type = AgentType.CODE_REVIEWER
    display_name = "Code Reviewer"
    description = "Reviews generated code and tests, produces a structured markdown report."

    async def run(self, ctx: AgentContext) -> AgentResult:
        from src.lib.firestore import db
        from src.lib.cache import project_cache
        cached = project_cache.get(ctx.projectId)
        if cached:
            language = cached.get("language", "python").lower()
        else:
            project_doc = db.collection("projects").document(ctx.projectId).get()
            language = "python"
            if project_doc.exists:
                data = project_doc.to_dict()
                language = data.get("language", "python").lower()
                project_cache.set(ctx.projectId, data)
        
        def _get_artifact(agent_type: AgentType, art_type: str):
            prev = ctx.previousOutputs.get(agent_type)
            if not prev:
                return None
            return next((a for a in prev.artifacts if a.type == art_type), None)

        code_artifact = _get_artifact(AgentType.CODE_GENERATOR, "code")
        test_artifact = _get_artifact(AgentType.TEST_GENERATOR, "test")

        code_section = f"\n\n## Implementation\n```{language}\n{code_artifact.content}\n```" if code_artifact else ""
        test_section = f"\n\n## Tests\n```{language}\n{test_artifact.content}\n```" if test_artifact else ""

        result = await call_llm(
            messages=[
                LlmMessage(role="system", content=(
                    f"You are a senior {language.title()} engineer conducting a thorough code review.\n"
                    "Analyse the provided code and tests, then produce a structured markdown review report.\n\n"
                    "Your report MUST contain exactly these sections:\n"
                    "# Code Review: <task title>\n\n"
                    "## Summary\n## Strengths\n## Issues\n## Security\n## Performance\n## Test Coverage\n## Recommendations\n"
                    "## Score\nOverall score: X/10 with one-line justification."
                )),
                LlmMessage(role="user", content=f"Task: {ctx.taskTitle}\n\nDescription: {ctx.taskDescription}{code_section}{test_section}"),
            ],
            max_tokens=2048,
        )

        base = re.sub(r"[^a-z0-9]+", "_", ctx.taskTitle.lower()).strip("_")[:50]
        filename = f"reviews/{base}_review.md"
        score_match = re.search(r"Score[:\s]+(\d+)/10", result.content, re.IGNORECASE)
        score = f"{score_match.group(1)}/10" if score_match else "N/A"

        return AgentResult(
            agentType=self.type,
            summary=f'Code review completed for "{ctx.taskTitle}" — Score: {score}',
            artifacts=[Artifact(type="review", filename=filename, content=result.content, language="markdown")],
            rawLlmOutput=result.content,
            tokensUsed=result.tokensUsed,
        )
