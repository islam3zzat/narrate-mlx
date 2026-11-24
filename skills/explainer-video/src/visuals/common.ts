// Helpers shared by the per-type zod schemas (src/visuals/<type>/schema.ts). Pure: zod only.
import {z} from 'zod';

export const text = (what: string) => z.string().trim().min(1).describe(what);

export const GRAPH_TONES = ['neutral', 'primary', 'secondary', 'accent', 'danger'] as const;

export const ID = z.string().regex(/^[A-Za-z0-9_-]+$/, 'id must match [A-Za-z0-9_-]+');
