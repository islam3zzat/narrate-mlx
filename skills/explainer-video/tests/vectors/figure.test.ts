import assert from 'node:assert/strict';
import {FigureVisual} from '../../src/visuals/figure/schema';
import {describe} from '../../src/visuals/figure/semantics';
import {fitFigureBox, lerpCamera, targetCameraForRegion} from '../../src/visuals/figure/compute';

// 1. Box fitting & camera zoom clamping
{
  const box = fitFigureBox(16 / 9, 1660, 520);
  assert.ok(box.w <= 1660 && box.h <= 520);
  assert.ok(Math.abs(box.w / box.h - 16 / 9) < 0.05);

  const cEdge = targetCameraForRegion({x: 0.02, y: 0.02, w: 0.25, h: 0.3, zoom: 2.2}, box.w, box.h);
  const maxTx = ((cEdge.scale - 1) * box.w) / 2;
  const maxTy = ((cEdge.scale - 1) * box.h) / 2;
  assert.ok(Math.abs(cEdge.tx) <= maxTx + 1e-6);
  assert.ok(Math.abs(cEdge.ty) <= maxTy + 1e-6);

  const mid = lerpCamera({scale: 1, tx: 0, ty: 0}, cEdge, 0.5);
  assert.ok(Math.abs(mid.scale - (1 + (cEdge.scale - 1) * 0.5)) < 1e-9);
}

// 2. Schema + semantics check
{
  const v = FigureVisual.parse({
    type: 'figure',
    heading: 'Pipeline Figure',
    src: 'assets/sample-figure.png',
    alt: 'Model schematic',
    regions: [
      {id: 'a', label: 'First stage', x: 0.1, y: 0.2, w: 0.3, h: 0.5, zoom: 1.8},
      {id: 'b', label: 'Second stage', x: 0.55, y: 0.2, w: 0.3, h: 0.5, zoom: 1.8},
    ],
  });
  assert.deepEqual(describe(v, undefined).slots, ['First stage', 'Second stage']);
}

console.log('figure vector tests ok');
