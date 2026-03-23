import re
from src.agents.agent_types import AgentType, AgentContext, AgentResult, Artifact
from src.agents.agent_llm import call_llm, LlmMessage

# Language to file extension mapping
LANGUAGE_EXTENSIONS = {
    "python": ".py",
    "javascript": ".js",
    "typescript": ".ts",
    "java": ".java",
    "go": ".go",
    "rust": ".rs",
    "cpp": ".cpp",
    "c": ".c",
    "csharp": ".cs",
    "ruby": ".rb",
    "php": ".php",
    "swift": ".swift",
    "kotlin": ".kt",
}

# Language-specific directory structures
LANGUAGE_DIRS = {
    "python": "src",
    "javascript": "src",
    "typescript": "src",
    "java": "src/main/java",
    "go": "pkg",
    "rust": "src",
    "cpp": "src",
    "c": "src",
    "csharp": "src",
    "ruby": "lib",
    "php": "src",
    "swift": "Sources",
    "kotlin": "src/main/kotlin",
}

class CodeGeneratorAgent:
    type = AgentType.CODE_GENERATOR
    display_name = "Code Generator"
    description = "Generates implementation code for a given task in the detected language."

    async def run(self, ctx: AgentContext) -> AgentResult:
        # Get project language
        from src.lib.firestore import db
        project_doc = db.collection("projects").document(ctx.projectId).get()
        language = "python"  # default
        if project_doc.exists:
            project_data = project_doc.to_dict()
            language = project_data.get("language", "python").lower()
        
        extension = LANGUAGE_EXTENSIONS.get(language, ".txt")
        src_dir = LANGUAGE_DIRS.get(language, "src")
        
        result = await call_llm([
            LlmMessage(role="system", content=(
                f"You are an expert {language.title()} engineer.\n"
                f"Given a task title and description, produce clean, production-ready {language.title()} implementation code.\n\n"
                "Rules:\n"
                "- Output ONLY the code — no prose, no markdown fences, no explanation.\n"
                f"- Use modern {language.title()} best practices and idioms.\n"
                "- Include all necessary imports at the top.\n"
                "- Add concise docstrings/comments on public functions only.\n"
                "- Keep the implementation focused on exactly what the task describes.\n"
                "- Follow proper naming conventions for the language.\n"
                "- Structure code with proper separation of concerns."
            )),
            LlmMessage(role="user", content=f"Task: {ctx.taskTitle}\n\nDescription: {ctx.taskDescription}\n\nProject context: {ctx.projectId}"),
        ])

        # Create proper filename with directory structure
        base_name = re.sub(r"[^a-z0-9]+", "_", ctx.taskTitle.lower()).strip("_")[:50]
        
        # Language-specific naming conventions
        if language == "java" or language == "kotlin":
            # Java/Kotlin use PascalCase for class names
            class_name = "".join(word.capitalize() for word in base_name.split("_"))
            filename = f"{src_dir}/{class_name}{extension}"
        elif language == "go":
            # Go uses snake_case
            filename = f"{src_dir}/{base_name}{extension}"
        elif language == "csharp":
            # C# uses PascalCase
            class_name = "".join(word.capitalize() for word in base_name.split("_"))
            filename = f"{src_dir}/{class_name}{extension}"
        else:
            # Most languages use snake_case or kebab-case
            filename = f"{src_dir}/{base_name}{extension}"

        return AgentResult(
            agentType=self.type,
            summary=f'Generated {language.title()} implementation for "{ctx.taskTitle}"',
            artifacts=[Artifact(type="code", filename=filename, content=result.content, language=language)],
            rawLlmOutput=result.content,
            tokensUsed=result.tokensUsed,
        )
