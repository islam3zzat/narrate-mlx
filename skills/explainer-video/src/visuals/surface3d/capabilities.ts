import type {Capabilities} from '../capabilities';

// 3D only (requires top-level "mode": "3d"); English axis labels (drawn left to right).
export const capabilities = {modes: ['3d'], continues: false, focus: false, rtl: 'warn'} as const satisfies Capabilities;
