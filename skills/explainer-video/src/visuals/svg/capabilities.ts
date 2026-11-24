import type {Capabilities} from '../capabilities';

// 2D only; focus names the parts (their ids); the geometry is drawn as written, not mirrored in Arabic (lint says so)
export const capabilities = {modes: ['2d'], continues: false, focus: '2d', rtl: 'warn'} as const satisfies Capabilities;
