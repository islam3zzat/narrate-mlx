import type {Capabilities} from '../capabilities';

// 2D only; focus names curves by optional id (dims the others, no CSS camera zoom since stages control the plot viewport); English layout (LTR plot).
export const capabilities = {modes: ['2d'], continues: false, focus: '2d', rtl: 'warn'} as const satisfies Capabilities;
