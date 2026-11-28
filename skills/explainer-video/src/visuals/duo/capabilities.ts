import type {Capabilities} from '../capabilities';

// 2D only, dialogue videos (English; the board is English only). No continues: a duo is a one-off picture.
export const capabilities = {modes: ['2d'], continues: false, focus: false, rtl: 'warn', needsSpeakers: true} as const satisfies Capabilities;
