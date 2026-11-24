import type {Capabilities} from '../capabilities';

// 2D only; focus names baseline, step, or total ids; waterfall progression runs left to right.
export const capabilities = {modes: ['2d'], continues: false, focus: '2d', rtl: 'warn'} as const satisfies Capabilities;
