// The valid Kokoro English voices: skills/speak/voices.json, the single list speak.py and validation.py read too.
// Node only (reads from disk). The speak skill is ../speak next to this one, or $EXPLAINER_TTS_DIR (as in env.py).
import fs from 'node:fs';
import path from 'node:path';

const speakDirs = (): string[] => [process.env.EXPLAINER_TTS_DIR, path.join(__dirname, '..', '..', 'speak')].filter((d): d is string => !!d);

let cached: readonly string[] | undefined;

/** The English voice names, in file order. Throws when the speak skill (or its voices.json) cannot be found or read. */
export const englishVoices = (): readonly string[] => {
  if (cached) return cached;
  for (const dir of speakDirs()) {
    const file = path.join(path.resolve(dir), 'voices.json');
    if (!fs.existsSync(path.join(path.resolve(dir), 'speak.py'))) continue;
    const list: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(list) || !list.length || !list.every((v) => typeof v === 'string')) throw new Error(`${file}: expected a non-empty JSON array of voice names`);
    return (cached = list as string[]);
  }
  throw new Error(`speak skill not found (looked in ${speakDirs().join(', ')}); set EXPLAINER_TTS_DIR to the folder containing speak.py`);
};
