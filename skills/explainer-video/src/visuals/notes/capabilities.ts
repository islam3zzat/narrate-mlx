import type {Capabilities} from '../capabilities';

// 2D only, dialogue videos (English). Only the whiteboard layout continues a notes list (boardContinues): the leading items shared with the previous scene stay drawn.
export const capabilities = {modes: ['2d'], continues: false, focus: false, rtl: 'warn', boardContinues: true} as const satisfies Capabilities;
