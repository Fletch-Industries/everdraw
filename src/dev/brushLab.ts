/**
 * Brush Lab — dev-only visual regression harness (/brush-lab.html).
 *
 * Renders every built-in brush through the REAL GL pipeline (StrokeSession →
 * WebGLBrushEngine → layer FBO → composite) with synthetic pressure-ramped
 * strokes, as a contact sheet for judging brush feel and tuning presets.
 */

import { Point, BrushType, Layer, WetMixSettings } from '@/types/drawing';
import { StrokeSession, StrokeSessionConfig } from '@/utils/strokeSession';
import { WebGLLayerManager } from '@/utils/webglLayerManager';
import { WebGLBrushEngine } from '@/utils/webglBrushEngine';
import { getBrushPreset, BRUSH_GROUPS } from '@/utils/brushPresets';

// ?diag mode: fewer brushes, bigger cells, strokes crafted to expose
// segmentation (pressure fade-outs) and self-overlap artifacts (tight loops).
const DIAG = new URLSearchParams(location.search).has('diag');

const CELL_W = DIAG ? 1240 : 620;
const CELL_H = DIAG ? 240 : 170;
const COLS = DIAG ? 1 : 2;

const DIAG_BRUSHES: BrushType[] = ['paintbrush', 'watercolor', 'airbrush_soft', 'soft_pastel', 'marker', 'pencil_6b', 'ink_brush'];
const BRUSHES: BrushType[] = DIAG ? DIAG_BRUSHES : (BRUSH_GROUPS.flatMap(g => g.ids) as BrushType[]);
const ROWS = Math.ceil(BRUSHES.length / COLS);

// Extra rows in diag mode for the wet-blending speed test
const EXTRA_ROWS = DIAG ? 2 : 0;

const W = CELL_W * COLS + 40;
const H = CELL_H * (ROWS + EXTRA_ROWS) + 40;

const canvas = document.getElementById('lab') as HTMLCanvasElement;
canvas.width = W;
canvas.height = H;
canvas.style.width = `${W}px`;
canvas.style.height = `${H}px`;

const gl = canvas.getContext('webgl2', {
  alpha: true,
  antialias: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: true,
})!;

const layerManager = new WebGLLayerManager(gl);
layerManager.initialize(W, H);
const engine = new WebGLBrushEngine(gl, layerManager);
layerManager.ensureLayerFBO('lab');

/** Pressure-ramped S-curve: light → heavy → light, like a confident stroke. */
function sCurve(x0: number, y0: number, w: number, seed: number): Point[] {
  const pts: Point[] = [];
  const n = 90;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({
      x: x0 + t * w,
      y: y0 + Math.sin(t * Math.PI * 2 + seed) * 26,
      pressure: 0.15 + 0.85 * Math.sin(t * Math.PI) ** 0.8,
      timestamp: 1000 + i * 7,
    });
  }
  return pts;
}

/** Short fast flick to show taper + velocity dynamics. */
function flick(x0: number, y0: number, w: number): Point[] {
  const pts: Point[] = [];
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({
      x: x0 + t * w,
      y: y0 - t * 26,
      pressure: 0.9 - t * 0.75,
      timestamp: 1000 + i * 4,
    });
  }
  return pts;
}

/** Slow scribble crossing itself — shows self-overlap build-up. */
function scribble(x0: number, y0: number): Point[] {
  const pts: Point[] = [];
  const n = 70;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({
      x: x0 + t * 90 + Math.sin(t * Math.PI * 5) * 24,
      y: y0 + Math.cos(t * Math.PI * 5) * 22,
      pressure: 0.65,
      timestamp: 1000 + i * 12,
    });
  }
  return pts;
}

function drawStroke(brush: BrushType, color: string, size: number, opacity: number, points: Point[]) {
  const config: StrokeSessionConfig = { brushType: brush, color, size, opacity };
  const preset = getBrushPreset(brush);
  const { stamps } = StrokeSession.processFullStroke(config, points);
  layerManager.clearActiveStrokeFBO();
  engine.renderStamps(stamps, {
    brushType: brush,
    preset,
    isEraser: false,
    dpr: 1,
  });
  engine.mergeActiveStrokeToLayer('lab', false, opacity, preset.wetEdge);
}

/** Long stroke whose pressure fades to nearly nothing — exposes dab separation. */
function fadeOut(x0: number, y0: number, w: number): Point[] {
  const pts: Point[] = [];
  const n = 120;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({
      x: x0 + t * w,
      y: y0 + Math.sin(t * Math.PI * 3) * 14,
      pressure: Math.max(0.03, 1 - t),
      timestamp: 1000 + i * 8,
    });
  }
  return pts;
}

/** Slow tight loops — exposes stamp seams and self-overlap banding on curves. */
function loops(x0: number, y0: number): Point[] {
  const pts: Point[] = [];
  const n = 140;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({
      x: x0 + t * 260 + Math.cos(t * Math.PI * 8) * 34,
      y: y0 + Math.sin(t * Math.PI * 8) * 34,
      pressure: 0.55,
      timestamp: 1000 + i * 14,
    });
  }
  return pts;
}

