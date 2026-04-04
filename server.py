#!/usr/bin/env python3
"""
Backend Server Entry Point
Run: python server.py
"""
import uvicorn
import sys
from pathlib import Path

# Add project root to Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

if __name__ == "__main__":
    print("=" * 50)
    print("  Starting Backend Server")
    print("=" * 50)
    print(f"Project root: {project_root}")
    print("Server: http://0.0.0.0:4000")
    print("API Docs: http://localhost:4000/docs")
    print("=" * 50)
    
    uvicorn.run(
        "backend.main:socket_app",
        host="0.0.0.0",
        port=4000,
        reload=True,
        log_level="info",
    )
