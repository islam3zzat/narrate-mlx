// Lazy-loaded 3D host for SceneChrome.tsx so pure 2D videos never eagerly load Three.js or @react-three/fiber.
import React from 'react';
import {BandProvider} from './common';
import {Scene3D} from './Scene3D';
import {at} from '../kit2d';
import {useTheme} from '../theme';
import {headingStyleOf} from '../visuals/capabilities';
import type {ChromeScene} from '../SceneChrome';

export type Scene3DHostProps = {
  scene: ChromeScene;
  frame: number;
  audioFrames: number;
  rtl: boolean;
};

const Scene3DHost: React.FC<Scene3DHostProps> = ({scene, frame, audioFrames, rtl}) => {
  const {FONT, MONO} = useTheme();
  return (
    <BandProvider
      heading={'heading' in scene.visual ? scene.visual.heading : undefined}
      // badge headings (e.g. callout) are small mono labels in the overlay, measured at that size
      headingFont={headingStyleOf(scene.visual.type) === 'badge' ? `700 32px ${MONO}` : `700 68px ${FONT}`}
      caption={'caption' in scene.visual ? scene.visual.caption : undefined}
    >
      <Scene3D
        visual={scene.visual}
        frame={frame}
        frames={scene.frames}
        rtl={rtl}
        focus={scene.focusSec}
        lead={scene.leadFrames}
        rendered={scene.mermaidRendered}
        at={(i, n) => at(i, n, scene.leadFrames, audioFrames, scene.revealSec)}
      />
    </BandProvider>
  );
};

export default Scene3DHost;
