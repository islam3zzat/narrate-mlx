import type {Capabilities} from '../capabilities';

// 2D only; focus names stats by their optional id (dims the others, no camera); English only: drawn left to right, not mirrored (the lint says so)
export const capabilities = {modes: ['2d'], continues: false, focus: '2d', rtl: 'warn'} as const satisfies Capabilities;
