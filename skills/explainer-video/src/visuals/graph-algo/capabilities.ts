import type {Capabilities} from '../../sdk/pure';

// 2D only; focus targets step, node, or explicit edge IDs; graph coordinates are not mirrored in RTL.
export const capabilities = {modes: ['2d'], continues: false, focus: '2d', rtl: 'warn'} as const satisfies Capabilities;
