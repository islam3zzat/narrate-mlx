// Where the speaker tag sits on the whiteboard, as plain numbers: SpeakerTag.tsx lays it out from these and sdk/board-kit.ts keeps the
// heading clear of it. A pure leaf (no React), so the layout tests can prove the two never meet.

/** Whiteboard tag: pinned to the top end edge (right on the board), no wider than this in all (avatar and pill; the role is cut with an ellipsis first). */
export const BOARD_TAG_MAX_W = 600;
/** Board margin the tag keeps from the frame edge (the same as the content box). */
export const BOARD_TAG_EDGE = 110;
/** Clear space kept between the tag and the heading. */
export const BOARD_TAG_GAP = 40;
/** Widest a heading may be on a board that shows the tag, in px from the content box's left edge. */
export const boardHeadingMaxW = (contentW: number): number => contentW - BOARD_TAG_MAX_W - BOARD_TAG_GAP;
