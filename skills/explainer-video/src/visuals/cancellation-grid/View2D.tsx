// 2D view of `cancellation-grid`: interior cancellation tessellations for FTC (1D), curl (2D), and divergence (2D / isometric 3D).
import React from 'react';
import {mixHex, useTheme} from '../../theme';
import {Heading, at, prog} from '../../kit2d';
import type {View2DProps} from '../props';
import {build2DGrid, buildIso3DGrid, phaseWeights, theoremBadge} from './grid';

const SVG_W = 1700;

const PhasePill: React.FC<{label: string; active: boolean; done: boolean}> = ({label, active, done}) => {
  const {C, MONO, BORDER, onAccent} = useTheme();
  const bg = active ? C.primary : done ? C.accent : C.panel;
  return (
    <div
      style={{
        padding: '4px 14px',
        background: bg,
        color: onAccent(bg),
        border: `${Math.max(2, BORDER - 1)}px solid ${C.ink}`,
        borderRadius: 6,
        fontFamily: MONO,
        fontWeight: 700,
        fontSize: 19,
        textTransform: 'uppercase',
        opacity: active || done ? 1 : 0.45,
      }}
    >
      {label}
    </div>
  );
};

export const View2D: React.FC<View2DProps<'cancellation-grid'>> = ({visual: v, frame, lead, audioFrames, reveal}) => {
  const {C, FONT, MONO, BORDER, shadow, onAccent} = useTheme();
  const uid = React.useId().replace(/[^A-Za-z0-9_-]/g, '');
  const mIntA = `${uid}-ia`;
  const mIntB = `${uid}-ib`;
  const mBnd = `${uid}-bnd`;

  const stageStarts = React.useMemo(
    () => v.stages.map((_, i) => at(i, v.stages.length, lead, audioFrames, reveal)),
    [v.stages, lead, audioFrames, reveal],
  );
  const w = phaseWeights(frame, stageStarts, v.stages);

  const boxH = v.caption ? 542 : 590;
  const svgH = boxH - 52;

  const colA = C.secondary;
  const colB = C.danger;
  const colBnd = mixHex(C.accent, C.ink, 0.22);
  const colSubtle = C.dim;

  const interiorOpacity = Math.max(0.08, 1 - w.interiorCancel * 0.88);
  const arrowStroke = (kind: 'interior' | 'boundary', sign: 1 | -1) => {
    if (kind === 'boundary') return w.boundarySpotlight > 0.05 ? colBnd : C.ink;
    if (w.interiorHighlight > 0.05) return sign === 1 ? colA : colB;
    return colSubtle;
  };
  const arrowMarker = (kind: 'interior' | 'boundary', sign: 1 | -1) => {
    if (kind === 'boundary') return `url(#${mBnd})`;
    return sign === 1 ? `url(#${mIntA})` : `url(#${mIntB})`;
  };

  const markerDef = (id: string, color: string) => (
    <marker id={id} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 1 L 10 5 L 0 9 z" fill={color} />
    </marker>
  );

  const cols = v.cols ?? (v.theorem === 'ftc-1d' ? 5 : v.theorem === 'divergence-3d' ? 2 : 3);
  const rows = v.rows ?? (v.theorem === 'divergence-3d' ? 2 : 3);
  const depth = v.depth ?? 2;
  const grid2d = React.useMemo(
    () => (v.theorem === 'curl-2d' || v.theorem === 'divergence-2d'
      ? {box: {x: 410, y: 40, w: 880, h: svgH - 80}, ...build2DGrid(v.theorem, cols, rows, {x: 410, y: 40, w: 880, h: svgH - 80})}
      : null),
    [v.theorem, cols, rows, svgH],
  );
  const isoCubes = React.useMemo(
    () => (v.theorem === 'divergence-3d'
      ? buildIso3DGrid(cols, rows, depth, SVG_W * 0.5, svgH * 0.48, cols === 3 || rows === 3 ? 72 : 94)
      : null),
    [v.theorem, cols, rows, depth, svgH],
  );

  return (
    <div>
      <Heading text={v.heading} />
      <div style={{direction: 'ltr', width: SVG_W, height: boxH}}>
        {/* Top phase strip + theorem identity pill */}
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, height: 42}}>
          <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
            {(['cells', 'interior', 'cancel', 'boundary'] as const).map((ph) => {
              const rank = ['cells', 'interior', 'cancel', 'boundary'].indexOf(ph);
              const curRank = ['cells', 'interior', 'cancel', 'boundary'].indexOf(w.activePhase);
              return <PhasePill key={ph} label={ph} active={ph === w.activePhase} done={rank < curRank} />;
            })}
            {w.activeNote && (
              <div
                style={{
                  marginLeft: 8,
                  padding: '4px 14px',
                  background: C.panel,
                  border: `${Math.max(2, BORDER - 1)}px solid ${C.ink}`,
                  borderRadius: 6,
                  fontFamily: FONT,
                  fontWeight: 700,
                  fontSize: 20,
                  color: C.ink,
                }}
              >
                {w.activeNote}
              </div>
            )}
          </div>
          <div
            style={{
              padding: '5px 16px',
              background: w.boundarySpotlight > 0.2 ? C.accent : C.panel,
              color: w.boundarySpotlight > 0.2 ? onAccent(C.accent) : C.ink,
              border: `${BORDER}px solid ${C.ink}`,
              boxShadow: shadow(4, false),
              borderRadius: 6,
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: 21,
            }}
          >
            {theoremBadge(v.theorem)}
          </div>
        </div>

        {/* Diagram card */}
        <div
          style={{
            width: SVG_W,
            height: svgH,
            background: C.panel,
            border: `${BORDER}px solid ${C.ink}`,
            boxShadow: shadow(8, false),
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          <svg width={SVG_W} height={svgH} viewBox={`0 0 ${SVG_W} ${svgH}`}>
            <defs>
              {markerDef(mIntA, w.interiorHighlight > 0.05 ? colA : colSubtle)}
              {markerDef(mIntB, w.interiorHighlight > 0.05 ? colB : colSubtle)}
              {markerDef(mBnd, w.boundarySpotlight > 0.05 ? colBnd : C.ink)}
            </defs>

            {/* 1D Fundamental Theorem of Calculus telescoping intervals */}
            {v.theorem === 'ftc-1d' && (() => {
              const left = 140, right = SVG_W - 140, midY = svgH * 0.5;
              const segW = (right - left) / cols;
              const tileH = 126;
              return (
                <g opacity={w.cellsIn}>
                  <line x1={left - 30} y1={midY} x2={right + 30} y2={midY} stroke={C.muted} strokeWidth={4} />
                  {Array.from({length: cols}, (_, i) => {
                    const x0 = left + i * segW + 10;
                    const x1 = left + (i + 1) * segW - 10;
                    const cw = x1 - x0;
                    const isLeftOuter = i === 0;
                    const isRightOuter = i === cols - 1;
                    return (
                      <g key={i}>
                        <rect
                          x={x0}
                          y={midY - tileH / 2}
                          width={cw}
                          height={tileH}
                          rx={8}
                          fill={mixHex(C.primary, C.panel, 0.85)}
                          stroke={C.ink}
                          strokeWidth={3}
                          opacity={Math.max(0.35, 1 - w.boundarySpotlight * 0.45)}
                        />
                        <text x={(x0 + x1) / 2} y={midY + 9} textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize={26} fill={C.ink}>
                          {`ΔF${i + 1}`}
                        </text>
                        {/* Left endpoint: -F(x_i) */}
                        <g opacity={isLeftOuter ? 1 : interiorOpacity}>
                          <circle
                            cx={x0 + 18}
                            cy={midY - tileH / 2 - 28}
                            r={isLeftOuter && w.boundarySpotlight > 0.1 ? 24 : 20}
                            fill={isLeftOuter ? colBnd : w.interiorHighlight > 0.05 ? colB : C.muted}
                            stroke={C.ink}
                            strokeWidth={3}
                          />
                          <text
                            x={x0 + 18}
                            y={midY - tileH / 2 - 21}
                            textAnchor="middle"
                            fontFamily={MONO}
                            fontWeight={700}
                            fontSize={19}
                            fill={isLeftOuter ? C.panel : C.ink}
                          >
                            {isLeftOuter ? '-a' : `-x${i}`}
                          </text>
                        </g>
                        {/* Right endpoint: +F(x_{i+1}) */}
                        <g opacity={isRightOuter ? 1 : interiorOpacity}>
                          <circle
                            cx={x1 - 18}
                            cy={midY + tileH / 2 + 28}
                            r={isRightOuter && w.boundarySpotlight > 0.1 ? 24 : 20}
                            fill={isRightOuter ? colBnd : w.interiorHighlight > 0.05 ? colA : C.muted}
                            stroke={C.ink}
                            strokeWidth={3}
                          />
                          <text
                            x={x1 - 18}
                            y={midY + tileH / 2 + 35}
                            textAnchor="middle"
                            fontFamily={MONO}
                            fontWeight={700}
                            fontSize={19}
                            fill={isRightOuter ? C.panel : C.ink}
                          >
                            {isRightOuter ? '+b' : `+x${i + 1}`}
                          </text>
                        </g>
                        {/* Cancellation strike on interior pairs */}
                        {i > 0 && w.interiorCancel > 0.05 && (
                          <g opacity={w.interiorCancel}>
                            <line
                              x1={left + i * segW - 22}
                              y1={midY - tileH / 2 - 54}
                              x2={left + i * segW + 22}
                              y2={midY + tileH / 2 + 54}
                              stroke={C.danger}
                              strokeWidth={5}
                              strokeLinecap="round"
                            />
                          </g>
                        )}
                      </g>
                    );
                  })}
                  {/* Surviving boundary highlight */}
                  {w.boundarySpotlight > 0.05 && (
                    <g opacity={w.boundarySpotlight}>
                      <rect
                        x={left - 4}
                        y={midY - tileH / 2 - 64}
                        width={right - left + 8}
                        height={tileH + 128}
                        rx={12}
                        fill="none"
                        stroke={colBnd}
                        strokeWidth={5}
                        strokeDasharray="14 8"
                      />
                    </g>
                  )}
                </g>
              );
            })()}

            {/* 2D Curl or 2D Divergence grid */}
            {(v.theorem === 'curl-2d' || v.theorem === 'divergence-2d') && grid2d && (() => {
              const {box, cells, outerLoop} = grid2d;
              return (
                <g opacity={w.cellsIn}>
                  {cells.map((cell, ci) => {
                    const cx = cell.x + cell.w / 2;
                    const cy = cell.y + cell.h / 2;
                    const rLoop = Math.min(cell.w, cell.h) * 0.2;
                    return (
                      <g key={ci}>
                        <rect
                          x={cell.x + 4}
                          y={cell.y + 4}
                          width={cell.w - 8}
                          height={cell.h - 8}
                          rx={6}
                          fill={mixHex(C.muted, C.panel, 0.55)}
                          stroke={C.dim}
                          strokeWidth={2}
                          opacity={Math.max(0.35, 1 - w.boundarySpotlight * 0.5)}
                        />
                        {/* Micro-symbol inside cell (curl loop or outward divergence source) */}
                        {v.theorem === 'curl-2d' ? (
                          <path
                            d={`M ${cx + rLoop} ${cy} A ${rLoop} ${rLoop} 0 1 0 ${cx} ${cy - rLoop}`}
                            fill="none"
                            stroke={C.ink}
                            strokeWidth={3.5}
                            markerEnd={`url(#${mBnd})`}
                            opacity={0.45}
                          />
                        ) : (
                          <circle cx={cx} cy={cy} r={8} fill={C.primary} stroke={C.ink} strokeWidth={2.5} opacity={0.65} />
                        )}
                        {/* Cell arrows (interior cancel vs boundary survive) */}
                        {cell.edges.map((e, ei) => {
                          const isInt = e.kind === 'interior';
                          const op = isInt ? interiorOpacity : 1;
                          const sw = isInt ? (w.interiorHighlight > 0.05 ? 4.5 : 3.5) : w.boundarySpotlight > 0.1 ? 6 : 4;
                          return (
                            <line
                              key={ei}
                              x1={e.x1}
                              y1={e.y1}
                              x2={e.x2}
                              y2={e.y2}
                              stroke={arrowStroke(e.kind, e.pairSign)}
                              strokeWidth={sw}
                              strokeLinecap="round"
                              markerEnd={arrowMarker(e.kind, e.pairSign)}
                              opacity={op}
                            />
                          );
                        })}
                      </g>
                    );
                  })}
                  {/* Outer boundary loop spotlight */}
                  {w.boundarySpotlight > 0.05 && (
                    <g opacity={w.boundarySpotlight}>
                      <rect
                        x={box.x - 4}
                        y={box.y - 4}
                        width={box.w + 8}
                        height={box.h + 8}
                        rx={8}
                        fill="none"
                        stroke={colBnd}
                        strokeWidth={6}
                      />
                      {outerLoop.map((e, i) => (
                        <line
                          key={i}
                          x1={e.x1}
                          y1={e.y1}
                          x2={e.x2}
                          y2={e.y2}
                          stroke={colBnd}
                          strokeWidth={6}
                          markerEnd={`url(#${mBnd})`}
                        />
                      ))}
                    </g>
                  )}
                </g>
              );
            })()}

            {/* Isometric 3D Divergence cubes */}
            {v.theorem === 'divergence-3d' && isoCubes && (() => {
              const cubes = isoCubes;
              const faceFill = (shade: 'top' | 'left' | 'right', kind: 'interior' | 'boundary') => {
                if (kind === 'boundary' && w.boundarySpotlight > 0.1) {
                  return shade === 'top' ? mixHex(C.accent, C.panel, 0.35) : shade === 'right' ? mixHex(C.accent, C.panel, 0.55) : mixHex(C.accent, C.panel, 0.7);
                }
                return shade === 'top' ? C.primary : shade === 'right' ? C.muted : mixHex(C.muted, C.ink, 0.12);
              };
              return (
                <g opacity={w.cellsIn}>
                  {cubes.map((cube, ci) => (
                    <g key={ci}>
                      {cube.faces.map((face, fi) => {
                        const isInt = face.kind === 'interior';
                        const faceOp = isInt ? Math.max(0.14, 0.9 - w.interiorCancel * 0.76) : 0.92;
                        const pts = face.poly.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
                        return (
                          <g key={fi}>
                            <polygon
                              points={pts}
                              fill={faceFill(face.shade, face.kind)}
                              fillOpacity={faceOp}
                              stroke={face.kind === 'boundary' && w.boundarySpotlight > 0.1 ? colBnd : C.ink}
                              strokeWidth={face.kind === 'boundary' && w.boundarySpotlight > 0.1 ? 3.5 : 2}
                              strokeOpacity={isInt ? Math.max(0.25, 1 - w.interiorCancel * 0.65) : 1}
                            />
                            <line
                              x1={face.arrow.x1}
                              y1={face.arrow.y1}
                              x2={face.arrow.x2}
                              y2={face.arrow.y2}
                              stroke={arrowStroke(face.kind, face.pairSign)}
                              strokeWidth={face.kind === 'boundary' && w.boundarySpotlight > 0.1 ? 5 : 3.5}
                              strokeLinecap="round"
                              markerEnd={arrowMarker(face.kind, face.pairSign)}
                              opacity={isInt ? interiorOpacity : 1}
                            />
                          </g>
                        );
                      })}
                    </g>
                  ))}
                </g>
              );
            })()}
          </svg>
        </div>
      </div>
      {v.caption && (
        <div style={{fontSize: 30, color: C.dim, textAlign: 'center', marginTop: 10, opacity: prog(frame, 2, 10)}}>
          {v.caption}
        </div>
      )}
    </div>
  );
};
