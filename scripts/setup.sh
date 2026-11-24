#!/usr/bin/env bash
# Install dependencies: the speak Python environments (uv; the Arabic one only with the arabic feature) and Remotion (npm ci).
set -u
. "$(dirname "$0")/lib.sh"
use_node_path
miss=0
command -v uv     >/dev/null || { bad "uv not found. brew install uv"; miss=1; }
command -v node   >/dev/null || { bad "node not found. Install Node.js (nvm or brew install node)"; miss=1; }
command -v npm    >/dev/null || { bad "npm not found"; miss=1; }
command -v ffprobe >/dev/null || { bad "ffmpeg/ffprobe not found. brew install ffmpeg"; miss=1; }
[ "$miss" -eq 1 ] && exit 1

echo "== speak: uv sync"
cd "$SPEAK_DIR" || exit 1
if ! uv sync; then
  warn "uv sync failed; retrying with system TLS certificates (needed behind TLS-inspecting proxies)"
  uv sync --system-certs || { bad "uv sync failed"; exit 1; }
fi

if feature_on arabic; then
  echo "== speak (Arabic, SILMA): uv sync"
  cd "$SPEAK_DIR/silma" || exit 1
  if ! uv sync; then
    warn "uv sync failed; retrying with system TLS certificates"
    uv sync --system-certs || { bad "uv sync (silma) failed"; exit 1; }
  fi
else
  info "skipping the Arabic environment (add "arabic" to NARRATE_FEATURES to install it)"
fi

echo "== explainer-video: npm ci"
cd "$EXPLAINER_DIR" || exit 1
npm ci || { bad "npm ci failed"; exit 1; }

echo
ok "setup done. Next: make install   (then: make doctor; optional: make install-hooks)"
