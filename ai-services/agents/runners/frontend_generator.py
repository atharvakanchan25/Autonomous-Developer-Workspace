import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent.parent.parent.parent / "backend"))

from agents.agent_types import AgentType, AgentContext, AgentResult, Artifact
from agents.agent_llm import call_llm, LlmMessage


class FrontendGeneratorAgent:
    type = AgentType.FRONTEND_GENERATOR
    display_name = "Frontend Generator"
    description = "Generates a single-file HTML/CSS/JS frontend for the project using localStorage."

    async def run(self, ctx: AgentContext) -> AgentResult:
        result = await call_llm([
            LlmMessage(role="system", content=(
                "You are an expert frontend developer.\n"
                "Generate a SINGLE self-contained index.html file with all CSS and JS inline.\n\n"
                "Rules:\n"
                "- Dark theme UI with CSS variables\n"
                "- Use localStorage for all data (NO fetch() or API calls)\n"
                "- Semantic class names: .card, .btn-primary, .table, .form-group, etc.\n"
                "- Clean, modern layout appropriate for the project type\n"
                "- Fully functional CRUD if applicable\n"
                "- Output ONLY the raw HTML. No markdown fences, no explanation."
            )),
            LlmMessage(role="user", content=(
                f"Project: {ctx.projectName}\n"
                f"Description: {ctx.projectDescription}\n\n"
                "Generate a complete, working index.html frontend for this project."
            )),
        ], max_tokens=8192, json_mode=False)

        html = result.content.strip()
        # Strip accidental markdown fences
        if html.startswith("```"):
            lines = html.splitlines()
            html = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        return AgentResult(
            agentType=self.type,
            summary=f'Generated HTML/CSS/JS frontend for "{ctx.projectName}"',
            artifacts=[Artifact(type="code", filename="frontend/index.html", content=html, language="html")],
            rawLlmOutput=result.content,
            tokensUsed=result.tokensUsed,
        )
