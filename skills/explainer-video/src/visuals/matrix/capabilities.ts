import type {Capabilities} from '../capabilities';

// 2D only; focus dims unfocused cells and lifts matching rows, cols, cells, or named highlight regions; LTR grid layout.
export const capabilities = {modes: ['2d'], continues: false, focus: '2d', rtl: 'warn'} as const satisfies Capabilities;
