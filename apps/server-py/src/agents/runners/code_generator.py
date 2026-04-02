import re
import json
from src.agents.agent_types import AgentType, AgentContext, AgentResult, Artifact
from src.agents.agent_llm import call_llm, LlmMessage


def _strip_fences(content: str) -> str:
    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1]
    if content.endswith("```"):
        content = content.rsplit("```", 1)[0]
    return content.strip()

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

        # Build style instructions from preferences
        theme_map = {
            "Dark":     "dark background #0f0f0f, white text #f0f0f0",
            "Light":    "white background #ffffff, dark text #111111",
            "Colorful": "vibrant gradient background, bright accent colors",
        }
        font_map = {
            "Modern":  "Inter font, clean minimal typography",
            "Classic": "Georgia serif font, traditional layout",
            "Playful": "rounded corners everywhere, fun bright colors, large friendly fonts",
        }
        layout_map = {
            "Minimal":  "lots of whitespace, no borders, subtle shadows",
            "Spacious": "generous padding, large text, breathing room",
            "Compact":  "tight layout, small text, dense information",
        }
        style_instructions = ", ".join([
            theme_map.get(ctx.style_theme, theme_map["Dark"]),
            font_map.get(ctx.style_font, font_map["Modern"]),
            layout_map.get(ctx.style_layout, layout_map["Minimal"]),
        ])

        # Split into 3 files for web projects
        if language.lower() == "html":
            result = await call_llm([
                LlmMessage(role="system", content=(
                    "You are an expert frontend web developer.\n"
                    f"Project: {ctx.projectName}\n\n"
                    f"STYLE REQUIREMENTS: {style_instructions}\n\n"
                    "Generate a web project split into exactly 3 files: index.html, style.css, app.js.\n\n"
                    "Respond with a JSON object with exactly 3 keys: \"html\", \"css\", \"js\".\n"
                    "Each key contains ONLY the raw file content as a string — no markdown fences, no explanation.\n\n"
                    "RULES for index.html:\n"
                    "- Must include: <link rel=\"stylesheet\" href=\"style.css\"> in <head>\n"
                    "- Must include: <script src=\"app.js\"></script> at the bottom of <body>\n"
                    "- No inline <style> or <script> tags — all CSS is in style.css, all JS is in app.js\n"
                    "- Include this theme toggle button just before </body>:\n"
                    "  <button id=\"theme-toggle\" onclick=\"toggleTheme()\" style=\"position:fixed;bottom:20px;right:20px;background:var(--card);border:1px solid var(--border);border-radius:50%;width:44px;height:44px;font-size:20px;cursor:pointer;z-index:9999;box-shadow:0 2px 10px rgba(0,0,0,0.2);transition:transform 0.2s;\">🌙</button>\n\n"
                    "RULES for style.css:\n"
                    "- MUST start with these exact CSS variable declarations:\n"
                    "  body {\n"
                    "    --bg: #ffffff; --text: #111111; --card: #f5f5f5; --border: #dddddd;\n"
                    "    background-color: var(--bg); color: var(--text);\n"
                    "    transition: background 0.3s, color 0.3s;\n"
                    "  }\n"
                    "  body.dark { --bg: #0f0f0f; --text: #f0f0f0; --card: #1a1a1a; --border: #333333; }\n"
                    "- Use var(--bg), var(--text), var(--card), var(--border) throughout ALL CSS rules\n"
                    "- Never hardcode colors — always use the CSS variables so the theme toggle works\n"
                    "- Visually polished, modern design\n\n"
                    "RULES for app.js:\n"
                    "- MUST include this theme toggle function:\n"
                    "  function toggleTheme() {\n"
                    "    const dark = document.body.classList.toggle('dark');\n"
                    "    document.getElementById('theme-toggle').textContent = dark ? '☀️' : '🌙';\n"
                    "    localStorage.setItem('theme', dark ? 'dark' : 'light');\n"
                    "  }\n"
                    "  if (localStorage.getItem('theme') === 'dark') {\n"
                    "    document.body.classList.add('dark');\n"
                    "    document.getElementById('theme-toggle').textContent = '☀️';\n"
                    "  }\n"
                    "- All other app JavaScript follows after the theme code\n"
                    "- Vanilla ES6+, no imports, no require(), no npm packages\n"
                    "- Must work in a browser with no build step\n"
                )),
                LlmMessage(role="user", content=(
                    f"Task: {ctx.taskTitle}\n"
                    f"Description: {ctx.taskDescription}"
                )),
            ], max_tokens=8192, json_mode=True)

            try:
                parsed = json.loads(result.content)
                html = _strip_fences(str(parsed.get("html", "")))
                css  = _strip_fences(str(parsed.get("css", "")))
                js   = _strip_fences(str(parsed.get("js", "")))
            except (json.JSONDecodeError, AttributeError):
                # Fallback: treat entire response as html
                html = _strip_fences(result.content)
                css  = ""
                js   = ""

            artifacts = [
                Artifact(type="code", filename="index.html", content=html, language="html"),
                Artifact(type="code", filename="style.css",  content=css,  language="css"),
                Artifact(type="code", filename="app.js",     content=js,   language="javascript"),
            ]
            return AgentResult(
                agentType=self.type,
                summary=f'Generated index.html + style.css + app.js for "{ctx.taskTitle}"',
                artifacts=artifacts,
                rawLlmOutput=result.content,
                tokensUsed=result.tokensUsed,
            )

        # Original logic for non-web projects
        extension = LANGUAGE_EXTENSIONS.get(language, ".txt")
        src_dir = LANGUAGE_DIRS.get(language, "src")
        framework_hint = f" using {framework}" if framework else ""

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
            )),
        ], max_tokens=8192, json_mode=True)

        try:
            parsed = json.loads(result.content)
            raw_name = str(parsed.get("filename", ctx.taskTitle))
            code = _strip_fences(str(parsed.get("code", result.content)))
        except (json.JSONDecodeError, AttributeError):
            raw_name = ctx.taskTitle
            code = _strip_fences(result.content)

        base = _to_filename(raw_name[:40], language)
        filename = f"{src_dir}/{base}{extension}"

        return AgentResult(
            agentType=self.type,
            summary=f'Generated {language.title()} implementation for "{ctx.taskTitle}"',
            artifacts=[Artifact(type="code", filename=filename, content=code, language=language)],
            rawLlmOutput=result.content,
            tokensUsed=result.tokensUsed,
        )
