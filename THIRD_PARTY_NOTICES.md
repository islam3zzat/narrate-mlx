# Third-Party Notices

This repository's own source code and documentation are licensed under the [MIT License](LICENSE). Third-party software, fonts, and runtime models used or bundled by `narrate-mlx` are subject to their respective licenses:

## Remotion (`remotion`, `@remotion/*` 4.0.290)

- **License:** [Remotion License](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)
- **Notes:** Remotion is free for individuals and companies with up to 3 employees; larger organizations require a commercial Remotion license to render or host Remotion-based builds (including the Visual Catalog).

## Bundled Fonts (SIL Open Font License 1.1)

The font files under `skills/explainer-video/src/fonts/` are licensed under the SIL Open Font License, Version 1.1. The full OFL 1.1 license texts are bundled alongside the font files in `skills/explainer-video/src/fonts/OFL.txt` and `skills/explainer-video/src/fonts/OFL-Cairo.txt`.

- **Space Grotesk** (`SpaceGrotesk.ttf`) — Copyright 2020 The Space Grotesk Project Authors (`https://github.com/floriankarsten/space-grotesk`)
- **Space Mono** (`SpaceMono-Regular.ttf`, `SpaceMono-Bold.ttf`) — Copyright 2016 The Space Mono Project Authors (`https://github.com/googlefonts/spacemono`)
- **Cairo** (`Cairo.ttf`) — Copyright 2009 The Cairo Project Authors (`https://github.com/Gue3bara/Cairo`)

## Models Downloaded on Demand

These models are not bundled in this repository and are downloaded at runtime from Hugging Face / upstream packages when used:

- **Kokoro-82M** (`mlx-community/Kokoro-82M-bf16`) — Apache-2.0
- **SILMA TTS v1** (`silma-tts`) — Apache-2.0
- **Qwen3-ForcedAligner-0.6B** (`mlx-community/Qwen3-ForcedAligner-0.6B-8bit`) — Apache-2.0
