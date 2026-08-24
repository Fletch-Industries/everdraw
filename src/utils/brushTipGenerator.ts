/**
 * Brush tip & paper grain texture generation.
 *
 * Tips are isotropic grayscale alpha masks baked once per brush and uploaded
 * to WebGL; stamp aspect ratio and rotation are applied in the vertex shader.
 * Paper grain is a single tileable noise texture shared by all grainy brushes,
 * sampled in canvas space so texture is continuous across strokes.
 */

import { BrushType } from '@/types/drawing';
import { CustomBrushPreset } from '@/types/customBrush';
import { TipSpec, getBrushPreset, presetFromCustomBrush } from './brushPresets';

const TIP_SIZE = 128;
const GRAIN_SIZE = 256;

export interface BrushTipTexture {
  canvas: HTMLCanvasElement;
  imageData: ImageData;
}

// Deterministic hash noise
const hashNoise = (x: number, y: number): number => {
  let h = (x | 0) * 0x85ebca6b ^ (y | 0) * 0xc2b2ae35;
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
  h ^= h >>> 15;
  return (h >>> 0) / 0xffffffff;
};

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Tileable value noise with lattice period `period`. */
const tileableNoise = (x: number, y: number, period: number): number => {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const w = (i: number) => ((i % period) + period) % period;
  const n00 = hashNoise(w(xi), w(yi));
  const n10 = hashNoise(w(xi + 1), w(yi));
  const n01 = hashNoise(w(xi), w(yi + 1));
  const n11 = hashNoise(w(xi + 1), w(yi + 1));
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  return (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy;
};

const tileableFbm = (x: number, y: number, period: number, octaves: number): number => {
  let value = 0, amplitude = 0.5, freq = 1, max = 0;
  for (let i = 0; i < octaves; i++) {
    value += tileableNoise(x * freq, y * freq, period * freq) * amplitude;
    max += amplitude;
    amplitude *= 0.5;
    freq *= 2;
  }
  return value / max;
};

const makeCanvas = (size: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
};

/** Fill a tip canvas from a per-pixel alpha function (0-1). */
const rasterizeTip = (size: number, alphaAt: (nx: number, ny: number, d: number) => number): BrushTipTexture => {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - c) / c;   // -1..1
      const ny = (y - c) / c;
      const d = Math.hypot(nx, ny);
      const a = Math.max(0, Math.min(1, alphaAt(nx, ny, d)));
      const i = (y * size + x) * 4;
      const v = Math.round(a * 255);
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = v;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, imageData: img };
};

/** Round tip with hardness-controlled falloff. */
const roundFalloff = (hardness: number) => {
  const inner = Math.max(0, Math.min(0.98, hardness * 0.96));
  return (d: number): number => {
    if (d >= 1) return 0;
    if (d <= inner) return 1;
    const t = (d - inner) / (1 - inner);
    // Softer-than-linear tail for gentle stamp accumulation
    const s = 1 - t * t * (3 - 2 * t);
    return hardness < 0.3 ? s * s : s;
  };
};

