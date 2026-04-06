import re
import json
import sys
from pathlib import Path

# ─────────────────────────────────────────────
# STEP 1 & 2 — Premium CSS themes
# ─────────────────────────────────────────────

STYLE_DARK = """* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', sans-serif; background: #0a0a0f; color: #e2e8f0; min-height: 100vh; }
.app { display: flex; min-height: 100vh; }
.sidebar { width: 240px; background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%); display: flex; flex-direction: column; padding: 0; flex-shrink: 0; border-right: 1px solid #2a2a4a; position: fixed; height: 100vh; }
.sidebar-logo { padding: 24px 20px; color: white; font-size: 18px; font-weight: 800; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #2a2a4a; }
.sidebar-logo-icon { width: 40px; height: 40px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; }
.nav-item { margin: 2px 8px; padding: 10px 16px; color: #94a3b8; cursor: pointer; display: flex; align-items: center; gap: 12px; font-size: 14px; font-weight: 500; transition: all 0.2s; border-radius: 10px; border: 1px solid transparent; }
.nav-item:hover, .nav-item.active { background: rgba(99,102,241,0.15); color: #818cf8; border-color: rgba(99,102,241,0.3); }
.nav-icon { font-size: 18px; width: 22px; text-align: center; }
.main { flex: 1; margin-left: 240px; display: flex; flex-direction: column; }
.topbar { height: 64px; background: rgba(13,13,26,0.95); border-bottom: 1px solid #2a2a4a; display: flex; align-items: center; justify-content: space-between; padding: 0 28px; position: sticky; top: 0; z-index: 10; }
.topbar-title { font-size: 20px; font-weight: 800; background: linear-gradient(135deg, #818cf8, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.content { flex: 1; padding: 24px 28px; }
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
.stat-card { background: #13131f; border: 1px solid #2a2a4a; border-radius: 16px; padding: 20px; display: flex; align-items: center; gap: 16px; transition: all 0.3s; position: relative; overflow: hidden; }
.stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, #6366f1, #8b5cf6); }
.stat-card:nth-child(2)::before { background: linear-gradient(90deg, #10b981, #059669); }
.stat-card:nth-child(3)::before { background: linear-gradient(90deg, #f59e0b, #d97706); }
.stat-card:nth-child(4)::before { background: linear-gradient(90deg, #3b82f6, #2563eb); }
.stat-card:hover { transform: translateY(-4px); border-color: #6366f1; box-shadow: 0 0 30px rgba(99,102,241,0.2); }
.stat-icon { width: 52px; height: 52px; border-radius: 14px; background: rgba(99,102,241,0.15); display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; }
.stat-card:nth-child(2) .stat-icon { background: rgba(16,185,129,0.15); }
.stat-card:nth-child(3) .stat-icon { background: rgba(245,158,11,0.15); }
.stat-card:nth-child(4) .stat-icon { background: rgba(59,130,246,0.15); }
.stat-value { font-size: 28px; font-weight: 800; color: #f1f5f9; }
.stat-label { font-size: 12px; color: #64748b; margin-top: 2px; }
.content-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.content-grid.full { grid-template-columns: 1fr; }
.card { background: #13131f; border: 1px solid #2a2a4a; border-radius: 16px; padding: 24px; margin-bottom: 20px; }
.card:hover { border-color: rgba(99,102,241,0.4); }
.card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #2a2a4a; }
.card-title { font-size: 16px; font-weight: 700; color: #f1f5f9; display: flex; align-items: center; gap: 10px; }
.card-title::before { content: ''; width: 4px; height: 20px; background: linear-gradient(180deg, #6366f1, #8b5cf6); border-radius: 2px; }
.form-group { margin-bottom: 16px; }
.form-label { display: block; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
.form-input { width: 100%; padding: 11px 16px; background: rgba(255,255,255,0.04); border: 1.5px solid #2a2a4a; border-radius: 10px; font-size: 14px; color: #e2e8f0; transition: all 0.2s; outline: none; }
.form-input:focus { border-color: #6366f1; background: rgba(99,102,241,0.05); box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
select.form-input option { background: #1a1a2e; }
.btn { padding: 11px 24px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; transition: all 0.2s; display: inline-flex; align-items: center; gap: 8px; }
.btn-primary { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; width: 100%; justify-content: center; }
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(99,102,241,0.4); }
.btn-danger { background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); padding: 6px 14px; font-size: 12px; }
.btn-danger:hover { background: #ef4444; color: white; }
.btn-success { background: linear-gradient(135deg, #10b981, #059669); color: white; }
table { width: 100%; border-collapse: collapse; }
th { background: rgba(99,102,241,0.1); padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; color: #818cf8; text-transform: uppercase; letter-spacing: 0.08em; }
td { padding: 14px 16px; font-size: 14px; color: #cbd5e1; border-bottom: 1px solid #1e1e3a; vertical-align: middle; }
tr:hover td { background: rgba(99,102,241,0.05); }
tr:last-child td { border-bottom: none; }
.badge { padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; }
.badge-success { background: rgba(16,185,129,0.15); color: #10b981; }
.badge-warning { background: rgba(245,158,11,0.15); color: #f59e0b; }
.badge-danger { background: rgba(239,68,68,0.15); color: #ef4444; }
.empty-state { text-align: center; padding: 48px; }
.empty-icon { font-size: 56px; margin-bottom: 12px; opacity: 0.5; }
.empty-text { font-size: 14px; color: #64748b; }
.toast-container { position: fixed; bottom: 24px; right: 24px; z-index: 9999; display: flex; flex-direction: column; gap: 12px; }
.toast { background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 12px; padding: 16px 20px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); display: flex; align-items: center; gap: 12px; min-width: 300px; border-left: 4px solid #6366f1; animation: slideIn 0.3s ease; color: #e2e8f0; font-size: 14px; }
.toast.success { border-left-color: #10b981; }
.toast.error { border-left-color: #ef4444; }
.spinner { width: 36px; height: 36px; border: 3px solid #2a2a4a; border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 48px auto; display: block; }
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #2a2a4a; border-radius: 3px; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }"""

