import re
import json
from src.agents.agent_types import AgentType, AgentContext, AgentResult, Artifact
from src.agents.agent_llm import call_llm, LlmMessage

TEST_FRAMEWORKS = {
    "python": "pytest", "javascript": "Jest", "typescript": "Jest",
    "java": "JUnit", "go": "testing package", "rust": "built-in test framework",
    "csharp": "xUnit", "ruby": "RSpec", "kotlin": "JUnit",
}

TEST_DIRS = {
    "python": "tests", "javascript": "tests", "typescript": "tests",
    "java": "src/test/java", "go": "tests", "rust": "tests",
    "cpp": "tests", "c": "tests", "csharp": "tests",
    "ruby": "spec", "php": "tests", "swift": "Tests",
    "kotlin": "src/test/kotlin",
}


def _test_filename(code_filename: str, language: str, test_dir: str) -> str:
    """Derive the test filename from the code filename."""
    basename = code_filename.split("/")[-1].rsplit(".", 1)[0]  # e.g. "auth"
    if language == "python":
        return f"{test_dir}/test_{basename}.py"
    if language == "javascript":
        return f"{test_dir}/{basename}.test.js"
    if language == "typescript":
        return f"{test_dir}/{basename}.test.ts"
    if language == "java":
        pascal = "".join(w.capitalize() for w in basename.split("_"))
        return f"{test_dir}/{pascal}Test.java"
    if language == "kotlin":
        pascal = "".join(w.capitalize() for w in basename.split("_"))
        return f"{test_dir}/{pascal}Test.kt"
    if language == "go":
        return f"{test_dir}/{basename}_test.go"
    if language == "rust":
        return f"{test_dir}/{basename}_test.rs"
    if language == "csharp":
        pascal = "".join(w.capitalize() for w in basename.split("_"))
        return f"{test_dir}/{pascal}Tests.cs"
    if language == "ruby":
        return f"{test_dir}/{basename}_spec.rb"
    return f"{test_dir}/test_{basename}.txt"


class TestGeneratorAgent:
    type = AgentType.TEST_GENERATOR
    display_name = "Test Generator"
    description = "Generates a test suite mirroring the code file structure."

    async def run(self, ctx: AgentContext) -> AgentResult:
        language = ctx.language
        framework = ctx.framework
        test_framework = TEST_FRAMEWORKS.get(language, "appropriate testing framework")
        test_dir = TEST_DIRS.get(language, "tests")

        prev = ctx.previousOutputs.get(AgentType.CODE_GENERATOR)
        code_artifact = next((a for a in prev.artifacts if a.type == "code"), None) if prev else None

        code_context = (
            f"\n\nImplementation to test:\n```{language}\n{code_artifact.content}\n```"
            if code_artifact else ""
        )

        framework_hint = f" using {framework}" if framework else ""

        result = await call_llm([
            LlmMessage(role="system", content=(
                f"You are an expert in {language.title()} testing with {test_framework}{framework_hint}.\n"
                f"Project: {ctx.projectName}\n\n"
                "Output ONLY the test code — no prose, no markdown fences.\n"
                f"Write ONLY {language.title()} test code using {test_framework}.\n"
                "Cover: happy path, edge cases, error cases.\n"
                "Mock external dependencies appropriately.\n"
                "Each test must have a clear descriptive name."
            )),
            LlmMessage(role="user", content=(
                f"Task: {ctx.taskTitle}\n"
                f"Description: {ctx.taskDescription}"
                f"{code_context}"
            )),
        ], max_tokens=4096)

        # Mirror the code filename for the test filename
        code_filename = code_artifact.filename if code_artifact else f"src/{ctx.taskTitle}"
        filename = _test_filename(code_filename, language, test_dir)

        return AgentResult(
            agentType=self.type,
            summary=f'Generated {test_framework} test suite for "{ctx.taskTitle}"',
            artifacts=[Artifact(type="test", filename=filename, content=result.content, language=language)],
            rawLlmOutput=result.content,
            tokensUsed=result.tokensUsed,
        )
