@echo off
chcp 65001 >nul 2>&1
:: 停止 CodexPool
cd /d "%~dp0"
call setup.bat --stop