STYLE_LIGHT = """* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', sans-serif; background: #f0f2ff; color: #2d3748; min-height: 100vh; }
.app { display: flex; min-height: 100vh; }
.sidebar { width: 240px; background: linear-gradient(180deg, #2d2b55, #1a1840); display: flex; flex-direction: column; padding: 0; flex-shrink: 0; position: fixed; height: 100vh; }
.sidebar-logo { padding: 24px 20px; color: white; font-size: 18px; font-weight: 800; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); }
.sidebar-logo-icon { width: 40px; height: 40px; background: linear-gradient(135deg, #6c63ff, #a78bfa); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; }
.nav-item { margin: 3px 10px; padding: 11px 16px; color: rgba(255,255,255,0.6); cursor: pointer; display: flex; align-items: center; gap: 12px; font-size: 14px; font-weight: 500; transition: all 0.2s; border-radius: 10px; }
.nav-item:hover, .nav-item.active { background: rgba(255,255,255,0.12); color: white; }
.nav-item.active { background: rgba(108,99,255,0.3); }
.nav-icon { font-size: 18px; width: 22px; text-align: center; }
.main { flex: 1; margin-left: 240px; display: flex; flex-direction: column; }
.topbar { height: 64px; background: white; border-bottom: 1px solid #e8eaf6; display: flex; align-items: center; justify-content: space-between; padding: 0 28px; position: sticky; top: 0; z-index: 10; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.topbar-title { font-size: 20px; font-weight: 800; color: #2d3748; }
.content { flex: 1; padding: 24px 28px; }
.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px; }
.stat-card { background: white; border-radius: 16px; padding: 20px; display: flex; align-items: center; gap: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); transition: all 0.3s; border-left: 4px solid #6c63ff; }
.stat-card:nth-child(2) { border-left-color: #4CAF50; }
.stat-card:nth-child(3) { border-left-color: #ff9800; }
.stat-card:nth-child(4) { border-left-color: #2196F3; }
.stat-card:hover { transform: translateY(-4px); box-shadow: 0 12px 28px rgba(108,99,255,0.15); }
.stat-icon { width: 52px; height: 52px; border-radius: 14px; background: rgba(108,99,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 26px; }
.stat-card:nth-child(2) .stat-icon { background: rgba(76,175,80,0.1); }
.stat-card:nth-child(3) .stat-icon { background: rgba(255,152,0,0.1); }
.stat-card:nth-child(4) .stat-icon { background: rgba(33,150,243,0.1); }
.stat-value { font-size: 30px; font-weight: 800; color: #2d3748; }
.stat-label { font-size: 12px; color: #718096; margin-top: 2px; }
.content-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.content-grid.full { grid-template-columns: 1fr; }
.card { background: white; border-radius: 16px; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); margin-bottom: 20px; }
.card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #e8eaf6; }
.card-title { font-size: 16px; font-weight: 700; color: #2d3748; display: flex; align-items: center; gap: 10px; }
.card-title::before { content: ''; width: 4px; height: 20px; background: #6c63ff; border-radius: 2px; }
.form-group { margin-bottom: 16px; }
.form-label { display: block; font-size: 11px; font-weight: 700; color: #718096; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
.form-input { width: 100%; padding: 11px 16px; background: #f8f9ff; border: 1.5px solid #e8eaf6; border-radius: 10px; font-size: 14px; color: #2d3748; transition: all 0.2s; outline: none; }
.form-input:focus { border-color: #6c63ff; background: white; box-shadow: 0 0 0 3px rgba(108,99,255,0.1); }
.btn { padding: 11px 24px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; transition: all 0.2s; display: inline-flex; align-items: center; gap: 8px; }
.btn-primary { background: linear-gradient(135deg, #6c63ff, #a78bfa); color: white; width: 100%; justify-content: center; }
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(108,99,255,0.35); }
.btn-danger { background: rgba(244,67,54,0.08); color: #f44336; border: 1px solid rgba(244,67,54,0.2); padding: 6px 14px; font-size: 12px; }
.btn-danger:hover { background: #f44336; color: white; }
table { width: 100%; border-collapse: collapse; }
th { background: #f8f9ff; padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; color: #718096; text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 2px solid #e8eaf6; }
td { padding: 14px 16px; font-size: 14px; color: #4a5568; border-bottom: 1px solid #f0f2ff; vertical-align: middle; }
tr:hover td { background: #f8f9ff; }
tr:last-child td { border-bottom: none; }
.badge { padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; }
.badge-success { background: rgba(76,175,80,0.1); color: #4CAF50; }
.badge-warning { background: rgba(255,152,0,0.1); color: #ff9800; }
.badge-danger { background: rgba(244,67,54,0.1); color: #f44336; }
.empty-state { text-align: center; padding: 48px; }
.empty-icon { font-size: 56px; margin-bottom: 12px; opacity: 0.4; }
.empty-text { font-size: 14px; color: #a0aec0; }
.toast-container { position: fixed; bottom: 24px; right: 24px; z-index: 9999; display: flex; flex-direction: column; gap: 12px; }
.toast { background: white; border-radius: 12px; padding: 16px 20px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); display: flex; align-items: center; gap: 12px; min-width: 300px; border-left: 4px solid #6c63ff; animation: slideIn 0.3s ease; font-size: 14px; }
.toast.success { border-left-color: #4CAF50; }
.toast.error { border-left-color: #f44336; }
.spinner { width: 36px; height: 36px; border: 3px solid #e8eaf6; border-top-color: #6c63ff; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 48px auto; display: block; }
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #e8eaf6; border-radius: 3px; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }"""


