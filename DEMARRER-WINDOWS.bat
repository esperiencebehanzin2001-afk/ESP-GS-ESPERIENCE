@echo off
title ESP-GS - Serveur central
echo Verification de Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo ============================================================
  echo  Node.js n'est pas installe sur cet ordinateur.
  echo  Installez-le d'abord depuis : https://nodejs.org
  echo  ^(choisissez la version "LTS"^), puis relancez ce fichier.
  echo ============================================================
  pause
  exit /b 1
)
node "%~dp0DEMARRAGE.js"
pause
