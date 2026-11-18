#!/usr/bin/env bash
# start na Linuksie (odpowiednik START.bat)
cd "$(dirname "$(readlink -f "$0")")" || exit 1
pause() { read -r -p "Enter, aby zamknąć..." _; }

if ! command -v node >/dev/null 2>&1; then
  echo "Brak Node.js - zainstaluj go (np. sudo apt install nodejs npm, albo https://nodejs.org)"
  pause; exit 1
fi

if [ ! -x node_modules/electron/dist/electron ]; then
  echo "Pierwsze uruchomienie - instaluję zależności..."
  if [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund || npm install --no-audit --no-fund
  else
    npm install --no-audit --no-fund
  fi
  if [ ! -x node_modules/electron/dist/electron ]; then echo "Instalacja nie powiodła się."; pause; exit 1; fi
fi

# --no-sandbox: electron z npm nie ma SUID na chrome-sandbox, a Ubuntu 24.04+ blokuje
# user namespaces (AppArmor), bez tej flagi okno się nie otworzy.
# Wayland wykrywa sam, X11 wymusisz: GLOCK_X11=1 ./START.sh
node_modules/electron/dist/electron . --no-sandbox "$@"
code=$?
if [ $code -ne 0 ]; then echo "Launcher zakończył się błędem (kod $code)."; pause; fi