# ─────────────────────────────────────────────
# STEP 2 — Theme selector
# ─────────────────────────────────────────────

def get_premium_css(description: str) -> str:
    desc = description.lower()
    light_keywords = [
        "library", "hospital", "school", "student",
        "employee", "hotel", "management", "booking",
        "inventory", "clinic", "university", "college",
        "shop", "store", "retail", "customer", "order"
    ]
    if any(k in desc for k in light_keywords):
        return STYLE_LIGHT
    return STYLE_DARK


# ─────────────────────────────────────────────
# STEP 3 — Dark/light toggle script
# ─────────────────────────────────────────────

def _get_toggle_script() -> str:
    return """<button id="adw-toggle" onclick="adwToggle()" style="position:fixed;bottom:24px;right:24px;width:52px;height:52px;border-radius:50%;border:none;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;font-size:22px;cursor:pointer;z-index:99999;box-shadow:0 4px 20px rgba(99,102,241,0.4);">🌙</button>
<script>
(function(){
  const DARK={'--bg':'#0a0a0f','--text':'#e2e8f0','--card':'#13131f','--border':'#2a2a4a'};
  const LIGHT={'--bg':'#f0f2ff','--text':'#2d3748','--card':'#ffffff','--border':'#e8eaf6'};
  let dark=localStorage.getItem('adw-dark')==='1';
  const btn=document.getElementById('adw-toggle');
  const root=document.documentElement;
  function apply(d){
    const t=d?DARK:LIGHT;
    Object.entries(t).forEach(([k,v])=>root.style.setProperty(k,v));
    document.body.style.backgroundColor=t['--bg'];
    document.body.style.color=t['--text'];
    document.querySelectorAll('.card,.stat-card').forEach(el=>{
      el.style.backgroundColor=t['--card'];
      el.style.borderColor=t['--border'];
    });
    document.querySelectorAll('.form-input').forEach(el=>{
      el.style.backgroundColor=d?'rgba(255,255,255,0.04)':'#f8f9ff';
      el.style.color=t['--text'];
      el.style.borderColor=t['--border'];
    });
    btn.textContent=d?'\u2600\ufe0f':'\ud83c\udf19';
    localStorage.setItem('adw-dark',d?'1':'0');
  }
  window.adwToggle=function(){dark=!dark;apply(dark);};
  apply(dark);
})();
</script>"""


