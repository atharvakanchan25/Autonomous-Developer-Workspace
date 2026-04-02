import json
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

RUN_COMMANDS = {
    "python":     {"install": "pip install -r requirements.txt", "run": "python src/main.py", "test": "pytest tests/ -v"},
    "javascript": {"install": "npm install",                     "run": "node src/index.js",  "test": "npm test"},
    "typescript": {"install": "npm install",                     "run": "npx ts-node src/index.ts", "test": "npm test"},
    "java":       {"install": "mvn install",                     "run": "mvn exec:java",       "test": "mvn test"},
    "kotlin":     {"install": "gradle build",                    "run": "gradle run",          "test": "gradle test"},
    "go":         {"install": "go mod download",                 "run": "go run ./...",        "test": "go test ./..."},
    "rust":       {"install": "cargo build",                     "run": "cargo run",           "test": "cargo test"},
    "csharp":     {"install": "dotnet restore",                  "run": "dotnet run",          "test": "dotnet test"},
    "ruby":       {"install": "bundle install",                  "run": "ruby lib/main.rb",    "test": "bundle exec rspec"},
    "php":        {"install": "composer install",                "run": "php src/index.php",   "test": "vendor/bin/phpunit"},
}


def _build_file_tree(paths: list[str]) -> str:
    """Build an ASCII directory tree from a flat list of file paths."""
    tree: dict = {}
    for path in sorted(paths):
        parts = path.split("/")
        node = tree
        for part in parts:
            node = node.setdefault(part, {})

    lines: list[str] = []

    def _render(node: dict, prefix: str = "") -> None:
        items = sorted(node.keys())
        for i, name in enumerate(items):
            is_last = i == len(items) - 1
            connector = "└── " if is_last else "├── "
            lines.append(f"{prefix}{connector}{name}")
            child = node[name]
            if child:
                extension = "    " if is_last else "│   "
                _render(child, prefix + extension)

    lines.append(".")
    _render(tree)
    return "\n".join(lines)


def _parse_reviews(review_artifacts: list) -> list[dict]:
    """Parse structured review JSON from reviewer artifacts."""
    reviews = []
    for artifact in review_artifacts:
        try:
            data = json.loads(artifact.content)
            if isinstance(data, dict) and "score" in data:
                reviews.append(data)
        except (json.JSONDecodeError, AttributeError):
            pass
    return reviews


def _grade_color(grade: str) -> str:
    return {"A": "🟢", "B": "🟡", "C": "🟠", "D": "🔴", "F": "⛔"}.get(grade, "⚪")


def _build_quality_table(reviews: list[dict]) -> str:
    if not reviews:
        return "_No review data available._"

    total = sum(r.get("score", 0) for r in reviews)
    avg = total / len(reviews)
    overall_grade = "A" if avg >= 9 else "B" if avg >= 7 else "C" if avg >= 5 else "D" if avg >= 3 else "F"

    lines = [
        "| Task | Score | Grade | Summary |",
        "|------|-------|-------|---------|",
    ]
    for r in reviews:
        grade = r.get("grade", "N/A")
        icon = _grade_color(grade)
        title = r.get("taskTitle", "Unknown")[:50]
        score = r.get("score", 0)
        summary = r.get("summary", "")[:80]
        lines.append(f"| {title} | {score}/10 | {icon} {grade} | {summary} |")

    lines.append("")
    lines.append(f"**Overall Project Score: {avg:.1f}/10 (Grade: {overall_grade})**")
    return "\n".join(lines)


def _build_detailed_reviews(reviews: list[dict]) -> str:
    if not reviews:
        return "_No reviews available._"
    sections = []
    for r in reviews:
        md = r.get("markdown", "")
        if md:
            sections.append(md)
    return "\n\n---\n\n".join(sections)


