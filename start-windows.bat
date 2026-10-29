@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Wave Records
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js не знайдено. Встановіть версію LTS з https://nodejs.org і запустіть цей файл ще раз.
  echo.
  pause
  exit /b 1
)
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"
node --disable-warning=ExperimentalWarning server.js
echo.
echo Сайт зупинено.
pause
