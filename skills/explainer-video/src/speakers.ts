// Who is speaking, for dialogue videos (podcast style). Explainer.tsx and whiteboard/Whiteboard.tsx wrap every scene in a
// <SpeakersProvider>, which provides a value only when the video has `speakers`; every other video has no context at all
// (useSpeakers() is null), so its output cannot change. Visuals that show who said what (the speaker tag, the avatar) read it.
import React from 'react';
import type {Scene, VideoData} from './types';

export type SpeakerInfo = {name: string; role: string; index: number};
export type SpeakerEntry = SpeakerInfo & {id: string};
export type SpeakersValue = {
  /** Both speakers in script order (`index` is the position, which picks their accent). */
  list: SpeakerEntry[];
  /** Whoever speaks the scene being drawn. */
  current?: SpeakerEntry;
};

export const SpeakersContext = React.createContext<SpeakersValue | null>(null);
export const useSpeakers = (): SpeakersValue | null => React.useContext(SpeakersContext);

export const speakersOf = (video: Pick<VideoData, 'speakers'>): SpeakerEntry[] =>
  Object.entries(video.speakers ?? {}).map(([id, s], index) => ({id, name: s.name, role: s.role, index}));

/** Who speaks this scene, or undefined for a video without speakers. `index` is the speaker's position in the script's
 * `speakers`, which picks the accent: the two voices stay visually distinct from scene to scene. */
export const speakerOf = (video: Pick<VideoData, 'speakers'>, scene: Pick<Scene, 'speaker'>): SpeakerInfo | undefined => {
  const hit = speakersOf(video).find((s) => s.id === scene.speaker);
  return hit && {name: hit.name, role: hit.role, index: hit.index};
};

export const SpeakersProvider: React.FC<{video: Pick<VideoData, 'speakers'>; scene?: Pick<Scene, 'speaker'>; children: React.ReactNode}> = ({video, scene, children}) => {
  const speakers = video.speakers;
  const speaker = scene?.speaker;
  const value = React.useMemo<SpeakersValue | null>(() => {
    if (!speakers) return null;
    const list = speakersOf({speakers});
    return {list, current: list.find((s) => s.id === speaker)};
  }, [speakers, speaker]);
  return value ? React.createElement(SpeakersContext.Provider, {value}, children) : React.createElement(React.Fragment, null, children);
};

/**
 * The speaker a visual names by id (`by`), for drawing. Falls back, when the video declares no such speaker (a catalog fixture,
 * a visual shown on its own), to a stand-in whose name is the id and whose index is the id's position in `order` (the ids the
 * visual itself names, first seen first), so the two voices still get two different looks.
 */
export const speakerById = (list: readonly SpeakerEntry[] | undefined, id: string, order: readonly string[]): SpeakerEntry =>
  list?.find((s) => s.id === id) ?? {id, name: id, role: '', index: Math.max(0, order.indexOf(id))};

/** Distinct ids in first-seen order. */
export const distinctIds = (ids: readonly string[]): string[] => [...new Set(ids)];

/** The two columns/figures of a dialogue visual, left then right: the video's speakers in script order, else the ids the visual names. */
export const speakerPair = (list: readonly SpeakerEntry[] | undefined, named: readonly string[]): SpeakerEntry[] => {
  if (list && list.length > 0) return [...list];
  const ids = distinctIds(named);
  return ids.map((id) => speakerById(undefined, id, ids));
};
