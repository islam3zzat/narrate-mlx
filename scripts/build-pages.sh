#!/usr/bin/env bash
# Build the static Remotion Studio Visual Catalog for GitHub Pages.
# Bash 3.2 compatible (macOS default).
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/lib.sh"
use_node_path

PUBLIC_PATH="${PUBLIC_PATH:-/narrate-mlx/}"
trimmed="${PUBLIC_PATH#/}"
while [ "$trimmed" != "${trimmed#/}" ]; do trimmed="${trimmed#/}"; done
while [ "$trimmed" != "${trimmed%/}" ]; do trimmed="${trimmed%/}"; done
if [ -z "$trimmed" ]; then
  PUBLIC_PATH="/"
else
  PUBLIC_PATH="/${trimmed}/"
fi

OUT_DIR="${OUT_DIR:-$ROOT/out/pages}"

if [ ! -x "$EXPLAINER_DIR/node_modules/.bin/remotion" ]; then
  bad "missing $EXPLAINER_DIR/node_modules/.bin/remotion (run 'make setup' first)"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  bad "node not found on PATH (install Node.js or check ~/.nvm)"
  exit 1
fi

info "Building Visual Catalog bundle (PUBLIC_PATH=$PUBLIC_PATH -> $OUT_DIR)..."
node "$EXPLAINER_DIR/scripts/ensure-local-visuals.mjs"
(
  cd "$EXPLAINER_DIR" &&
    node_modules/.bin/remotion bundle src/catalog-index.ts \
      --public-dir=catalog-public \
      --public-path="$PUBLIC_PATH" \
      --out-dir="$OUT_DIR" < /dev/null
)

touch "$OUT_DIR/.nojekyll"

python3 - "$OUT_DIR/index.html" "$PUBLIC_PATH" <<'PY'
import json
import re
import sys
from pathlib import Path

html_path = Path(sys.argv[1])
public_path = sys.argv[2]
expected_static_base = f"{public_path.rstrip('/')}/public"

html = html_path.read_text(encoding="utf-8")

title_target = "<title>narrate-mlx — Visual Catalog</title>"
if "<title>Remotion Bundle</title>" in html:
    html = html.replace("<title>Remotion Bundle</title>", title_target, 1)
elif title_target not in html:
    raise SystemExit("unexpected <title> in generated index.html")

cwd_re = re.compile(r"window\.remotion_cwd\s*=\s*[^;]+;")
if not cwd_re.search(html):
    raise SystemExit("missing window.remotion_cwd in generated index.html")
html = cwd_re.sub('window.remotion_cwd = "/narrate-mlx";', html, count=1)

expected_pp = f"window.remotion_publicPath = {json.dumps(public_path)};"
if expected_pp not in html:
    raise SystemExit(f"expected {expected_pp!r} in generated index.html")

expected_sb = f'window.remotion_staticBase = "{expected_static_base}";'
if expected_sb not in html:
    raise SystemExit(f"expected {expected_sb!r} in generated index.html")

html_path.write_text(html, encoding="utf-8")
PY

for req in \
  "index.html" \
  "bundle.js" \
  "favicon.ico" \
  ".nojekyll" \
  "public/figures/catalog-sample.png" \
  "public/mermaid/catalog.svg"
do
  if [ ! -f "$OUT_DIR/$req" ]; then
    bad "missing expected output: $OUT_DIR/$req"
    exit 1
  fi
done

ok "built Visual Catalog static site in $OUT_DIR (PUBLIC_PATH=$PUBLIC_PATH)"
