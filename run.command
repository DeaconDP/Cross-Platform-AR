#!/bin/bash
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js required."; read -r; exit 1; }
if [ ! -d node_modules ]; then
  echo "Installing..."
  npm install || { read -r; exit 1; }
fi
open "https://localhost:5188"
npm run dev
