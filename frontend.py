#!/usr/bin/env python3
"""
Frontend Server Entry Point
Run: python frontend.py
"""
import subprocess
import sys
import os
from pathlib import Path

if __name__ == "__main__":
    frontend_dir = Path(__file__).parent / "frontend"
    
    print("=" * 50)
    print("  Starting Frontend Server")
    print("=" * 50)
    print(f"Frontend directory: {frontend_dir}")
    print("Running: npm run dev")
    print("=" * 50)
    
    # Try to find npm in common locations
    npm_paths = [
        "npm",
        "npm.cmd",
        r"C:\Program Files\nodejs\npm.cmd",
        r"C:\Program Files (x86)\nodejs\npm.cmd",
        os.path.expanduser(r"~\AppData\Roaming\npm\npm.cmd"),
    ]
    
    npm_cmd = None
    for npm_path in npm_paths:
        try:
            subprocess.run(
                [npm_path, "--version"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=True
            )
            npm_cmd = npm_path
            break
        except (subprocess.CalledProcessError, FileNotFoundError):
            continue
    
    if not npm_cmd:
        print("\n" + "=" * 50)
        print("ERROR: npm not found!")
        print("=" * 50)
        print("\nPlease install Node.js from: https://nodejs.org/")
        print("\nOr run manually:")
        print(f"  cd {frontend_dir}")
        print("  npm run dev")
        print("=" * 50)
        sys.exit(1)
    
    try:
        subprocess.run(
            [npm_cmd, "run", "dev"],
            cwd=frontend_dir,
            check=True
        )
    except subprocess.CalledProcessError as e:
        print(f"\nError: Frontend failed to start - {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n\nFrontend server stopped.")
        sys.exit(0)
