import re
from src.agents.agent_types import AgentType, AgentContext, AgentResult, Artifact
from src.agents.agent_llm import call_llm, LlmMessage


class TestGeneratorAgent:
    type = AgentType.TEST_GENERATOR
    display_name = "Test Generator"
    description = "Generates a pytest test suite for a task, using generated code if available."

    async def run(self, ctx: AgentContext) -> AgentResult:
        prev = ctx.previousOutputs.get(AgentType.CODE_GENERATOR)
        code_artifact = next((a for a in prev.artifacts if a.type == "code"), None) if prev else None

        code_context = (
            f"\n\nHere is the implementation to test:\n```python\n{code_artifact.content}\n```"
            if code_artifact else ""
        )

        result = await call_llm([
            LlmMessage(role="system", content=(
                "You are an expert in Python testing with pytest.\n"
                "Given a task and optionally its implementation, produce a comprehensive test suite.\n\n"
                "Rules:\n"
                "- Output ONLY the test code — no prose, no markdown fences.\n"
                "- Use pytest with fixtures, parametrize, and monkeypatch where appropriate.\n"
                "- Cover: happy path, edge cases, and error cases.\n"
                "- Mock external dependencies (databases, HTTP calls) with unittest.mock or pytest-mock.\n"
                "- Each test must have a clear, descriptive name."
            )),
            LlmMessage(role="user", content=f"Task: {ctx.taskTitle}\n\nDescription: {ctx.taskDescription}{code_context}"),
        ])

        base = re.sub(r"[^a-z0-9]+", "_", ctx.taskTitle.lower()).strip("_")[:50]
        filename = f"test_{base}.py"

        return AgentResult(
            agentType=self.type,
            summary=f'Generated pytest test suite for "{ctx.taskTitle}"',
            artifacts=[Artifact(type="test", filename=filename, content=result.content, language="python")],
            rawLlmOutput=result.content,
            tokensUsed=result.tokensUsed,
        )
