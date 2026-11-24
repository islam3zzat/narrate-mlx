"""Feature-flag registry and script gating for explainer-video. Stdlib only."""
from __future__ import annotations

import json
import os
import re
import sys

from env import die

# Known feature flags. One line each: what it unlocks. All are off unless listed in $NARRATE_FEATURES or passed as --features,
# except the names in DEFAULT_ON_FEATURES, which are on unless switched off with a "-name" entry (e.g. --features=-transcripts).
FEATURES = {
    "svg": 'scenes of type "svg": drawings you author as strict SVG, parts revealed at the narration words, in the project theme (2D only)',
    "3d": 'scripts with "mode": "3d": every scene drawn in WebGL, plus the 3D-only layers3d and surface3d types',
    "transcripts": "`explainer.py transcript`: turn a WebVTT/SRT/Zoom meeting transcript into plain `[HH:MM:SS] Speaker: text` lines. On by default: --features=-transcripts or NARRATE_FEATURES=-transcripts turns it off",
    "arabic": "setup/doctor only: the SILMA environment for Arabic narration (does not gate scripts)",
}
DEFAULT_ON_FEATURES = frozenset({"transcripts"})
RETIRED_FEATURES = frozenset({"styles"})   # always on now: still accepted (no-op) so old --features / NARRATE_FEATURES keep working, with a warning


def feature_tokens() -> list[str]:
    return [f for f in re.split(r"[,\s]+", os.environ.get("NARRATE_FEATURES", "")) if f]


def _feature_name(token: str) -> str:
    return token[1:] if token.startswith("-") else token


def enabled_features() -> list[str]:
    """Defaults first, then $NARRATE_FEATURES in order: "name" turns on, "-name" turns off (the last mention wins)."""
    on = dict.fromkeys(sorted(DEFAULT_ON_FEATURES))
    for t in feature_tokens():
        if t.startswith("-"):
            on.pop(t[1:], None)
        else:
            on[t] = None
    return list(on)


def feature_on(name: str) -> bool:
    """Feature flags (see AGENTS.md): off unless in DEFAULT_ON_FEATURES or listed in $NARRATE_FEATURES; "-name" switches one off."""
    return name in enabled_features()


def apply_features_arg(arg: str | None) -> None:
    """--features a,-b adds to $NARRATE_FEATURES for this run (child processes inherit it). Unknown names are errors."""
    names = [f for f in re.split(r"[,\s]+", arg or "") if f]
    retired = [f for f in names + feature_tokens() if _feature_name(f) in RETIRED_FEATURES]
    if retired:
        print(f"warning: feature(s) {', '.join(sorted(set(_feature_name(f) for f in retired)))} no longer exist (always on); remove them from --features / NARRATE_FEATURES", file=sys.stderr)
    names = [f for f in names if _feature_name(f) not in RETIRED_FEATURES]
    bad = [f for f in names if _feature_name(f) not in FEATURES]
    if bad:
        die(f"unknown feature(s): {', '.join(bad)}. Known: {', '.join(FEATURES)} (prefix a name with - to switch it off)")
    if names:
        os.environ["NARRATE_FEATURES"] = ",".join(feature_tokens() + names)
    unknown = [f for f in feature_tokens() if _feature_name(f) not in FEATURES and _feature_name(f) not in RETIRED_FEATURES]
    if unknown:
        print(f"warning: unknown feature(s) in NARRATE_FEATURES: {', '.join(unknown)}", file=sys.stderr)


def cmd_features(as_json: bool, enabled: str | None = None) -> None:
    if enabled is not None:
        if enabled not in FEATURES:
            die(f"unknown feature: {enabled}. Known: {', '.join(FEATURES)}")
        sys.exit(0 if feature_on(enabled) else 1)
    if as_json:
        print(json.dumps({k: {"enabled": feature_on(k), "default": k in DEFAULT_ON_FEATURES, "description": d} for k, d in FEATURES.items()}, indent=2))
        return
    for k, d in FEATURES.items():
        print(f"{'on ' if feature_on(k) else 'off'}  {k:11} {'(default on) ' if k in DEFAULT_ON_FEATURES else ''}{d}")


def lang_of(script: dict) -> str:
    return script.get("language") or "en"


def feature_errors(vid: str, script: dict) -> list[str]:
    """Scripts that use a feature whose flag is off. Also run by render and still, because data from an earlier flagged run can exist."""
    errs: list[str] = []
    if script.get("mode") == "3d" and not feature_on("3d"):
        errs.append(f'{vid}: "mode": "3d" is behind a feature flag that is off (add --features 3d or set NARRATE_FEATURES=3d)')
    if not feature_on("svg"):
        for sc in script["scenes"]:
            if sc["visual"]["type"] == "svg":
                errs.append(f'{vid}/{sc["id"]}: "svg" visuals are behind a feature flag that is off (add --features svg or set NARRATE_FEATURES=svg)')
    return errs
