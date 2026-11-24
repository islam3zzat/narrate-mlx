import type {Capabilities} from '../capabilities';

// 2D only; focus highlights series or scatter points by optional id (dims unfocused items); LTR chart layout.
export const capabilities = {modes: ['2d'], continues: false, focus: '2d', rtl: 'warn'} as const satisfies Capabilities;
