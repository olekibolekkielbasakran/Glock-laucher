@echo off
chcp 65001 >nul
title Glock-launcher
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Brak Node.js - zainstaluj go z https://nodejs.org
  pause
  exit /b 1
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo Pierwsze uruchomienie - instaluje zaleznosci...
  if exist package-lock.json (call npm ci --no-audit --no-fund) else (call npm install --no-audit --no-fund)
  if errorlevel 1 call npm install --no-audit --no-fund
  if not exist "node_modules\electron\dist\electron.exe" (
    echo Instalacja nie powiodla sie
    pause
    exit /b 1
  )
)
rem Uruchomienie bezposrednio (szybciej niz npm start, bez wiszacego okna konsoli)
start "" "node_modules\electron\dist\electron.exe" .
exit /b 0
