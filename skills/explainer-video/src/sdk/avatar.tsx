// The speaker avatar of dialogue videos (podcast style): a faceless hand-drawn bust, filled with the speaker's accent (the
// same accents[index % 2] as the name pill), with their initial on a chest badge. A pure function of its props (the wobble is
// seeded from the speaker index), so it draws identically in every frame and every render. Geometry: sdk/avatar-geom.ts.
import React from 'react';
import {mixHex, useTheme} from '../theme';
import {HAND} from './annotate';
import {AVATAR_BOX, AVATAR_PX, avatarGeom, speakerInitial, type AvatarSize} from './avatar-geom';

/** `px` overrides the size's pixel width (the duo figures are large). `fade` (0..1) pulls every colour toward the background, solid, not transparent: a dimmed speaker. */
export const Avatar: React.FC<{index: number; name: string; size?: AvatarSize; px?: number; fade?: number}> = ({index, name, size = 'md', px: pxOver, fade = 0}) => {
  const {C, BORDER, accents} = useTheme();
  const g = React.useMemo(() => avatarGeom(index), [index]);
  const px = pxOver ?? AVATAR_PX[size];
  const dim = (c: string) => (fade > 0 ? mixHex(c, C.bg, fade) : c);
  const fill = dim(accents[index % 2]), ink = dim(C.ink);
  const line = {stroke: ink, strokeWidth: Math.max(2, BORDER - 1) + (px > 120 ? 2 : 0), strokeLinejoin: 'round' as const, vectorEffect: 'non-scaling-stroke' as const};
  return (
    <svg width={px} height={px} viewBox={`0 0 ${AVATAR_BOX} ${AVATAR_BOX}`} style={{flex: 'none', display: 'block', overflow: 'visible'}} aria-hidden>
      <path d={g.shoulders} fill={fill} {...line} />
      <path d={g.head} fill={fill} {...line} />
      <circle cx={g.badge.cx} cy={g.badge.cy} r={g.badge.r} fill={C.bg} {...line} />
      <text x={g.badge.cx} y={g.badge.cy} textAnchor="middle" dominantBaseline="central" fontFamily={HAND} fontWeight={700} fontSize={g.badge.font} fill={ink}>
        {speakerInitial(name)}
      </text>
    </svg>
  );
};
