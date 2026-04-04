@echo off
setlocal enabledelayedexpansion

echo ========================================
echo  Autonomous Developer Workspace
echo ========================================
echo.

REM Check if .venv exists
if exist ".venv\" (
    echo [INFO] Virtual environment already exists
    echo [INFO] Skipping venv creation...
    goto :activate_venv
) else (
    echo [1/3] Creating virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment
        echo [ERROR] Make sure Python is installed
        pause
        exit /b 1
    )
    echo [SUCCESS] Virtual environment created
    echo.
    
    echo [2/3] Activating virtual environment...
    call .venv\Scripts\activate.bat
    
    echo [3/3] Installing Python dependencies...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
    echo [SUCCESS] Dependencies installed
    echo.
    goto :run_servers
)

:activate_venv
echo [INFO] Activating existing virtual environment...
call .venv\Scripts\activate.bat
echo.

:run_servers
echo ========================================
echo  Starting Servers
echo ========================================
echo.
echo [INFO] Opening Backend Server (Terminal 1)...
start "Backend Server" powershell -NoExit -Command "cd '%cd%'; .\.venv\Scripts\activate; python server.py"

timeout /t 2 /nobreak >nul

echo [INFO] Opening Frontend Server (Terminal 2)...
start "Frontend Server" powershell -NoExit -Command "cd '%cd%'; .\.venv\Scripts\activate; python frontend.py"

echo.
echo ========================================
echo  Servers Started Successfully!
echo ========================================
echo.
echo Backend:  http://localhost:4000
echo Frontend: http://localhost:3000
echo API Docs: http://localhost:4000/docs
echo.
echo Press any key to exit this window...
echo (Servers will continue running in separate windows)
pause >nul
