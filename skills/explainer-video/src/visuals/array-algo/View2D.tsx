import React from 'react';
import {SceneCanvas, look, partIn, useFocus, type View2DProps} from '../../sdk/view2d';
import {computeArrayLayout, interpolateKeyedPositions, stepTimeline} from '../../sdk/algo-math';
import {AlgoBar, AlgoCell, AuxStrip, PointerBadge, StepIndicator, WindowBracket} from '../../sdk/algo-2d';
import {
  barHeightFor,
  computeBarMax,
  formatItemValue,
  interpolatePointers,
  interpolateWindow,
  maxPointerStackRows,
} from './compute';

export const View2D: React.FC<View2DProps<'array-algo'>> = ({
  visual: v,
  frame,
  lead,
  audioFrames,
  reveal,
  focus,
}) => {
  const focusNow = useFocus(focus, lead);
  const mode = v.mode ?? 'cells';
  const showIndices = v.showIndices !== false;

  const tl = stepTimeline(frame, lead, audioFrames, v.steps.length, reveal);
  const prevStep = v.steps[tl.prevIndex];
  const curStep = v.steps[tl.index];

  const hasAnyAux = React.useMemo(() => v.steps.some((s) => !!s.aux), [v.steps]);
  const hasAnyWindow = React.useMemo(() => v.steps.some((s) => !!s.window), [v.steps]);
  const maxStack = React.useMemo(() => maxPointerStackRows(v.steps), [v.steps]);
  const barMax = React.useMemo(() => computeBarMax(v.steps), [v.steps]);

  const itemIds = new Set(curStep.items.map((it) => it.id));
  const hasItemFocus = (s: Set<string> | null) => !!s && [...s].some((id) => itemIds.has(id));
  const itemFocusActive = hasItemFocus(focusNow.cur) || hasItemFocus(focusNow.prev);
  const stepOpacity = !itemFocusActive && curStep.id ? look(focusNow, partIn(curStep.id)).opacity : 1;

  return (
    <SceneCanvas heading={v.heading} caption={v.caption} ltr>
      {({width, height}) => {
        const stepHeaderH = 50;
        const auxTrayH = hasAnyAux ? 62 : 0;
        const svgH = Math.max(220, height - stepHeaderH - auxTrayH);
        const pointerHeadroom = maxStack > 1 ? 118 : maxStack === 1 ? 82 : showIndices ? 44 : 24;
        const topHeadroom = hasAnyWindow ? 48 : 28;

        const lay = computeArrayLayout(curStep.items.length, {x: 40, y: 6, width: width - 80, height: svgH - 12}, {
          mode,
          topHeadroom,
          pointerHeadroom,
          arcHeadroom: mode === 'bars' ? 24 : 46,
        });

        const baseY = mode === 'bars' ? lay.barBaseY : lay.rowY;
        const positions = interpolateKeyedPositions(
          prevStep.items.map((x) => x.id),
          curStep.items.map((x) => x.id),
          lay.slotLeftX,
          baseY,
          tl.eased,
          {arcHeight: mode === 'bars' ? 24 : 46},
        );
        const ptrs = interpolatePointers(
          tl.index === tl.prevIndex ? curStep.pointers : prevStep.pointers,
          curStep.pointers,
          lay.slotCenterX,
          tl.eased,
        );
        const win = interpolateWindow(
          tl.index === tl.prevIndex ? curStep.window : prevStep.window,
          curStep.window,
          lay.slotLeftX,
          lay.cellW,
          tl.eased,
        );
        const pointerY = (mode === 'bars' ? lay.barBaseY : lay.rowY + lay.cellH) + (showIndices ? 32 : 10);

        return (
          <div style={{display: 'flex', flexDirection: 'column', gap: 8, height}}>
            <StepIndicator step={tl.index} total={v.steps.length} label={curStep.label} note={curStep.note} />
            <svg width={width} height={svgH} viewBox={`0 0 ${width} ${svgH}`} style={{display: 'block', opacity: stepOpacity}}>
              {win && mode === 'cells' && (
                <WindowBracket
                  leftX={win.leftX}
                  rightX={win.rightX}
                  topY={lay.rowY - 18}
                  bottomY={lay.rowY + lay.cellH + 14}
                  label={win.label}
                  tone={win.tone}
                  opacity={win.opacity}
                />
              )}
              {positions.map((pos, idx) => {
                const item = curStep.items[idx];
                const itemOp = itemFocusActive ? look(focusNow, partIn(item.id)).opacity : 1;
                if (mode === 'bars') {
                  const numVal = typeof item.value === 'number' ? item.value : 0;
                  return (
                    <AlgoBar
                      key={item.id}
                      x={pos.x}
                      yBase={pos.y}
                      width={lay.cellW}
                      height={barHeightFor(numVal, barMax, lay.barMaxH)}
                      value={formatItemValue(item.value)}
                      index={showIndices ? idx : undefined}
                      tone={item.state ?? 'default'}
                      opacity={pos.opacity * itemOp}
                    />
                  );
                }
                return (
                  <AlgoCell
                    key={item.id}
                    x={pos.x}
                    y={pos.y}
                    width={lay.cellW}
                    height={lay.cellH}
                    value={formatItemValue(item.value)}
                    subLabel={item.subLabel}
                    index={showIndices ? idx : undefined}
                    tone={item.state ?? 'default'}
                    opacity={pos.opacity * itemOp}
                  />
                );
              })}
              {ptrs.map((p, idx) => (
                <PointerBadge
                  key={`${p.name}-${idx}`}
                  x={p.x}
                  y={pointerY}
                  name={p.name}
                  tone={p.tone}
                  stackRow={p.stackRow}
                  opacity={p.opacity}
                />
              ))}
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
