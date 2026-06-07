@echo off
title AI小说创作系统
color 0A
cd /d "%~dp0"
echo ========================================
echo   AI小说创作系统 - 启动器
echo ========================================
echo.
echo 正在启动服务...
echo.
npm run dev
pause
