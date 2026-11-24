import type {Capabilities} from '../capabilities';

// 2D only; focus targets callout region IDs; normalized image coordinates are LTR.
export const capabilities = {modes: ['2d'], continues: false, focus: '2d', rtl: 'warn'} as const satisfies Capabilities;
