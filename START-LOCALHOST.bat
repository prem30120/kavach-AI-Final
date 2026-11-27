@echo off
title Kavach-AI Localhost Server
cd /d %~dp0
echo ============================================
echo   KAVACH-AI - Starting localhost server...
echo ============================================
where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js is not installed on this PC.
  echo Install the LTS version from https://nodejs.org , then run this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo First run: installing dependencies, please wait...
  call npm install
)
echo.
echo Server starting - your browser will open at http://localhost:5173
echo Keep this window open while you use the app. Close it to stop the server.
start "" http://localhost:5173
call npm run dev
pause
