#!/usr/bin/env bash
# Check that everything needed to run both skills is in place. Exit 1 if anything FAILs.
# SMOKE=1 also generates short test speeches (Kokoro; with the arabic feature also Arabic with SILMA).
set -u
. "$(dirname "$0")/lib.sh"
use_node_path
fails=0
chk() { # chk "label" command... ; FAIL if the command fails
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then ok "$label"; else bad "$label"; fails=$((fails+1)); fi
}

echo "Tools"
chk "uv ($(uv --version 2>/dev/null))" command -v uv
chk "node ($(node --version 2>/dev/null))" command -v node
chk "npm"     command -v npm
chk "ffmpeg"  command -v ffmpeg
chk "ffprobe" command -v ffprobe
if [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ] || [ -x "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" ] || [ -n "${EXPLAINER_BROWSER:-}" ]; then
  ok "Chrome/Edge for rendering"
else
  warn "no Chrome/Edge found; Remotion will download its own browser (can fail behind a proxy). Set EXPLAINER_BROWSER to override"
fi
[ "$(uname -m)" = arm64 ] && ok "Apple Silicon" || warn "not Apple Silicon: MLX models will not run"

echo; echo "Repo location"
espeak="$SPEAK_DIR/.venv/lib/python3.12/site-packages/espeakng_loader/espeak-ng-data"
len=${#espeak}
if [ "$len" -gt 150 ]; then
  warn "checkout path is long ($len chars to espeak data); speech failed at 198, worked at 112. Move the repo somewhere shorter"
else ok "path length ($len chars) is fine"; fi

echo; echo "speak"
if [ -x "$SPEAK_DIR/.venv/bin/python" ]; then
  ok "venv exists"
  chk "imports (mlx_audio, misaki, spacy model, pyobjc)" \
    uv run --no-sync --project "$SPEAK_DIR" python -c "import mlx_audio, misaki, spacy, en_core_web_sm, markdown_it, AVFoundation"
else bad "no venv: run make setup"; fails=$((fails+1)); fi
if [ "${SMOKE:-0}" = 1 ]; then
  out="$(mktemp -t narrate-doctor).wav"
  if echo "Narrate is working." | uv run --no-sync --project "$SPEAK_DIR" python "$SPEAK_DIR/speak.py" --out "$out" >/dev/null 2>&1 && [ -s "$out" ]; then
    ok "smoke test: generated speech"; else bad "smoke test: speech generation failed (run speak.py by hand to see why)"; fails=$((fails+1)); fi
  rm -f "$out"
else info "      (SMOKE=1 make doctor also generates a test speech)"; fi

echo; echo "speak (Arabic, SILMA)"
if feature_on arabic; then
  if [ -x "$SPEAK_DIR/silma/.venv/bin/python" ]; then
    ok "venv exists"
    chk "imports (silma_tts, nemo stub, onnxruntime)" \
      uv run --no-sync --project "$SPEAK_DIR/silma" python -c "import silma_tts, onnxruntime, nemo_text_processing.text_normalization.normalize"
  else bad "no venv in skills/speak/silma: run make setup"; fails=$((fails+1)); fi
  if [ "${SMOKE:-0}" = 1 ]; then
    out="$(mktemp -t narrate-doctor-ar).wav"
    if echo 'مَرْحَبًا بِكُمْ.' | uv run --no-sync --project "$SPEAK_DIR" python "$SPEAK_DIR/speak.py" --lang ar --out "$out" >/dev/null 2>&1 && [ -s "$out" ]; then
      ok "smoke test: generated Arabic speech"; else bad "smoke test: Arabic speech generation failed (run speak.py --lang ar by hand to see why)"; fails=$((fails+1)); fi
    rm -f "$out"
  fi
else
  info "      skipped (optional; add "arabic" to NARRATE_FEATURES to check it)"
fi

echo; echo "explainer-video"
if [ -x "$EXPLAINER_DIR/node_modules/.bin/remotion" ]; then ok "remotion installed"
else bad "node_modules missing: run make setup"; fails=$((fails+1)); fi
tmp="$(mktemp -d)"
chk "explainer.py runs (init + check)" bash -c "python3 '$EXPLAINER_DIR/explainer.py' init '$tmp' && python3 '$EXPLAINER_DIR/explainer.py' check '$tmp'"
rm -rf "$tmp"

echo; echo "Skill links"
linked=0
for d in $(all_dirs); do
  for s in $(skill_names); do
    dest="$d/$s"
    if [ -L "$dest" ]; then
      cur="$(readlink "$dest")"
      if [ "$cur" = "$ROOT/skills/$s" ] && [ -f "$dest/SKILL.md" ]; then ok "$dest"; linked=$((linked+1))
      elif [ ! -e "$dest" ]; then bad "$dest is BROKEN (-> $cur)"; fails=$((fails+1))
      else warn "$dest -> $cur (a different copy, not this repo)"; fi
    fi
  done
done
[ "$linked" -eq 0 ] && { warn "no skills linked yet: run make install"; }
for d in $(install_dirs); do for s in $(skill_names); do
  [ -L "$d/$s" ] || { [ -e "$d/$s" ] && warn "$d/$s is not a symlink" || warn "$d/$s missing (make install)"; }
done; done

echo; echo "Git hooks"
if [ "$(git -C "$ROOT" config --get core.hooksPath 2>/dev/null || true)" = "scripts/hooks" ]; then
  ok "git hooks (scripts/hooks)"
else
  info "      git hooks not installed (optional: run make install-hooks)"
fi

echo
if [ "$fails" -eq 0 ]; then ok "all good"; else bad "$fails problem(s)"; fi
exit $([ "$fails" -eq 0 ] && echo 0 || echo 1)
