import type {Capabilities} from '../capabilities';

export const capabilities = {modes: ['2d', '3d'], continues: false, focus: false, rtl: 'yes', headingStyle: 'badge'} as const satisfies Capabilities;
