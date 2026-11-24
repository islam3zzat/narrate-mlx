#!/usr/bin/env python3
"""Discover and run unittest `test_*.py` modules in parallel across processes for fast `make test-unit` feedback."""
from __future__ import annotations

import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    mods = sorted(p.stem for p in root.glob("test_*.py"))
    if not mods:
        sys.exit(f"no test_*.py modules found in {root}")
    workers = max(1, min(int(os.environ.get("PYTEST_JOBS", "6")), len(mods)))

    def run(mod: str):
        t0 = time.monotonic()
        r = subprocess.run([sys.executable, "-m", "unittest", mod], cwd=root, capture_output=True, text=True)
        return mod, r.returncode, time.monotonic() - t0, r.stdout, r.stderr

    t_all = time.monotonic()
    with ThreadPoolExecutor(workers) as ex:
        results = list(ex.map(run, mods))
    wall = time.monotonic() - t_all
    bad = [r for r in results if r[1] != 0]
    for mod, rc, dt, out, err in bad:
        sys.stderr.write(f"\n=== FAIL {mod} (rc={rc}, {dt:.2f}s) ===\n{out}{err}")
    total_tests = 0
    for _, _, _, _, err in results:
        for line in err.splitlines():
            if line.startswith("Ran ") and " test" in line:
                try:
                    total_tests += int(line.split()[1])
                except ValueError:
                    pass
    if bad:
        print(f"python unit tests FAILED: {len(bad)}/{len(mods)} modules failed in {wall:.2f}s", file=sys.stderr)
        return 1
    print(f"Ran {total_tests} tests across {len(mods)} modules in {wall:.2f}s (parallel={workers}) OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
