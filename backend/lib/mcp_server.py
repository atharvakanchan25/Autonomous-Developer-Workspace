"""MCP server for Autonomous Developer Workspace."""

from mcp.server.fastmcp import FastMCP
from backend.core.database import db
from backend.core.logger import logger

mcp = FastMCP(name="autonomous-developer-workspace")

@mcp.tool()
async def list_projects() -> list[dict]:
    """List all projects."""
    projects = list(db.collection("projects").stream())
    return [{"id": p.id, "name": p.to_dict().get("name")} for p in projects]