class ScaffoldAgent:
    type = AgentType.SCAFFOLD
    display_name = "Scaffold Generator"
    description = "Generates README.md with quality scores table, how-to-run, file tree, and dependency file."

    async def run(self, ctx: AgentContext) -> AgentResult:
        language = ctx.language
        framework = ctx.framework
        framework_hint = f" with {framework}" if framework else ""
        deps_filename, deps_lang = DEPS_FILES.get(language, ("requirements.txt", "plaintext"))
        cmds = RUN_COMMANDS.get(language, {"install": "", "run": "", "test": ""})

        code_files: list[str] = []
        test_files: list[str] = []
        review_artifacts = []

        for agent_result in ctx.previousOutputs.values():
            for artifact in agent_result.artifacts:
                if not artifact.filename:
                    if artifact.type == "review":
                        review_artifacts.append(artifact)
                elif artifact.type == "code":
                    code_files.append(artifact.filename)
                elif artifact.type == "test":
                    test_files.append(artifact.filename)

        all_files = sorted(set(code_files + test_files + [deps_filename, "README.md"]))
        file_tree = _build_file_tree(all_files)
        reviews = _parse_reviews(review_artifacts)
        quality_table = _build_quality_table(reviews)
        detailed_reviews = _build_detailed_reviews(reviews)

        # Compute overall score for the README header badge
        avg_score = (sum(r.get("score", 0) for r in reviews) / len(reviews)) if reviews else 0
        overall_grade = "A" if avg_score >= 9 else "B" if avg_score >= 7 else "C" if avg_score >= 5 else "D" if avg_score >= 3 else "F"

        readme_result = await call_llm([
            LlmMessage(role="system", content=(
                "You are a senior software engineer writing professional project documentation.\n"
                "Generate a complete README.md using EXACTLY the structure below.\n"
                "Do NOT add extra sections. Do NOT skip any section.\n"
                "Replace all <PLACEHOLDER> tokens with real content.\n\n"
                "---\n"
                "# <Project Name>\n\n"
                "> <one-line tagline>\n\n"
                "![Quality Score](<OVERALL_SCORE_BADGE>)\n\n"
                "## Overview\n\n"
                "<2-3 paragraph description of what this project does and why>\n\n"
                "## Tech Stack\n\n"
                "| Layer | Technology |\n"
                "|-------|------------|\n"
                "| Language | <language> |\n"
                "| Framework | <framework or N/A> |\n"
                "| Testing | <test framework> |\n\n"
                "## Project Structure\n\n"
                "```\n<FILE_TREE>\n```\n\n"
                "## Getting Started\n\n"
                "### Prerequisites\n\n"
                "- <language> <minimum version>\n"
                "- <any other tools>\n\n"
                "### Installation\n\n"
                "```bash\n"
                "git clone <repo-url>\n"
                "cd <project-name>\n"
                "<INSTALL_CMD>\n"
                "```\n\n"
                "### Configuration\n\n"
                "<describe any environment variables or config files needed, or 'No configuration required.'>\n\n"
                "## Running the Project\n\n"
                "```bash\n<RUN_CMD>\n```\n\n"
                "## Running Tests\n\n"
                "```bash\n<TEST_CMD>\n```\n\n"
                "## Features\n\n"
                "<bullet list of key features implemented>\n\n"
                "## API Reference\n\n"
                "<document public functions/classes/endpoints, or 'See source files for inline documentation.'>\n\n"
                "## Code Quality\n\n"
                "<QUALITY_TABLE>\n\n"
                "## Detailed Code Reviews\n\n"
                "<DETAILED_REVIEWS>\n\n"
                "## License\n\n"
                "MIT License — see [LICENSE](LICENSE) for details.\n"
                "---\n\n"
                "Rules:\n"
                "- Use real runnable commands, not placeholders.\n"
                "- The Project Structure section must use the exact file tree provided.\n"
                "- The Code Quality section must use the exact quality table provided.\n"
                "- The Detailed Code Reviews section must use the exact review content provided.\n"
                "- Do not invent files that are not in the file tree."
            )),
            LlmMessage(role="user", content=(
                f"Project: {ctx.projectName}\n"
                f"Description: {ctx.projectDescription}\n"
                f"Language: {language}{framework_hint}\n"
                f"Overall Score: {avg_score:.1f}/10 (Grade: {overall_grade})\n\n"
                f"FILE_TREE:\n{file_tree}\n\n"
                f"INSTALL_CMD: {cmds['install']}\n"
                f"RUN_CMD: {cmds['run']}\n"
                f"TEST_CMD: {cmds['test']}\n\n"
                f"QUALITY_TABLE:\n{quality_table}\n\n"
                f"DETAILED_REVIEWS:\n{detailed_reviews}"
            )),
        ], max_tokens=4096)

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
                f"Files: {', '.join(code_files)}"
            )),
        ], max_tokens=1024)

        return AgentResult(
            agentType=self.type,
            summary=f'Generated README.md and {deps_filename} for "{ctx.projectName}" (Score: {avg_score:.1f}/10)',
            artifacts=[
                Artifact(type="readme", filename="README.md",   content=readme_result.content, language="markdown"),
                Artifact(type="deps",   filename=deps_filename, content=deps_result.content,   language=deps_lang),
            ],
            rawLlmOutput=readme_result.content,
            tokensUsed=readme_result.tokensUsed + deps_result.tokensUsed,
        )
