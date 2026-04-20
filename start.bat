@echo off
chcp 65001 >nul 2>&1
:: 快速启动 CodexPool（日常使用，双击即可）
cd /d "%~dp0"
call setup.bat --start