# ─────────────────────────────────────────────
# Existing helpers (unchanged)
# ─────────────────────────────────────────────

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


# ─────────────────────────────────────────────
# Main agent class
# ─────────────────────────────────────────────

class CodeGeneratorAgent:
    type = AgentType.CODE_GENERATOR
    display_name = "Code Generator"
    description = "Generates implementation code for a given task in the correct language."

    # ── STEP 4: Route HTML tasks to the dedicated frontend generator ──
    async def run(self, ctx: AgentContext) -> AgentResult:
        language = ctx.language
        framework = ctx.framework

        # NEW: HTML/CSS/JS generation for frontend tasks
        if language.lower() == "html":
            return await self._generate_frontend(ctx)

        # ── Existing Python / other-language logic (unchanged) ──
        extension = LANGUAGE_EXTENSIONS.get(language, ".txt")
        src_dir = LANGUAGE_DIRS.get(language, "src")
        framework_hint = f" using {framework}" if framework else ""
        mcp_context = f"\n\nWorkspace context from MCP:\n{ctx.mcpContext}" if ctx.mcpContext else ""

        user_msg = (
            f"Task: {ctx.taskTitle}\n"
            f"Description: {ctx.taskDescription}"
            f"{mcp_context}"
        )

        result = await call_llm([
            LlmMessage(role="system", content=(
                f"You are an expert {language.title()} engineer{framework_hint}.\n"
                f"Project: {ctx.projectName}\n\n"
                "Respond with a JSON object with exactly one key:\n"
                '  "files": an array of objects, each with:\n'
                '    "filename": SHORT snake_case name WITHOUT extension and WITHOUT directory — max 2-3 words\n'
                '    "content": the complete implementation code as a string\n\n'
                f"- Write ONLY {language.title()} code.\n"
                f"- Use modern {language.title()} best practices{framework_hint}.\n"
                "- Include all necessary imports.\n"
                "- One file entry, focused on exactly what the task describes.\n"
                "- No markdown fences inside any content string."
            )),
            LlmMessage(role="user", content=user_msg),
        ], max_tokens=8192, json_mode=True)

        raw_name: str
        code: str
        try:
            parsed = json.loads(result.content)
            files = parsed.get("files") or []
            if files and isinstance(files, list):
                first = files[0]
                raw_name = str(first.get("filename") or ctx.taskTitle)
                code = str(first.get("content") or "")
            else:
                # Fallback: old schema {"filename", "code"} or bare content
                raw_name = str(parsed.get("filename") or ctx.taskTitle)
                code = str(parsed.get("code") or parsed.get("content") or result.content)
        except (json.JSONDecodeError, AttributeError, KeyError):
            # Retry once with a plain-text prompt — no json_mode
            retry = await call_llm([
                LlmMessage(role="system", content=(
                    f"You are an expert {language.title()} engineer{framework_hint}.\n"
                    f"Output ONLY the raw {language.title()} code. No explanation, no markdown fences."
                )),
                LlmMessage(role="user", content=user_msg),
            ], max_tokens=8192, json_mode=False)
            raw_name = ctx.taskTitle
            code = retry.content.strip()
            # Strip accidental markdown fences from retry
            if code.startswith("```"):
                lines = code.splitlines()
                code = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        base = _to_filename(raw_name[:40], language)
        filename = f"{src_dir}/{base}{extension}"

        return AgentResult(
            agentType=self.type,
            summary=f'Generated {language.title()} implementation for "{ctx.taskTitle}"',
            artifacts=[Artifact(type="code", filename=filename, content=code, language=language)],
            rawLlmOutput=result.content,
            tokensUsed=result.tokensUsed,
        )

    # ── STEP 5: Frontend generator method ──
    async def _generate_frontend(self, ctx: AgentContext) -> AgentResult:
        project_desc = f"{ctx.projectName} - {ctx.taskDescription}"

        result = await call_llm([
            LlmMessage(role="system", content=(
                "You are an expert frontend developer.\n"
                f"Project: {ctx.projectName}\n\n"
                "Generate a complete professional web application.\n"
                "Respond with JSON with exactly 2 keys: 'html', 'js'\n\n"
                "For 'html':\n"
                "- Must be a FULL HTML document starting with <!DOCTYPE html>\n"
                "- Include <style>/* ADW_CSS */</style> in the <head> — do NOT add any other CSS\n"
                "- Use this exact structure with these CSS classes:\n"
                "  <div class='app'>\n"
                "    <aside class='sidebar'>\n"
                "      <div class='sidebar-logo'>\n"
                "        <div class='sidebar-logo-icon'>EMOJI</div>\n"
                "        APP NAME\n"
                "      </div>\n"
                "      <div class='nav-item active'><span class='nav-icon'>EMOJI</span>Section 1</div>\n"
                "      <div class='nav-item'><span class='nav-icon'>EMOJI</span>Section 2</div>\n"
                "    </aside>\n"
                "    <div class='main'>\n"
                "      <div class='topbar'><div class='topbar-title'>PAGE TITLE</div></div>\n"
                "      <div class='content'>\n"
                "        <div class='stats-grid'>\n"
                "          <div class='stat-card'><div class='stat-icon'>EMOJI</div><div><div class='stat-value' id='stat1'>0</div><div class='stat-label'>Label</div></div></div>\n"
                "        </div>\n"
                "        <div class='content-grid'>\n"
                "          <div class='card'><div class='card-header'><div class='card-title'>Form Title</div></div>\n"
                "            <div class='form-group'><label class='form-label'>Field</label><input class='form-input' id='field1'></div>\n"
                "            <button class='btn btn-primary' onclick='handleSubmit()'>Submit</button>\n"
                "          </div>\n"
                "          <div class='card'><div class='card-header'><div class='card-title'>Data Title</div></div>\n"
                "            <div class='table-wrapper'><table><thead><tr><th>Col1</th><th>Actions</th></tr></thead><tbody id='tableBody'></tbody></table></div>\n"
                "          </div>\n"
                "        </div>\n"
                "      </div>\n"
                "    </div>\n"
                "  </div>\n"
                "  <div class='toast-container' id='toasts'></div>\n"
                "- Use ONLY the CSS classes listed above\n"
                "- NO inline styles, NO external stylesheets, NO <link> tags\n"
                "- NO <script> tags in html — JS will be injected separately\n\n"
                "For 'js':\n"
                "- Use localStorage for ALL data (no fetch calls)\n"
                "- Include showToast(msg, type) function\n"
                "- Include renderTable() function\n"
                "- Include handleSubmit() function\n"
                "- Auto-load data on DOMContentLoaded\n"
                "- Update stat counts dynamically\n"
                "- Use relevant emojis in sidebar and stats\n"
                "- All CRUD operations using localStorage\n"
            )),
            LlmMessage(role="user", content=(
                f"Task: {ctx.taskTitle}\n"
                f"Description: {ctx.taskDescription}"
            )),
        ], max_tokens=8192, json_mode=True)

        try:
            parsed = json.loads(result.content)
            html = str(parsed.get("html", ""))
            js = str(parsed.get("js", ""))
        except Exception:
            html = result.content
            js = ""

        # Strip markdown fences
        def strip_fences(s: str) -> str:
            s = s.strip()
            if s.startswith("```"):
                s = s.split("\n", 1)[1] if "\n" in s else s
            if s.endswith("```"):
                s = s.rsplit("```", 1)[0]
            return s.strip()

        html = strip_fences(html)
        js = strip_fences(js)

        # Replace CSS placeholder with real premium CSS
        full_html = html.replace("/* ADW_CSS */", get_premium_css(project_desc))

        # Inject JS inline before </body>
        if "</body>" in full_html:
            full_html = full_html.replace(
                "</body>",
                f"<script>\n{js}\n</script>\n{_get_toggle_script()}\n</body>"
            )
        else:
            full_html += f"\n<script>\n{js}\n</script>\n{_get_toggle_script()}"

        # Clean encoding
        full_html = full_html.encode("utf-8", errors="ignore").decode("utf-8").replace("\x00", "")

        return AgentResult(
            agentType=self.type,
            summary=f'Generated self-contained HTML frontend for "{ctx.taskTitle}"',
            artifacts=[
                Artifact(type="code", filename="index.html", content=full_html, language="html"),
            ],
            rawLlmOutput=result.content,
            tokensUsed=result.tokensUsed,
        )