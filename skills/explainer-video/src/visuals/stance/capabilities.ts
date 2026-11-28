import type {Capabilities} from '../capabilities';

// 2D only, dialogue videos (English). Only the whiteboard layout continues a stance map (boardContinues): the leading question and entries shared with the previous scene stay drawn.
export const capabilities = {modes: ['2d'], continues: false, focus: false, rtl: 'warn', needsSpeakers: true, boardContinues: true} as const satisfies Capabilities;
