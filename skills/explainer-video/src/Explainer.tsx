import React from 'react';
import {AbsoluteFill, Audio, Freeze, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {slide} from '@remotion/transitions/slide';
import constants from './constants.json';
import {ThemeContext, getTheme, useFontGate} from './theme';
import type {Scene, VideoData} from './types';
import {RtlContext, useRtl} from './rtl';
import {ChromeBackdrop, SceneChrome} from './SceneChrome';
import {ChapterCard} from './ChapterCard';
import {WhiteboardExplainer} from './whiteboard/Whiteboard';
import {resolveLayout} from './whiteboard/eligible';

const SceneView: React.FC<{scene: Scene; title: string; index: number; count: number; prev?: Scene; nextContinues: boolean; mode3d: boolean}> = ({scene, title, index, count, prev, nextContinues, mode3d}) => {
  const frame = useCurrentFrame();
  const audioFrames = Math.round(scene.durationSec * constants.fps);
  return (
    <SceneChrome
      scene={scene}
      title={title}
      index={index}
      count={count}
      prev={prev?.visual}
      fadeIn={!prev}
      fadeOut={!nextContinues}
      mode3d={mode3d}
      frame={frame}
      audioFrames={audioFrames}
    >
      <Sequence from={scene.leadFrames}>
        <Audio src={staticFile(scene.audio)} />
      </Sequence>
    </SceneChrome>
  );
};

const FrameMapper: React.FC<{frameMap: number[]; children: React.ReactNode}> = ({frameMap, children}) => {
  const f = useCurrentFrame();
  return <Freeze frame={frameMap[f] ?? 0}>{children}</Freeze>;
};

export const Explainer: React.FC<{videoId: string; video: VideoData | null; frameMap?: number[]}> = ({video, frameMap}) => {
  const rtl = video?.dir === 'rtl';
  // Mount the scene tree only once fonts settle: React Flow measures node handles on mount (useFontGate).
  const fontsReady = useFontGate(rtl, 'fonts');
  const theme = getTheme(video?.theme);
  if (!video || !fontsReady) return <AbsoluteFill style={{background: theme.C.bg}} />;
  if (resolveLayout(video, video.layout) === 'whiteboard') return <WhiteboardExplainer video={video} frameMap={frameMap} />;
  const timing = linearTiming({durationInFrames: constants.transitionFrames});
  const presentation = slide({direction: rtl ? 'from-left' : 'from-right'});
  const hasChapters = video.scenes.some((s) => s.chapter && !s.continues);
  let from = 0, part = 0;
  const items: React.ReactNode[] = [];
  if (hasChapters) {
    video.scenes.forEach((s, i) => {
      const chapter = s.chapter && !s.continues ? s.chapter : undefined;
      if (chapter) {
        part += 1;
        if (i > 0) items.push(<TransitionSeries.Transition key={`${s.id}-tin`} presentation={presentation} timing={timing} />);
        items.push(
          <TransitionSeries.Sequence key={`${s.id}-ch`} durationInFrames={constants.chapterFrames}>
            <ChapterCard title={chapter} part={part} videoTitle={video.title} />
          </TransitionSeries.Sequence>,
        );
        items.push(<TransitionSeries.Transition key={`${s.id}-tout`} presentation={presentation} timing={timing} />);
      }
      items.push(
        <TransitionSeries.Sequence key={s.id} durationInFrames={s.frames}>
          <SceneView scene={s} title={video.title} index={i} count={video.scenes.length}
            prev={s.continues ? video.scenes[i - 1] : undefined} nextContinues={!!video.scenes[i + 1]?.continues} mode3d={video.mode === '3d'} />
        </TransitionSeries.Sequence>,
      );
    });
  }
  const content = (
    <ThemeContext.Provider value={theme}>
    <RtlContext.Provider value={rtl}>
    <ChromeBackdrop>
      {hasChapters ? (
        <TransitionSeries>{items}</TransitionSeries>
      ) : (
        video.scenes.map((s, i) => {
          const el = (
            <Sequence key={s.id} from={from} durationInFrames={s.frames}>
              <SceneView scene={s} title={video.title} index={i} count={video.scenes.length}
                prev={s.continues ? video.scenes[i - 1] : undefined} nextContinues={!!video.scenes[i + 1]?.continues} mode3d={video.mode === '3d'} />
            </Sequence>
          );
          from += s.frames;
          return el;
        })
      )}
    </ChromeBackdrop>
    </RtlContext.Provider>
    </ThemeContext.Provider>
  );
  return Array.isArray(frameMap) && frameMap.length > 0 ? <FrameMapper frameMap={frameMap}>{content}</FrameMapper> : content;
};