const COLORS: Record<string, string> = {
  Sketching: '#3a3a42',
  Inking: '#1a1a24',
  Painting: '#b4432c',
  Airbrushing: '#2c5cb4',
};

const labels = document.getElementById('labels')!;

BRUSHES.forEach((brush, i) => {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x = 20 + col * CELL_W;
  const y = 20 + row * CELL_H;

  const group = BRUSH_GROUPS.find(g => (g.ids as string[]).includes(brush))!;
  const color = COLORS[group.label.split(' ')[0]] ?? '#333';
  const preset = getBrushPreset(brush);

  if (DIAG) {
    drawStroke(brush, color, 60, 1, fadeOut(x + 10, y + 70, 620));
    drawStroke(brush, color, 34, 0.9, loops(x + 700, y + 80));
    drawStroke(brush, color, 44, 0.6, sCurve(x + 700, y + 170, 400, i));
    // Small-size strokes: dab separation is most visible at default sizes.
    drawStroke(brush, color, 10, 1, fadeOut(x + 10, y + 165, 420));
    drawStroke(brush, color, 8, 1, sCurve(x + 450, y + 175, 220, i * 1.3));
  } else {
    drawStroke(brush, color, 42, 1, sCurve(x + 10, y + 55, 360, i * 0.7));
    drawStroke(brush, color, 26, 1, flick(x + 395, y + 105, 90));
    drawStroke(brush, color, 18, 0.85, scribble(x + 505, y + 75));
  }

  const div = document.createElement('div');
  div.className = 'label';
  div.style.left = `${x + 10}px`;
  div.style.top = `${y + 128}px`;
  div.textContent = `${preset.name} (${brush})`;
  labels.appendChild(div);
});

// ---- Wet-blending speed test (diag mode) ----
// A red paint bed, then blue oil-paint strokes dragged through it: the slow
// stroke should pull red along and blend; the fast one should stay blue.
if (DIAG) {
  const bx = 30;
  const by = 20 + ROWS * CELL_H + 30;

  const line = (x0: number, y0: number, w: number, dtMs: number, n = 110): Point[] =>
    Array.from({ length: n + 1 }, (_, i) => ({
      x: x0 + (w * i) / n,
      y: y0 + Math.sin((i / n) * Math.PI * 2) * 8,
      pressure: 0.75,
      timestamp: 1000 + i * dtMs,
    }));

  // Red paint bed (two fat marker passes)
  drawStroke('marker', '#c03028', 110, 1, line(bx, by + 70, 1150, 8, 60));
  drawStroke('marker', '#a02820', 110, 1, line(bx, by + 130, 1150, 8, 60));

  const wet: WetMixSettings = getBrushPreset('oil_paint').wetMixDefault!;
  const labLayer: Layer[] = [{ id: 'lab', name: 'lab', visible: true, opacity: 1, strokes: [] }];

  const drawWetStroke = (color: string, points: Point[]) => {
    const sampler = engine.createWetMixSampler(labLayer, 1);
    const config: StrokeSessionConfig = {
      brushType: 'oil_paint', color, size: 40, opacity: 1, wetMix: wet,
    };
    const { stamps } = StrokeSession.processFullStroke(config, points, sampler);
    layerManager.clearActiveStrokeFBO();
    engine.renderStamps(stamps, {
      brushType: 'oil_paint', preset: getBrushPreset('oil_paint'), isEraser: false, dpr: 1,
    });
    engine.mergeActiveStrokeToLayer('lab', false, 1, getBrushPreset('oil_paint').wetEdge);
  };

  // SLOW drag through the red bed (25ms/point ≈ 0.35 px/ms) — should blend.
  drawWetStroke('#2c50b4', line(bx + 40, by + 70, 1000, 25));
  // FAST flick through the red bed (3ms/point ≈ 3 px/ms) — should stay blue.
  drawWetStroke('#2c50b4', line(bx + 40, by + 130, 1000, 3));

  const label = document.createElement('div');
  label.className = 'label';
  label.style.left = `${bx}px`;
  label.style.top = `${by + 170}px`;
  label.textContent = 'Wet blending: top = slow stroke (blends), bottom = fast stroke (clean)';
  labels.appendChild(label);
}

// Composite: white paper background, then the layer.
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
gl.viewport(0, 0, W, H);
gl.clearColor(0.99, 0.985, 0.975, 1);
gl.clear(gl.COLOR_BUFFER_BIT);

// Dark backing behind the glow cell — additive brushes are invisible on white.
const glowIdx = BRUSHES.indexOf('glow');
if (glowIdx >= 0) {
  const gx = 20 + (glowIdx % COLS) * CELL_W;
  const gy = 20 + Math.floor(glowIdx / COLS) * CELL_H;
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(gx, H - gy - (CELL_H - 30), CELL_W - 10, CELL_H - 30);
  gl.clearColor(0.07, 0.07, 0.1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.SCISSOR_TEST);
}

const fbo = layerManager.getLayerFBO('lab')!;
engine.renderFBOToTarget(fbo, null, 1);

(document.body as HTMLBodyElement).dataset.labDone = 'true';
(window as unknown as { labDone: boolean }).labDone = true;
