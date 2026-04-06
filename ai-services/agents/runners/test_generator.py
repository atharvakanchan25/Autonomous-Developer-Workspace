import sys
from pathlib import Path

# Add backend to Python path
sys.path.append(str(Path(__file__).parent.parent.parent.parent / "backend"))

from agents.agent_types import AgentType, AgentContext, AgentResult, Artifact
from agents.agent_llm import call_llm, LlmMessage

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
    basename = code_filename.split("/")[-1].rsplit(".", 1)[0]
    if language == "python":
        return f"{test_dir}/test_{basename}.py"
    if language == "javascript":
        return f"{test_dir}/{basename}.test.js"
    if language == "typescript":
        return f"{test_dir}/{basename}.test.ts"
    if language in ("java", "kotlin"):
        pascal = "".join(w.capitalize() for w in basename.split("_"))
        suffix = "Test" if language == "java" else "Test"
        return f"{test_dir}/{pascal}{suffix}.{language[:4]}"
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
        framework_hint = f" using {framework}" if framework else ""
        mcp_context = f"\n\nWorkspace context from MCP:\n{ctx.mcpContext}" if ctx.mcpContext else ""

        prev = ctx.previousOutputs.get(AgentType.CODE_GENERATOR)
        code_artifact = next((a for a in prev.artifacts if a.type == "code"), None) if prev else None

        code_context = (
            f"\n\nImplementation to test:\n```{language}\n{code_artifact.content}\n```"
            if code_artifact else ""
        )

        result = await call_llm([
            LlmMessage(role="system", content=(
                f"You are an expert in {language.title()} testing with {test_framework}{framework_hint}.\n"
                f"Project: {ctx.projectName}\n\n"
                "Output ONLY the test code — no prose, no markdown fences.\n\n"
                f"STRICT TEST QUALITY RULES — every rule is mandatory:\n"
                f"1. Write ONLY {language.title()} test code using {test_framework}.\n"
                "2. Every test function must have a clear descriptive name that states WHAT is being tested and WHAT the expected outcome is.\n"
                "3. Cover: happy path, edge cases (empty input, boundary values), and error/exception cases.\n"
                "4. Use fixtures or setup/teardown to avoid duplicated setup code.\n"
                "5. Use parametrize / data-driven tests where multiple similar cases exist.\n"
                "6. Each test must have exactly ONE logical assertion — split multi-assertion tests.\n"
                "7. Mock ALL external dependencies (DB, HTTP, filesystem, time).\n"
                "8. Include a module-level docstring describing what is being tested.\n"
                "9. Tests must be fully runnable with no modification — no placeholder values."
            )),
            LlmMessage(role="user", content=(
                f"Task: {ctx.taskTitle}\n"
                f"Description: {ctx.taskDescription}"
                f"{code_context}"
                f"{mcp_context}"
            )),
        ], max_tokens=4096)

        code_filename = code_artifact.filename if code_artifact else f"src/{ctx.taskTitle}"
        filename = _test_filename(code_filename, language, test_dir)

        return AgentResult(
            agentType=self.type,
            summary=f'Generated {test_framework} test suite for "{ctx.taskTitle}"',
            artifacts=[Artifact(type="test", filename=filename, content=result.content, language=language)],
            rawLlmOutput=result.content,
            tokensUsed=result.tokensUsed,
        )
