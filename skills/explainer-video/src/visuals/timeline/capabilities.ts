import type {Capabilities} from '../capabilities';

// 2D only; focus names events by their optional id (dims the others, no camera); mirrored in Arabic
export const capabilities = {modes: ['2d'], continues: false, focus: '2d', rtl: 'yes'} as const satisfies Capabilities;
