// Props of a type's 2D view. (3D views take Visual3DProps from ../three/common.) Types only.
import type {MermaidRendered, Visual} from '../types';
import type {FocusEvent} from '../focus';

export type View2DProps<T extends Visual['type']> = {
  visual: Extract<Visual, {type: T}>;
  frame: number; lead: number; audioFrames: number;
  /** Narration reveal times of the visual's slots, in seconds from the start of the audio. */
  reveal?: number[];
  /** The previous scene's visual (only set when this scene `continues` it). */
  prev?: Visual;
  focus?: FocusEvent[];
  /** Runtime-rendered mermaid artifacts (SVG path and optional layered layout). */
  rendered?: MermaidRendered;
  /** Runtime-staged relative public/ asset path for `figure` images. */
  figureAsset?: string;
  /** Probed natural width/height aspect ratio fallback when `figure.aspect` is omitted. */
  figureAspect?: number;
};
