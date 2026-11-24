import React from 'react';
import {Composition, staticFile} from 'remotion';
import constants from './constants.json';
import {Explainer} from './Explainer';
import type {VideoData} from './types';


type Props = {videoId: string; video: VideoData | null; frameMap?: number[]};

// One composition for every video. `explainer.py` passes {videoId} and the data
// (scenes, audio durations) is loaded from <workdir>/public/data/<videoId>.json.
export const RemotionRoot: React.FC = () => (
  <Composition
    id="Explainer"
    component={Explainer}
    durationInFrames={constants.fps}
    fps={constants.fps}
    width={1920}
    height={1080}
    defaultProps={{videoId: '', video: null} as Props}
    calculateMetadata={async ({props}) => {
      if (!props.videoId) return {};
      const res = await fetch(staticFile(`data/${props.videoId}.json`));
      if (!res.ok) throw new Error(`No data for video "${props.videoId}". Run: explainer.py audio <workdir>`);
      const video = (await res.json()) as VideoData;
      return {durationInFrames: video.totalFrames, fps: video.fps, props: {...props, video}};
    }}
  />
);
