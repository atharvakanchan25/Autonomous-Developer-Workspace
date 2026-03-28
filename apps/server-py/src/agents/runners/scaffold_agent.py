from src.agents.agent_types import AgentType, AgentContext, AgentResult, Artifact
from src.agents.agent_llm import call_llm, LlmMessage

DEPS_FILES = {
    "python":     ("requirements.txt", "plaintext"),
    "javascript": ("package.json",     "json"),
    "typescript": ("package.json",     "json"),
    "java":       ("pom.xml",          "xml"),
    "kotlin":     ("build.gradle.kts", "plaintext"),
    "go":         ("go.mod",           "plaintext"),
    "rust":       ("Cargo.toml",       "toml"),
    "csharp":     ("project.csproj",   "xml"),
    "ruby":       ("Gemfile",          "ruby"),
    "php":        ("composer.json",    "json"),
    "swift":      ("Package.swift",    "swift"),
    "cpp":        ("CMakeLists.txt",   "plaintext"),
    "c":          ("CMakeLists.txt",   "plaintext"),
}


class ScaffoldAgent:
    type = AgentType.SCAFFOLD
    display_name = "Scaffold Generator"
    description = "Generates README.md (with embedded reviews) and dependency file."

    async def run(self, ctx: AgentContext) -> AgentResult:
        language = ctx.language
        framework = ctx.framework
        framework_hint = f" with {framework}" if framework else ""

        deps_filename, deps_lang = DEPS_FILES.get(language, ("requirements.txt", "plaintext"))

        # Collect generated source files (non-empty filename, non-review)
        code_files: list[str] = []
        test_files: list[str] = []
        review_sections: list[str] = []

        for agent_result in ctx.previousOutputs.values():
            for artifact in agent_result.artifacts:
                if not artifact.filename:
                    if artifact.type == "review":
                        review_sections.append(artifact.content)
                elif artifact.type == "code":
                    code_files.append(artifact.filename)
                elif artifact.type == "test":
                    test_files.append(artifact.filename)

        all_files = sorted(set(code_files + test_files))
        files_list = "\n".join(f"  - {f}" for f in all_files)
        reviews_block = "\n\n---\n\n".join(review_sections) if review_sections else "_No reviews available._"

        # --- README ---
        readme_result = await call_llm([
            LlmMessage(role="system", content=(
                "You are a senior software engineer writing professional project documentation.\n"
                "Generate a complete, professional README.md.\n\n"
                "Include ALL of these sections in this exact order:\n"
                "1. # <Project Name> — tagline\n"
                "2. ## Overview\n"
                "3. ## Tech Stack — language, framework, key libraries with versions\n"
                "4. ## Project Structure — ASCII directory tree\n"
                "5. ## Architecture — ASCII diagram of how components interact\n"
                "6. ## Getting Started\n"
                "   ### Prerequisites\n"
                "   ### Installation — exact shell commands\n"
                "   ### Configuration — env vars table if needed\n"
                "7. ## Running the Project — exact commands\n"
                "8. ## Running Tests — exact commands\n"
                "9. ## Features — bullet list of what the app does\n"
                "10. ## API Reference — endpoints/functions if applicable\n"
                "11. ## Code Reviews\n"
                "    (paste the reviews block here verbatim)\n"
                "12. ## License — MIT\n\n"
                "Rules:\n"
                "- Use real, runnable commands — no placeholders.\n"
                "- The 'Code Reviews' section must contain the reviews block provided.\n"
                "- Be concise but complete."
            )),
            LlmMessage(role="user", content=(
                f"Project: {ctx.projectName}\n"
                f"Description: {ctx.projectDescription}\n"
                f"Language: {language}{framework_hint}\n\n"
                f"Generated files:\n{files_list}\n\n"
                f"Code Reviews:\n{reviews_block}"
            )),
        ], max_tokens=4096)

        # --- Deps file ---
        deps_result = await call_llm([
            LlmMessage(role="system", content=(
                f"You are an expert {language.title()} engineer.\n"
                f"Output ONLY the exact content of `{deps_filename}` for this project.\n"
                "Include all required dependencies with pinned or constrained versions.\n"
                "No explanation. No markdown fences. Just the file content."
            )),
            LlmMessage(role="user", content=(
                f"Project: {ctx.projectName}\n"
                f"Language: {language}{framework_hint}\n"
                f"Files: {', '.join(all_files)}"
            )),
        ], max_tokens=1024)

        return AgentResult(
            agentType=self.type,
            summary=f'Generated README.md and {deps_filename} for "{ctx.projectName}"',
            artifacts=[
                Artifact(type="readme", filename="README.md",   content=readme_result.content, language="markdown"),
                Artifact(type="deps",   filename=deps_filename, content=deps_result.content,   language=deps_lang),
            ],
            rawLlmOutput=readme_result.content,
            tokensUsed=readme_result.tokensUsed + deps_result.tokensUsed,
        )
