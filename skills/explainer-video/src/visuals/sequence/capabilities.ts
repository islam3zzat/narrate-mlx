import type {Capabilities} from '../capabilities';

export const capabilities = {modes: ['2d', '3d'], continues: '2d', focus: 'both', rtl: 'yes'} as const satisfies Capabilities;
