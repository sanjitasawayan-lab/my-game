@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "FAIL_CODE="

echo ========================================
echo   Backup and push to GitHub - my-game
echo ========================================
echo.

if not exist node_modules goto install_deps
echo [1/4] deps OK
goto step2
:install_deps
echo [1/4] npm install ...
call npm install
if errorlevel 1 goto err_npm
:step2

echo.
echo [2/4] npm run build:pages ...
call npm run build:pages
if errorlevel 1 goto err_build

if not exist pages-bundle.json goto err_bundle

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
if errorlevel 1 goto err_commit
echo      commit created
:step4

echo.
echo [4/4] git push origin main ...
set PUSH_TRY=0
:push_retry
set /a PUSH_TRY+=1
echo      attempt %PUSH_TRY%/3 ...
git push origin main
if not errorlevel 1 goto push_ok
if %PUSH_TRY% geq 3 goto err_push
echo      network error, wait 10s ...
timeout /t 10 /nobreak >nul
goto push_retry

:push_ok
for /f %%h in ('git rev-parse --short HEAD') do set LAST_COMMIT=%%h
goto done

:err_npm
set "FAIL_CODE=1"
goto show_fail

:err_build
set "FAIL_CODE=2"
goto show_fail

:err_bundle
set "FAIL_CODE=3"
goto show_fail

:err_commit
set "FAIL_CODE=4"
goto show_fail

:err_push
set "FAIL_CODE=5"
goto show_fail

:done
echo.
echo ========================================
echo   DONE - Backup OK
echo ========================================
echo   commit: %LAST_COMMIT%
echo   repo:   https://github.com/sanjitasawayan-lab/my-game
echo   site:   https://sanjitasawayan-lab.github.io/my-game/
echo.
echo   Pages setting: main branch, /docs folder
echo   Wait 2-5 min, then press Ctrl+F5 in browser.
echo ========================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\backup-msg.ps1" ok
echo.
pause
exit /b 0

:show_fail
echo.
echo ========================================
echo   FAILED - Backup error
echo ========================================
if "%FAIL_CODE%"=="1" echo   Reason: npm install failed. Check network and Node.js.
if "%FAIL_CODE%"=="2" echo   Reason: build:pages failed. See errors above.
if "%FAIL_CODE%"=="3" echo   Reason: pages-bundle.json missing after build.
if "%FAIL_CODE%"=="4" echo   Reason: git commit failed. Check git user.name and user.email.
if "%FAIL_CODE%"=="5" echo   Reason: git push failed 3 times. Try hotspot or VPN.
if not defined FAIL_CODE echo   Reason: unknown error. See messages above.
echo ========================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\backup-msg.ps1" fail %FAIL_CODE%
echo.
pause
exit /b 1
