import re
from src.agents.agent_types import AgentType, AgentContext, AgentResult, Artifact
from src.agents.agent_llm import call_llm, LlmMessage


class CodeGeneratorAgent:
    type = AgentType.CODE_GENERATOR
    display_name = "Code Generator"
    description = "Generates Python implementation code for a given task."

    async def run(self, ctx: AgentContext) -> AgentResult:
        result = await call_llm([
            LlmMessage(role="system", content=(
                "You are an expert Python engineer.\n"
                "Given a task title and description, produce clean, production-ready Python implementation code.\n\n"
                "Rules:\n"
                "- Output ONLY the code — no prose, no markdown fences, no explanation.\n"
                "- Use modern Python (type hints, async/await where appropriate).\n"
                "- Include all necessary imports at the top.\n"
                "- Add concise docstrings on public functions only.\n"
                "- Keep the implementation focused on exactly what the task describes."
            )),
            LlmMessage(role="user", content=f"Task: {ctx.taskTitle}\n\nDescription: {ctx.taskDescription}\n\nProject context: {ctx.projectId}"),
        ])

        filename = re.sub(r"[^a-z0-9]+", "_", ctx.taskTitle.lower()).strip("_")[:50] + ".py"

        return AgentResult(
            agentType=self.type,
            summary=f'Generated Python implementation for "{ctx.taskTitle}"',
            artifacts=[Artifact(type="code", filename=filename, content=result.content, language="python")],
            rawLlmOutput=result.content,
            tokensUsed=result.tokensUsed,
        )
