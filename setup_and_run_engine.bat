@echo off
title EditFlow 1-Click Auto Engine Bootstrapper
echo ===================================================
echo   EditFlow 1-Click Auto Engine Bootstrapper
echo ===================================================
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0engine\auto_installer.ps1"

echo.
echo [1/2] Memasang dependensi Python (FastAPI, Uvicorn, yt-dlp)...
cd /d "%~dp0engine"
python -m pip install -r requirements.txt

echo.
echo [2/2] Mengaktifkan EditFlow Python Local Engine (127.0.0.1:8000)...
python main.py

pause
