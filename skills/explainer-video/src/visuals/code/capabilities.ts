import type {Capabilities} from '../capabilities';

// 2D only, no focus (the highlights are the pointer), no continues; mirrored in Arabic (heading, caption and tag; the code stays left to right)
export const capabilities = {modes: ['2d'], continues: false, focus: false, rtl: 'yes'} as const satisfies Capabilities;
