@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ========================================
echo   Backup and push to GitHub - my-game
echo ========================================
echo.

REM ---------- 1. dependencies ----------
if not exist node_modules goto install_deps
echo [1/4] node_modules OK
goto step2
:install_deps
echo [1/4] npm install...
call npm install
if errorlevel 1 goto error
:step2

REM ---------- 2. build pages ----------
echo.
echo [2/4] npm run build:pages ...
call npm run build:pages
if errorlevel 1 goto error

if not exist pages-bundle.json goto missing_bundle

REM ---------- 3. commit ----------
echo.
echo [3/4] git commit ...
git add -A
git diff --cached --quiet
if errorlevel 1 goto do_commit
echo      no changes to commit
goto step4
:do_commit
for /f "tokens=1-3 delims=/ " %%a in ('echo %date%') do set COMMIT_DATE=%%a-%%b-%%c
set COMMIT_TIME=%time:~0,8%
git commit -m "auto backup %COMMIT_DATE% %COMMIT_TIME%"
if errorlevel 1 goto error
echo      commit created
:step4

REM ---------- 4. push ----------
echo.
echo [4/4] git push origin main ...
git push origin main
if errorlevel 1 goto push_failed
for /f %%h in ('git rev-parse --short HEAD') do set LAST_COMMIT=%%h
echo      push OK: %LAST_COMMIT%
echo      repo: https://github.com/sanjitasawayan-lab/my-game
goto done
:push_failed
echo.
echo   PUSH FAILED - code is only on this PC.
echo   Check network and GitHub login, then run this script again.
goto error

:missing_bundle
echo.
echo   ERROR: pages-bundle.json missing. Build failed.
goto error

:done
echo.
echo ========================================
echo   Done!
echo   Site: https://sanjitasawayan-lab.github.io/my-game/
echo ========================================
echo.
echo GitHub Settings - Pages: main branch, /docs folder
echo Wait 2-5 minutes, then press Ctrl+F5 in browser.
echo.
pause
exit /b 0

:error
echo.
echo ========================================
echo   Failed. See messages above.
echo   - GitHub login / network
echo   - npm and git installed
echo ========================================
echo.
pause
exit /b 1