function generateTip(tip: TipSpec, size: number = TIP_SIZE): BrushTipTexture {
  const hardness = tip.hardness;
  const count = tip.count ?? 12;
  const variation = tip.variation ?? 0.3;

  switch (tip.kind) {
    case 'hard':
    case 'flat': {
      const fall = roundFalloff(Math.max(hardness, 0.85));
      return rasterizeTip(size, (_x, _y, d) => fall(d));
    }

    case 'soft': {
      // True gaussian falloff: solid core sized by hardness, gaussian tail
      // windowed to zero at the tip edge. This is what makes airbrushes and
      // watercolor bodies feel airy instead of ringed.
      const core = Math.max(0, hardness * 0.85);
      const sigma = Math.max(0.08, (1 - core) * 0.42);
      const edgeValue = Math.exp(-Math.pow((1 - core) / sigma, 2));
      return rasterizeTip(size, (_x, _y, d) => {
        if (d >= 1) return 0;
        if (d <= core) return 1;
        const g = Math.exp(-Math.pow((d - core) / sigma, 2));
        return Math.max(0, (g - edgeValue) / (1 - edgeValue));
      });
    }

    case 'bristle': {
      // Directional bristles: wavy strands running along X (the stroke
      // direction after rotation), inside a soft round body. Reads as paint
      // dragged by a loaded brush rather than a cloud of dots.
      const strands: Array<{ y: number; w: number; a: number; freq: number; phase: number; amp: number; len: number }> = [];
      for (let i = 0; i < count; i++) {
        strands.push({
          y: (hashNoise(i, 1) - 0.5) * 1.7,
          w: 0.045 + hashNoise(i, 2) * 0.11 * (1 + variation),
          a: 0.35 + hashNoise(i, 3) * 0.65,
          freq: 1.5 + hashNoise(i, 4) * 3,
          phase: hashNoise(i, 5) * Math.PI * 2,
          amp: hashNoise(i, 6) * 0.12 * (1 + variation),
          len: 0.75 + hashNoise(i, 7) * 0.25,
        });
      }
      const base = roundFalloff(Math.min(0.55, hardness));
      return rasterizeTip(size, (nx, ny, d) => {
        if (d >= 1) return 0;
        const window = base(d);
        let a = window * 0.30; // soft paint body
        for (const s of strands) {
          if (Math.abs(nx) > s.len) continue;
          const yc = s.y + Math.sin(nx * s.freq + s.phase) * s.amp;
          const sd = Math.abs(ny - yc) / s.w;
          if (sd < 1) a += (1 - sd * sd) * s.a * 0.75;
        }
        return Math.min(1, a) * window;
      });
    }

    case 'rake': {
      // Parallel streaks along X (the stroke direction after rotation).
      const rows: Array<{ y: number; w: number; a: number }> = [];
      for (let i = 0; i < count; i++) {
        rows.push({
          y: (i / Math.max(1, count - 1) - 0.5) * 1.7,
          w: 0.1 + hashNoise(i, 11) * 0.2 * (1 + variation),
          a: 0.65 + hashNoise(i, 12) * 0.35,
        });
      }
      const fall = roundFalloff(hardness);
      return rasterizeTip(size, (_nx, ny, d) => {
        let a = fall(d) * 0.4;
        for (const r of rows) {
          const rd = Math.abs(ny - r.y) / r.w;
          if (rd < 1) a += (1 - rd * rd) * r.a * 0.7;
        }
        return Math.min(1, a) * fall(d);
      });
    }

    case 'granular': {
      // Charcoal/pencil/chalk blob: fbm-eroded edge + internal granulation.
      const fall = roundFalloff(hardness * 0.7);
      const freq = 5 + variation * 6;
      return rasterizeTip(size, (nx, ny, d) => {
        const n = tileableFbm((nx + 1) * freq, (ny + 1) * freq, freq * 2, 3);
        const edge = fall(d) * smoothstep(0.15, 0.6, fall(d) + (n - 0.5) * 0.9);
        const body = 0.55 + n * 0.45;
        return edge * body;
      });
    }

    case 'spray': {
      // High counts = fine aerosol speckle; low counts = discrete splatter blobs.
      const fineSpray = count > 20;
      const dots: Array<{ x: number; y: number; r: number; a: number }> = [];
      for (let i = 0; i < count; i++) {
        const ang = hashNoise(i, 21) * Math.PI * 2;
        const dist = Math.sqrt(hashNoise(i, 22)) * 0.92;
        dots.push({
          x: Math.cos(ang) * dist,
          y: Math.sin(ang) * dist,
          r: fineSpray
            ? 0.012 + Math.pow(hashNoise(i, 23), 2) * 0.05 * (1 + variation)
            : 0.09 + Math.pow(hashNoise(i, 23), 2) * 0.3 * (1 + variation),
          a: 0.4 + hashNoise(i, 24) * 0.6,
        });
      }
      return rasterizeTip(size, (nx, ny, d) => {
        if (d >= 1) return 0;
        let a = 0;
        for (const s of dots) {
          const sd = Math.hypot(nx - s.x, ny - s.y) / s.r;
          if (sd < 1) a = Math.max(a, (1 - sd * sd) * s.a);
        }
        return a;
      });
    }
  }
}

// ------------------------------------------------------------------- caching

const tipCache = new Map<string, BrushTipTexture>();

const tipCacheKey = (tip: TipSpec): string =>
  `${tip.kind}:${tip.hardness}:${tip.count ?? 0}:${tip.variation ?? 0}`;

export function getBrushTipTexture(
  brushType: BrushType | string,
  customBrush?: CustomBrushPreset
): BrushTipTexture {
  const preset = customBrush ? presetFromCustomBrush(customBrush) : getBrushPreset(brushType);
  const key = tipCacheKey(preset.tip);
  let texture = tipCache.get(key);
  if (!texture) {
    texture = generateTip(preset.tip);
    tipCache.set(key, texture);
  }
  return texture;
}

export function clearBrushTipCache(): void {
  tipCache.clear();
}

/** Tileable paper-grain texture (generated once, shared by all brushes). */
let grainCanvas: HTMLCanvasElement | null = null;

export function getGrainTexture(): HTMLCanvasElement {
  if (grainCanvas) return grainCanvas;
  const size = GRAIN_SIZE;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const period = 8;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * period;
      const v = (y / size) * period;
      const n = tileableFbm(u, v, period, 4);
      const fine = tileableNoise(u * 6, v * 6, period * 6);
      const g = Math.round(Math.max(0, Math.min(1, n * 0.75 + fine * 0.25)) * 255);
      const i = (y * size + x) * 4;
      data[i] = g; data[i + 1] = g; data[i + 2] = g; data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  grainCanvas = canvas;
  return canvas;
}

// -------------------------------------------------------------- GL uploading

export function uploadBrushTipToGL(
  gl: WebGL2RenderingContext,
  texture: BrushTipTexture
): WebGLTexture | null {
  const glTexture = gl.createTexture();
  if (!glTexture) return null;

  gl.bindTexture(gl.TEXTURE_2D, glTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture.canvas);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return glTexture;
}

export function uploadGrainToGL(gl: WebGL2RenderingContext): WebGLTexture | null {
  const glTexture = gl.createTexture();
  if (!glTexture) return null;

  gl.bindTexture(gl.TEXTURE_2D, glTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, getGrainTexture());
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return glTexture;
}
