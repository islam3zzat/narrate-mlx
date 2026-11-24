#!/usr/bin/env python3
"""Flicker check for a rendered video: a frame that differs from both neighbours while they are nearly identical (A,B,A).
Some bugs only show in a full multi-tab render, never in stills or a single-tab render (the svg group-opacity one did).

  flicker.py video.mp4 [...]      exit 1 and print the frame numbers if any video flickers
"""
import subprocess, sys

W, H = 96, 54


def flicker(path: str) -> list[int]:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", f"scale={W}:{H},format=gray", "-f", "rawvideo", "-"],
                         capture_output=True, check=True).stdout
    n = W * H
    fr = [raw[i * n:(i + 1) * n] for i in range(len(raw) // n)]
    d = lambda a, b: sum(abs(x - y) for x, y in zip(a, b)) / n
    return [i for i in range(1, len(fr) - 1)
            if d(fr[i - 1], fr[i]) > 1.5 and d(fr[i], fr[i + 1]) > 1.5 and d(fr[i - 1], fr[i + 1]) < 0.8]


if __name__ == "__main__":
    bad = 0
    for p in sys.argv[1:]:
        f = flicker(p)
        print(f"{p}: {'ok' if not f else 'FLICKER at frames ' + str(f)}")
        bad += bool(f)
    sys.exit(1 if bad else 0)
