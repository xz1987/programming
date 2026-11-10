额额#!/bin/bash
# Double-click in Finder to start the Pathways Research Kit locally and open it in Chrome.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install it from https://nodejs.org and double-click this file again."
  read -r -p "Press Return to close."
  exit 1
fi
node server.mjs --open
