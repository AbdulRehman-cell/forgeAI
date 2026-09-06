#!/bin/bash
ROOT="$(pwd)"
DIST="$ROOT/forge-ai/frontend/dist"
mkdir -p "$DIST"

cd "$ROOT/forge-ai"
if ! npm install 2>&1 | tee "$DIST/index.html"; then
  echo "npm install FAILED" >> "$DIST/index.html"
  exit 0
fi

cd "$ROOT/forge-ai/frontend"
if ! npm run build 2>&1 | tee -a "$DIST/index.html"; then
  echo "npm run build FAILED" >> "$DIST/index.html"
  exit 0
fi
