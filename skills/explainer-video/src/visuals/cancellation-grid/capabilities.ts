import type {Capabilities} from '../capabilities';

// 2D only; stages with `phase` act as the pointer (so focus is disabled); English layout (LTR diagram).
export const capabilities = {modes: ['2d'], continues: false, focus: false, rtl: 'warn'} as const satisfies Capabilities;
