import React from 'react';
import {SceneCanvas, look, partIn, useFocus, useStableId, useTheme, type ThemeDef, type View2DProps} from '../../sdk/view2d';
import {ALGO_STATE_TONES, stepTimeline, type AlgoStateTone} from '../../sdk/algo-math';
import {AuxStrip, StepIndicator, algoToneColors} from '../../sdk/algo-2d';
import {
  computeEdgeGeometry,
  computeGraphLayout,
  edgeKey,
  formatWeight,
  isActiveTransitionTone,
} from './compute';

const fitNodeLabelSize = (text: string, radius: number): number => {
  const maxW = radius * 1.45;
  const len = Math.max(1, text.length);
  return Math.max(14, Math.min(25, Math.floor(maxW / (len * 0.62))));
};

const edgeVisualStyle = (tone: AlgoStateTone, th: ThemeDef): {stroke: string; width: number; opacity: number; cased: boolean} => {
  const {C} = th;
  if (tone === 'default') return {stroke: C.ink, width: 3.2, opacity: 0.78, cased: false};
  if (tone === 'dim') return {stroke: C.dim, width: 2.5, opacity: 0.3, cased: false};
  return {stroke: algoToneColors(tone, th).bg, width: 5, opacity: 1, cased: true};
};

export const View2D: React.FC<View2DProps<'graph-algo'>> = ({
  visual: v,
  frame,
  lead,
  audioFrames,
  reveal,
  focus,
}) => {
  const th = useTheme();
  const {C, FONT, MONO, BORDER, isAnime, cel} = th;
  const focusNow = useFocus(focus, lead);
  const uid = useStableId('ga');

  const tl = stepTimeline(frame, lead, audioFrames, v.steps.length, reveal);
  const prevStep = v.steps[tl.prevIndex];
  const curStep = v.steps[tl.index];
  const hasAnyAux = React.useMemo(() => v.steps.some((s) => !!s.aux), [v.steps]);

  const partIds = React.useMemo(() => {
    const s = new Set<string>(v.nodes.map((n) => n.id));
    for (const e of v.edges) {
      if (e.id) s.add(e.id);
    }
    return s;
  }, [v.nodes, v.edges]);

  const hasPartFocus = (set: Set<string> | null) => !!set && [...set].some((id) => partIds.has(id));
  const partFocusActive = hasPartFocus(focusNow.cur) || hasPartFocus(focusNow.prev);
  const stepOpacity = !partFocusActive && curStep.id ? look(focusNow, partIn(curStep.id)).opacity : 1;

  const directedPairs = React.useMemo(() => {
    const pairs = new Set(v.edges.map((e) => `${e.from}->${e.to}`));
    return pairs;
  }, [v.edges]);

  return (
    <SceneCanvas heading={v.heading} caption={v.caption} ltr>
      {({width, height}) => {
        const stepHeaderH = 50;
        const auxTrayH = hasAnyAux ? 62 : 0;
        const svgH = Math.max(240, height - stepHeaderH - auxTrayH);

        const nodePositions = computeGraphLayout(
          v.nodes,
          v.edges,
          {x: 24, y: 6, width: width - 48, height: svgH - 12},
          !!v.directed,
        );
        const posById = new Map(nodePositions.map((p) => [p.id, p]));
        const sh = isAnime ? 5 : 6;
        const shColor = isAnime ? cel.shadowTint : C.ink;

        return (
          <div style={{display: 'flex', flexDirection: 'column', gap: 8, height}}>
            <StepIndicator step={tl.index} total={v.steps.length} label={curStep.label} note={curStep.note} />
            <svg width={width} height={svgH} viewBox={`0 0 ${width} ${svgH}`} style={{display: 'block', opacity: stepOpacity}}>
              <defs>
                {ALGO_STATE_TONES.map((tone) => {
                  const st = edgeVisualStyle(tone, th);
                  return (
                    <marker
                      key={tone}
                      id={`${uid}-${tone}`}
                      markerWidth={12}
                      markerHeight={12}
                      refX={10}
                      refY={6}
                      orient="auto"
                      markerUnits="userSpaceOnUse"
                    >
                      <path
                        d="M 1 1.5 L 11 6 L 1 10.5 z"
                        fill={st.stroke}
                        stroke={st.cased ? C.ink : 'none'}
                        strokeWidth={st.cased ? 1.5 : 0}
                      />
                    </marker>
                  );
                })}
              </defs>

              {v.edges.map((edge, ei) => {
                const fromPos = posById.get(edge.from);
                const toPos = posById.get(edge.to);
                if (!fromPos || !toPos) return null;

                const ek = edgeKey(edge);
                const isDirected = edge.directed ?? !!v.directed;
                const hasReverse = directedPairs.has(`${edge.to}->${edge.from}`);
                const geom = computeEdgeGeometry(fromPos, toPos, fromPos.r, isDirected, hasReverse);

                const prevTone: AlgoStateTone = prevStep.edgeStates?.[ek] ?? 'default';
                const tone: AlgoStateTone = curStep.edgeStates?.[ek] ?? 'default';
                const style = edgeVisualStyle(tone, th);
                const edgeOp = partFocusActive && edge.id ? look(focusNow, partIn(edge.id)).opacity : 1;

                const pulseActive =
                  tl.isTransitioning &&
                  tl.progress > 0 &&
                  tl.progress < 1 &&
                  tone !== prevTone &&
                  isActiveTransitionTone(tone);
                const pulsePt = pulseActive ? geom.pointAt(tl.eased) : null;
                const pulseOpacity = pulseActive ? Math.sin(Math.PI * tl.eased) : 0;

                const weightText = edge.weight !== undefined ? formatWeight(edge.weight) : null;
                const pillW = weightText ? Math.max(32, weightText.length * 11 + 16) : 0;

                return (
                  <g key={`${ek}-${ei}`} opacity={style.opacity * edgeOp}>
                    {style.cased && (
                      <path
                        d={geom.path}
                        fill="none"
                        stroke={C.ink}
                        strokeWidth={style.width + 3}
                        strokeLinecap="round"
                      />
                    )}
                    <path
                      d={geom.path}
                      fill="none"
                      stroke={style.stroke}
                      strokeWidth={style.width}
                      strokeLinecap="round"
                      markerEnd={isDirected ? `url(#${uid}-${tone})` : undefined}
                    />
                    {weightText && (
                      <g transform={`translate(${geom.mid.x - pillW / 2}, ${geom.mid.y - 14})`}>
                        <rect
                          width={pillW}
                          height={28}
                          rx={6}
                          fill={C.panel}
                          stroke={style.cased ? style.stroke : C.ink}
                          strokeWidth={2.2}
                        />
                        <text
                          x={pillW / 2}
                          y={19}
                          textAnchor="middle"
                          fontFamily={MONO}
                          fontWeight={800}
                          fontSize={16}
                          fill={C.ink}
                        >
                          {weightText}
                        </text>
                      </g>
                    )}
                    {pulsePt && pulseOpacity > 0.02 && (
                      <circle
                        cx={pulsePt.x}
                        cy={pulsePt.y}
                        r={9}
                        fill={style.stroke}
                        stroke={C.ink}
                        strokeWidth={2.5}
                        opacity={pulseOpacity}
                      />
                    )}
                  </g>
                );
              })}

              {v.nodes.map((node) => {
                const pos = posById.get(node.id);
                if (!pos) return null;

                const prevTone: AlgoStateTone = prevStep.nodeStates?.[node.id] ?? 'default';
                const tone: AlgoStateTone = curStep.nodeStates?.[node.id] ?? 'default';
                const pal = algoToneColors(tone, th);
                const nodeOp = partFocusActive ? look(focusNow, partIn(node.id)).opacity : 1;

                const changed = tl.isTransitioning && tl.progress > 0 && tl.progress < 1 && tone !== prevTone;
                const popScale = changed ? 1 + 0.08 * Math.sin(Math.PI * tl.eased) : 1;
                const r = pos.r * popScale;
                const fontSize = fitNodeLabelSize(node.label, r);
                const showHalo = tone === 'active' || tone === 'pivot' || tone === 'swap';

                const badge = curStep.nodeBadges?.[node.id];
                const badgeW = badge ? Math.max(52, badge.length * 10.5 + 18) : 0;
                const badgeFill = tone === 'default' ? C.panel : pal.bg;
                const badgeFg = tone === 'default' ? C.ink : pal.fg;

                return (
                  <g key={node.id} opacity={pal.opacity * nodeOp}>
                    {showHalo && (
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={r + 8}
                        fill="none"
                        stroke={pal.bg}
                        strokeWidth={3.5}
                        opacity={0.45}
                      />
                    )}
                    <circle cx={pos.x + sh} cy={pos.y + sh} r={r} fill={shColor} />
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={r}
                      fill={pal.bg}
                      stroke={pal.border}
                      strokeWidth={BORDER}
                    />
                    {isAnime && (
                      <path
                        d={`M ${(pos.x - r * 0.58).toFixed(1)} ${(pos.y - r * 0.45).toFixed(1)} A ${r} ${r} 0 0 1 ${(pos.x + r * 0.58).toFixed(1)} ${(pos.y - r * 0.45).toFixed(1)}`}
                        fill="none"
                        stroke={cel.rimLight}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                      />
                    )}
                    <text
                      x={pos.x}
                      y={pos.y + fontSize * 0.35}
                      textAnchor="middle"
                      fontFamily={FONT}
                      fontWeight={800}
                      fontSize={fontSize}
                      fill={pal.fg}
                    >
                      {node.label}
                    </text>
                    {badge && (
                      <g transform={`translate(${pos.x - badgeW / 2}, ${pos.y - pos.r - 36})`}>
                        <rect
                          width={badgeW}
                          height={26}
                          rx={6}
                          fill={badgeFill}
                          stroke={C.ink}
                          strokeWidth={2.2}
                        />
                        <text
                          x={badgeW / 2}
                          y={18}
                          textAnchor="middle"
                          fontFamily={MONO}
                          fontWeight={800}
                          fontSize={15}
                          fill={badgeFg}
                        >
                          {badge}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
            {hasAnyAux && (
              curStep.aux ? (
                <AuxStrip label={curStep.aux.label} items={curStep.aux.items} note={curStep.aux.note} />
              ) : (
                <div style={{minHeight: 54}} />
              )
            )}
          </div>
        );
      }}
    </SceneCanvas>
  );
};
