// 2D view of `field2d`: dispatches between scalar contour mode and animated vector-field mode.
import React from 'react';
import {useTheme} from '../../theme';
import {Heading, prog} from '../../kit2d';
import {useFocus} from '../../focus';
import type {View2DProps} from '../props';
import {ScalarView} from './ScalarView';
import {VectorView} from './VectorView';

export const View2D: React.FC<View2DProps<'field2d'>> = ({visual: v, frame, lead, audioFrames, reveal, focus}) => {
  const {C} = useTheme();
  const focusNow = useFocus(focus, lead);
  const boxH = v.caption ? 542 : 590;

  return (
    <div>
      <Heading text={v.heading} />
      {v.mode === 'scalar' ? (
        <ScalarView visual={v} frame={frame} lead={lead} audioFrames={audioFrames} reveal={reveal} focusNow={focusNow} boxH={boxH} />
      ) : (
        <VectorView visual={v} frame={frame} lead={lead} audioFrames={audioFrames} reveal={reveal} focusNow={focusNow} boxH={boxH} />
      )}
      {v.caption && (
        <div style={{fontSize: 30, color: C.dim, textAlign: 'center', marginTop: 10, opacity: prog(frame, 2, 10)}}>
          {v.caption}
        </div>
      )}
    </div>
  );
};
