"""
Orchestrator package — hybrid LangGraph + Microsoft-style + AGNTCY architecture.

Modules:
  orchestrator_core   — session management, project runner, retry logic
  planner_agent       — v2 LLM planner: goal → structured task plan
  agent_registry      — AGNTCY-style capability registry & discovery
  sandbox             — Docker execution sandbox (run tests, build, commands)
  git_integration     — GitHub commit + PR creation
  memory              — vector + graph + state memory layer
"""
