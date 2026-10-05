#!/usr/bin/env bash
# Everything CI runs, in one go. The desktop smoke test needs Linux with
# WebKitGTK, tauri-driver and Xvfb, so it only runs when they're present.
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

step "typecheck";   npm run typecheck
step "lint";        npm run lint
step "format";      npm run format:check
step "unit, UI and PDF tests"; npm test
step "production build"; npm run build
step "dependency audit"; npm audit --audit-level=moderate
step "end-to-end (Chromium${PW_BROWSERS:+, $PW_BROWSERS})"; npm run test:e2e

if command -v cargo >/dev/null; then
  step "rust: fmt, clippy"
  (cd src-tauri && cargo fmt --check && cargo clippy --locked -- -D warnings)
fi
if command -v tauri-driver >/dev/null && command -v xvfb-run >/dev/null; then
  step "desktop app smoke test (real WebKitGTK webview)"
  npx tauri build --debug --no-bundle
  xvfb-run -a node tests/desktop/smoke.mjs
fi
printf '\n\033[1;32mall checks passed\033[0m\n'
