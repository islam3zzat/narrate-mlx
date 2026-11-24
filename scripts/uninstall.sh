#!/usr/bin/env bash
# Remove the skill symlinks that point into this repo, from every known agent skills
# directory (and SKILL_DIRS). Never touches anything that isn't a link to this repo.
set -u
. "$(dirname "$0")/lib.sh"
n=0
for d in $(all_dirs); do
  for s in $(skill_names); do
    dest="$d/$s"
    if [ -L "$dest" ] && [ "$(readlink "$dest")" = "$ROOT/skills/$s" ]; then rm "$dest"; ok "removed $dest"; n=$((n+1)); fi
  done
done
[ "$n" -eq 0 ] && info "nothing to remove"
exit 0
