import re
from src.agents.agent_types import AgentType, AgentContext, AgentResult, Artifact
from src.agents.agent_llm import call_llm, LlmMessage

# Test framework mapping
TEST_FRAMEWORKS = {
    "python": "pytest",
    "javascript": "Jest",
    "typescript": "Jest",
    "java": "JUnit",
    "go": "testing package",
    "rust": "built-in test framework",
    "csharp": "xUnit",
    "ruby": "RSpec",
}

# Test directory mapping
TEST_DIRS = {
    "python": "tests",
    "javascript": "tests",
    "typescript": "tests",
    "java": "src/test/java",
    "go": "tests",
    "rust": "tests",
    "cpp": "tests",
    "c": "tests",
    "csharp": "tests",
    "ruby": "spec",
    "php": "tests",
    "swift": "Tests",
    "kotlin": "src/test/kotlin",
}

class TestGeneratorAgent:
    type = AgentType.TEST_GENERATOR
    display_name = "Test Generator"
    description = "Generates a test suite for a task, using generated code if available."

    async def run(self, ctx: AgentContext) -> AgentResult:
        # Get project language
        from src.lib.firestore import db
        project_doc = db.collection("projects").document(ctx.projectId).get()
        language = "python"  # default
        if project_doc.exists:
            project_data = project_doc.to_dict()
            language = project_data.get("language", "python").lower()
        
        test_framework = TEST_FRAMEWORKS.get(language, "appropriate testing framework")
        test_dir = TEST_DIRS.get(language, "tests")
        
        prev = ctx.previousOutputs.get(AgentType.CODE_GENERATOR)
        code_artifact = next((a for a in prev.artifacts if a.type == "code"), None) if prev else None

        code_context = (
            f"\n\nHere is the implementation to test:\n```{language}\n{code_artifact.content}\n```"
            if code_artifact else ""
        )

        result = await call_llm([
            LlmMessage(role="system", content=(
                f"You are an expert in {language.title()} testing with {test_framework}.\n"
                "Given a task and optionally its implementation, produce a comprehensive test suite.\n\n"
                "Rules:\n"
                "- Output ONLY the test code — no prose, no markdown fences.\n"
                f"- Use {test_framework} with appropriate patterns and best practices.\n"
                "- Cover: happy path, edge cases, and error cases.\n"
                "- Mock external dependencies (databases, HTTP calls) appropriately.\n"
                "- Each test must have a clear, descriptive name.\n"
                "- Follow the language's testing conventions."
            )),
            LlmMessage(role="user", content=f"Task: {ctx.taskTitle}\n\nDescription: {ctx.taskDescription}{code_context}"),
        ])

        base = re.sub(r"[^a-z0-9]+", "_", ctx.taskTitle.lower()).strip("_")[:50]
        
        # Language-specific test file naming
        if language == "python":
            filename = f"{test_dir}/test_{base}.py"
        elif language in ["javascript", "typescript"]:
            ext = "js" if language == "javascript" else "ts"
            filename = f"{test_dir}/{base}.test.{ext}"
        elif language == "java":
            class_name = "".join(word.capitalize() for word in base.split("_"))
            filename = f"{test_dir}/{class_name}Test.java"
        elif language == "kotlin":
            class_name = "".join(word.capitalize() for word in base.split("_"))
            filename = f"{test_dir}/{class_name}Test.kt"
        elif language == "go":
            filename = f"{test_dir}/{base}_test.go"
        elif language == "rust":
            filename = f"{test_dir}/{base}_test.rs"
        elif language == "csharp":
            class_name = "".join(word.capitalize() for word in base.split("_"))
            filename = f"{test_dir}/{class_name}Tests.cs"
        elif language == "ruby":
            filename = f"{test_dir}/{base}_spec.rb"
        else:
            filename = f"{test_dir}/test_{base}.txt"

        return AgentResult(
            agentType=self.type,
            summary=f'Generated {test_framework} test suite for "{ctx.taskTitle}"',
            artifacts=[Artifact(type="test", filename=filename, content=result.content, language=language)],
            rawLlmOutput=result.content,
            tokensUsed=result.tokensUsed,
        )
