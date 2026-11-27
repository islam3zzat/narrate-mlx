import type {Capabilities} from '../../sdk/pure';

// 2D only; focus targets step or item IDs; array indices always render left to right.
export const capabilities = {modes: ['2d'], continues: false, focus: '2d', rtl: 'warn'} as const satisfies Capabilities;
