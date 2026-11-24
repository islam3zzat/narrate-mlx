#!/usr/bin/env bash
# Symlink every skill in skills/ into the agents' skill directories.
# SKILL_DIRS="a b" overrides the targets. FORCE=1 replaces links that point elsewhere.
set -u
. "$(dirname "$0")/lib.sh"
fail=0
for d in $(install_dirs); do
  mkdir -p "$d" || { bad "cannot create $d"; fail=1; continue; }
  for s in $(skill_names); do
    src="$ROOT/skills/$s"; dest="$d/$s"
    if [ -L "$dest" ]; then
      cur="$(readlink "$dest")"
      if [ "$cur" = "$src" ]; then ok "$dest (already linked)"; continue; fi
      if [ ! -e "$dest" ] || [ "${FORCE:-0}" = 1 ]; then ln -sfn "$src" "$dest"; ok "$dest -> $src (replaced $cur)"; continue; fi
      warn "$dest points to $cur; skipped (FORCE=1 to replace)"; fail=1
    elif [ -e "$dest" ]; then
      warn "$dest exists and is not a symlink; skipped"; fail=1
    else
      ln -s "$src" "$dest"; ok "$dest -> $src"
    fi
  done
done
exit $fail
