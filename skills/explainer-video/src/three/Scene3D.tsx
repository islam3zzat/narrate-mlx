// Dispatches a scene's visual to its 3D view (src/visuals/<type>/View3D.tsx, looked up in visuals/views.tsx). Each draws a full-frame canvas;
// the 2D overlay on top keeps the heading, caption, top bar and captions (SceneBody with textOnly).
import React from 'react';
import type {Visual} from '../types';
import type {Visual3DProps} from './common';
import {viewsOf} from '../visuals/views';

export const Scene3D: React.FC<Visual3DProps<Visual>> = (props) => {
  const {visual: v} = props;
  const p = props as Visual3DProps<any>;
  const View3D = viewsOf(v).View3D;
  return View3D ? <View3D {...p} /> : null;
};
