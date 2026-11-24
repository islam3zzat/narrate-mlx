import type {Capabilities} from '../capabilities';

// 2D only; focus targets optional overlay ids; English layout (LTR plot).
export const capabilities = {modes: ['2d'], continues: false, focus: '2d', rtl: 'warn'} as const satisfies Capabilities;
