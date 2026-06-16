@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist node_modules (
  echo [1/2] 首次运行，正在安装依赖，请稍候...
  call npm install
  if errorlevel 1 (
    echo 依赖安装失败，请确认已安装 Node.js: https://nodejs.org
    pause
    exit /b 1
  )
)

echo.
echo [2/2] 正在启动游戏服务器...
echo.
echo   浏览器会自动打开；若没有，请手动访问:
echo   http://localhost:5173
echo.
echo   注意: 不要双击 index.html，也不要用 Live Server 打开
echo   关闭本窗口即可停止游戏
echo.

call npm run dev

pause
