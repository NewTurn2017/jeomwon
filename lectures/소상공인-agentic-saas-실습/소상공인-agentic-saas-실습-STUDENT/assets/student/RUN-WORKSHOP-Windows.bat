@echo off
setlocal

echo Jeomwon clean-room Windows path
echo.
echo This workshop installer supports macOS, Linux, and Windows through WSL2.
echo Open Ubuntu in WSL2, then follow RUNBOOK.md from "빈 workspace 만들기".
echo.
echo Claude Code:
echo   curl -fsSL https://claude.ai/install.sh ^| bash
echo.
echo Codex CLI:
echo   curl -fsSL https://chatgpt.com/codex/install.sh ^| sh
echo.
echo Jeomwon skill:
echo   curl -fsSL https://github.com/NewTurn2017/jeomwon/releases/download/v0.1.3/install.sh ^| bash -s -- --agent all
echo.
echo Native PowerShell installation is not part of this workshop release.
pause
endlocal
