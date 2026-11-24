# Shared helpers, sourced by the other scripts. Bash 3.2 compatible (macOS default).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
SPEAK_DIR="$ROOT/skills/speak"
EXPLAINER_DIR="$ROOT/skills/explainer-video"

# Directories where agents look for skills. install links into DEFAULT_DIRS
# (override with SKILL_DIRS="dir1 dir2"); uninstall and doctor look in all KNOWN_DIRS.
DEFAULT_DIRS="$HOME/.claude/skills $HOME/.agents/skills"
KNOWN_DIRS="$DEFAULT_DIRS $HOME/.codex/skills $HOME/.gemini/skills $HOME/.gemini/config/skills $HOME/.gemini/antigravity-cli/skills"

# Feature flags: NARRATE_FEATURES="arabic,3d" (comma or space separated).
# Delegates to explainer.py's FEATURES registry (defaults + -name negation); falls back to glob matching if python3 is absent.
feature_on() {
  if command -v python3 >/dev/null 2>&1 && [ -f "$EXPLAINER_DIR/explainer.py" ]; then
    python3 "$EXPLAINER_DIR/explainer.py" features --enabled "$1" >/dev/null
    return $?
  fi
  case ",$(echo "${NARRATE_FEATURES:-}" | tr ' ' ',')," in *",$1,"*) return 0;; *) return 1;; esac
}

skill_names() { for f in "$ROOT"/skills/*/SKILL.md; do basename "$(dirname "$f")"; done; }
install_dirs() { echo "${SKILL_DIRS:-$DEFAULT_DIRS}"; }
all_dirs()     { echo "$KNOWN_DIRS ${SKILL_DIRS:-}"; }

if [ -t 1 ]; then G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; D=$'\033[2m'; N=$'\033[0m'; else G=; Y=; R=; D=; N=; fi
ok()   { printf '%s ok %s   %s\n'   "$G" "$N" "$*"; }
warn() { printf '%swarn%s   %s\n'   "$Y" "$N" "$*"; }
bad()  { printf '%sFAIL%s   %s\n'   "$R" "$N" "$*"; }
info() { printf '%s%s%s\n' "$D" "$*" "$N"; }

# A real node: on PATH, else the newest nvm install (node/npm are lazy shell
# functions in interactive zsh here, which scripts and make cannot see).
find_node() {
  if command -v node >/dev/null 2>&1 && [ -x "$(command -v node)" ]; then command -v node; return; fi
  ls -d "$HOME"/.nvm/versions/node/v*/bin/node 2>/dev/null | sort -V | tail -1
}
use_node_path() { local n; n="$(find_node)"; [ -n "$n" ] && PATH="$(dirname "$n"):$PATH"; export PATH; }
