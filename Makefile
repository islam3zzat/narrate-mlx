.DEFAULT_GOAL := help
SHELL := /bin/bash

help:
	@echo "narrate-mlx: speak + explainer-video skills"
	@echo
	@echo "  make setup      install dependencies (uv sync for speak, npm ci for explainer-video)"
	@echo "  make install    symlink the skills into ~/.claude/skills and ~/.agents/skills"
	@echo "  make uninstall  remove those symlinks (from every known agent skills dir)"
	@echo "  make doctor     check tools, environments, path length and skill links"
	@echo "  make catalog    open the interactive Visual Catalog in Remotion Studio"
	@echo "  make pages      build the static Remotion Studio Visual Catalog into out/pages"
	@echo "  make test-unit  run fast zero-Chrome checks (tsc, docs/schemas, Python + TS unit tests)"
	@echo "  make test       run make test-unit followed by diff-scoped golden compare"
	@echo
	@echo "  SKILL_DIRS=\"dir1 dir2\" make install   link into other directories (e.g. ~/.codex/skills)"
	@echo "  FORCE=1 make install                  replace links that point elsewhere"
	@echo "  SMOKE=1 make doctor                   also generate a short test speech"
	@echo "  NARRATE_FEATURES="arabic,3d" make ...  turn on feature flags (all off by default)"

setup:
	@scripts/setup.sh

install:
	@scripts/install.sh

uninstall:
	@scripts/uninstall.sh

doctor:
	@scripts/doctor.sh

EV := skills/explainer-video

# Launch the interactive Remotion Studio Visual Catalog across all visual types
catalog:
	cd $(EV) && python3 explainer.py catalog

# Build the static Remotion Studio Visual Catalog for GitHub Pages (PUBLIC_PATH=/narrate-mlx/ by default)
pages:
	@scripts/build-pages.sh

# Safety net for explainer-video refactors (see skills/explainer-video/tests/golden.py)
golden-audio: export NARRATE_FEATURES += 3d svg
golden-audio:
	cd $(EV) && HF_HUB_OFFLINE=1 python3 explainer.py audio tests/corpus

golden: export NARRATE_FEATURES += 3d svg
golden: golden-audio
	python3 $(EV)/tests/golden.py record

# regenerate what is derived from the visual types' meta: the visual-types section of SKILL.md and the JSON Schema
docs:
	cd $(EV) && node_modules/.bin/tsx src/cli.ts docs --write
	cd $(EV) && python3 explainer.py schema > schema/script.schema.json
	cd $(EV) && python3 explainer.py schema --style > schema/style.schema.json

test-unit: export NARRATE_FEATURES += 3d svg
test-unit:
	cd $(EV) && node_modules/.bin/tsc -p tsconfig.tests.json --noEmit
	cd $(EV) && node_modules/.bin/tsx src/cli.ts check-generated
	cd skills/speak && uv run --no-sync --project . python -m unittest discover -s . -p 'test_*.py'
	cd $(EV) && python3 ../../scripts/run_pytests.py
	cd $(EV) && node_modules/.bin/tsx --test tests/vectors/*.test.ts

test: export NARRATE_FEATURES += 3d svg
test: test-unit
	python3 scripts/golden_gate.py   # golden scope follows the diff against main (shared atoms: full); FULL=1 forces the full compare

# install repo-managed git hooks (pre-commit / pre-push)
install-hooks:
	git config core.hooksPath scripts/hooks
	@echo "Installed git hooks (core.hooksPath=scripts/hooks)"

# sequential 2D + 3D MP4 regression check: render svg & surface3d, verify frame-vs-still PSNR, check flicker
verify-seq: export NARRATE_FEATURES += 3d svg
verify-seq: export HF_HUB_OFFLINE ?= 1
verify-seq:
	cd $(EV) && python3 explainer.py render tests/corpus svg surface3d
	cd $(EV) && python3 explainer.py verify tests/corpus svg && python3 explainer.py verify tests/corpus surface3d
	cd $(EV) && python3 tests/flicker.py tests/corpus/out/svg.mp4

# render the svg corpus videos (several tabs) and check them for flicker (frames that differ from both neighbours)
flicker: export NARRATE_FEATURES += svg
flicker:
	cd $(EV) && python3 explainer.py render tests/corpus svg svg-ar && python3 tests/flicker.py tests/corpus/out/svg.mp4 tests/corpus/out/svg-ar.mp4

# fast loop while moving one visual type: make golden-type T=bullets (stills for that type only; data/check for all)
golden-type: export NARRATE_FEATURES += 3d svg
golden-type:
	python3 $(EV)/tests/golden.py compare --type $(T)

.PHONY: flicker docs golden-type help setup install uninstall doctor golden golden-audio test test-unit install-hooks verify-seq pages
