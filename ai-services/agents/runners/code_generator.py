import re
import json
import sys
from pathlib import Path

# Add backend to Python path
sys.path.append(str(Path(__file__).parent.parent.parent.parent / "backend"))

from agents.agent_types import AgentType, AgentContext, AgentResult, Artifact
from agents.agent_llm import call_llm, LlmMessage

LANGUAGE_EXTENSIONS = {
    "python": ".py", "javascript": ".js", "typescript": ".ts",
    "java": ".java", "go": ".go", "rust": ".rs", "cpp": ".cpp",
    "c": ".c", "csharp": ".cs", "ruby": ".rb", "php": ".php",
    "swift": ".swift", "kotlin": ".kt",
}

LANGUAGE_DIRS = {
    "python": "src", "javascript": "src", "typescript": "src",
    "java": "src/main/java", "go": "pkg", "rust": "src",
    "cpp": "src", "c": "src", "csharp": "src",
    "ruby": "lib", "php": "src", "swift": "Sources",
    "kotlin": "src/main/kotlin",
}


def _to_filename(base: str, language: str) -> str:
    words = re.sub(r"[^a-z0-9]+", "_", base.lower()).strip("_").split("_")
    words = [w for w in words if w]
    if language in ("java", "kotlin", "csharp"):
        return "".join(w.capitalize() for w in words)
    return "_".join(words)


class CodeGeneratorAgent:
    type = AgentType.CODE_GENERATOR
    display_name = "Code Generator"
    description = "Generates implementation code for a given task in the correct language."

    async def run(self, ctx: AgentContext) -> AgentResult:
        language = ctx.language
        framework = ctx.framework
        extension = LANGUAGE_EXTENSIONS.get(language, ".txt")
        src_dir = LANGUAGE_DIRS.get(language, "src")
        framework_hint = f" using {framework}" if framework else ""
        mcp_context = f"\n\nWorkspace context from MCP:\n{ctx.mcpContext}" if ctx.mcpContext else ""

        result = await call_llm([
            LlmMessage(role="system", content=(
                f"You are an expert {language.title()} engineer{framework_hint}.\n"
                f"Project: {ctx.projectName}\n\n"
                "Respond with a JSON object with exactly two keys:\n"
                '  "filename": a SHORT snake_case filename WITHOUT extension and WITHOUT directory — max 2-3 words\n'
                '  "code": the complete implementation code as a string\n\n'
                f"- Write ONLY {language.title()} code.\n"
                f"- Use modern {language.title()} best practices{framework_hint}.\n"
                "- Include all necessary imports.\n"
                "- One file, focused on exactly what the task describes.\n"
                "- No markdown fences inside the code string."
            )),
            LlmMessage(role="user", content=(
                f"Task: {ctx.taskTitle}\n"
                f"Description: {ctx.taskDescription}"
                f"{mcp_context}"
            )),
        ], max_tokens=8192, json_mode=True)

        try:
            parsed = json.loads(result.content)
            raw_name = str(parsed.get("filename", ctx.taskTitle))
            code = str(parsed.get("code", result.content))
        except (json.JSONDecodeError, AttributeError):
            raw_name = ctx.taskTitle
            code = result.content

        base = _to_filename(raw_name[:40], language)
        filename = f"{src_dir}/{base}{extension}"

        return AgentResult(
            agentType=self.type,
            summary=f'Generated {language.title()} implementation for "{ctx.taskTitle}"',
            artifacts=[Artifact(type="code", filename=filename, content=code, language=language)],
            rawLlmOutput=result.content,
            tokensUsed=result.tokensUsed,
        )
