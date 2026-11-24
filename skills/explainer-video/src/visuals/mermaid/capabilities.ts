import type {Capabilities} from '../capabilities';

export const capabilities = {modes: ['2d', '3d'], continues: false, focus: '2d', rtl: 'warn'} as const satisfies Capabilities;
