@echo off
echo Setting up Python server...

cd /d %~dp0

if not exist ".venv" (
    python -m venv .venv
    echo Virtual environment created.
)

call .venv\Scripts\activate.bat

pip install -r requirements.txt

if not exist ".env" (
    copy .env.example .env
    echo .env created from .env.example — fill in your credentials before running.
    pause
    exit /b 1
)

python run.py
