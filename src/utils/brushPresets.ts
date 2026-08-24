/**
 * Brush Preset Library - data-driven brush definitions for the stroke engine.
 *
 * Every brush (built-in or custom) is normalized into an EngineBrushPreset,
 * so the stroke engine and GL renderer have a single, uniform parameter space.
 */

import { BrushType, WetMixSettings } from '@/types/drawing';
import { CustomBrushPreset, PressureCurve, PRESSURE_CURVE_PRESETS } from '@/types/customBrush';

/** Procedural tip texture families the generator knows how to bake. */
export type TipKind =
  | 'soft'        // gaussian-ish round, hardness controls falloff
  | 'hard'        // crisp AA circle
  | 'bristle'     // clustered strand dots (paint brushes)
  | 'rake'        // parallel streaks along X (markers, calligraphy)
  | 'granular'    // charcoal/chalk/pastel blob with eroded edges
  | 'spray'       // sparse airbrush speckle
  | 'flat';       // hard ellipse (chisel)

export interface TipSpec {
  kind: TipKind;
  /** 0-1, edge sharpness. */
  hardness: number;
  /** width/height stretch applied along the stroke direction. */
  aspectRatio: number;
  /** fixed tip rotation in radians (on top of stroke-follow). */
  angle: number;
  /** strand/particle count for bristle/rake/spray tips. */
  count?: number;
  /** 0-1 irregularity for bristle/granular tips. */
  variation?: number;
}

export interface EngineBrushPreset {
  id: string;
  name: string;
  tip: TipSpec;

  /** Stamp spacing as a fraction of brush size (0.02 = very dense). */
  spacing: number;
  /** Absolute spacing floor in px so tiny brushes stay cheap. Spacing is otherwise relative to size. */
  minSpacingPx: number;

  /** Paper grain: 0 = none. Scale is in canvas-space texels (bigger = coarser grain). */
  grainAmount: number;
  grainScale: number;
  /** If true, grain reveals with pressure like graphite on paper tooth. */
  pressureTooth: boolean;

  /** Random per-stamp jitter (deterministic per stroke). */
  scatter: number;         // position, in units of stamp size
  sizeJitter: number;      // 0-1
  opacityJitter: number;   // 0-1
  rotationJitter: number;  // radians max deviation

  /** How the tip rotates. */
  rotationMode: 'follow' | 'fixed' | 'random';

  /** Pressure response: output = lerp(min, max, curve(pressure)). */
  pressureSize: [number, number];
  pressureOpacity: [number, number];
  pressureCurve: PressureCurve;

  /** Velocity response: 0 = none, positive thins/fades fast strokes. */
  velocitySize: number;
  velocityOpacity: number;

  /** Tilt (Apple Pencil) response. */
  tiltSize: number;      // extra size when flat (0 = none, 1 = up to 2x)
  tiltOpacity: number;   // opacity reduction when flat
  tiltShading: boolean;  // orient tip along tilt azimuth when flat

  /** Taper lengths in multiples of brush size (applied via two-pass finalize). */
  taperStart: number;
  taperEnd: number;

  /**
   * Flow: target coverage a single pass of the stroke converges to (0-1).
   * Per-stamp alpha is overlap-normalized from this, so density is invariant
   * to brush size and spacing. The brush "opacity" slider is applied when the
   * finished stroke is composited onto the layer (Procreate glaze model).
   */
  flow: number;

  /** Per-stamp color dynamics (Procreate-style). */
  valueJitter: number;       // 0-1 random lighten/darken per stamp
  saturationJitter: number;  // 0-1 random desaturation per stamp

  /**
   * Wet-edge strength 0-1: darkens the stroke's spatial edges at composite
   * time, like pigment pooling at the boundary of a watercolor/marker stroke.
   */
  wetEdge: number;

  /** Input smoothing 0-1 (streamline). Higher = smoother, laggier line. */
  smoothing: number;

  /** Additive blending for glow-style brushes. */
  blend: 'normal' | 'add';

  /** Default wet-mix behavior when the user enables mixing. */
  wetMixDefault?: WetMixSettings;
}

const LINEAR = PRESSURE_CURVE_PRESETS.linear;

const base: Omit<EngineBrushPreset, 'id' | 'name' | 'tip'> = {
  spacing: 0.05,
  minSpacingPx: 0.4,
  grainAmount: 0,
  grainScale: 0.008,
  pressureTooth: false,
  scatter: 0,
  sizeJitter: 0,
  opacityJitter: 0,
  rotationJitter: 0,
  rotationMode: 'follow',
  pressureSize: [0.3, 1],
  pressureOpacity: [0.7, 1],
  pressureCurve: LINEAR,
  velocitySize: 0,
  velocityOpacity: 0,
  tiltSize: 0,
  tiltOpacity: 0,
  tiltShading: false,
  taperStart: 1.5,
  taperEnd: 1.5,
  flow: 1,
  valueJitter: 0,
  saturationJitter: 0,
  wetEdge: 0,
  smoothing: 0.35,
  blend: 'normal',
};

const preset = (
  id: string,
  name: string,
  tip: TipSpec,
  overrides: Partial<EngineBrushPreset>
): EngineBrushPreset => ({ ...base, id, name, tip, ...overrides });

/**
 * Built-in brush presets. The first ten ids match the legacy BrushType values
 * so existing saved projects render with the closest new equivalent.
 */
export const BRUSH_PRESETS: Record<string, EngineBrushPreset> = {
  // ---- Legacy-compatible brushes ----
  pencil: preset('pencil', 'Pencil (HB)', { kind: 'granular', hardness: 0.62, aspectRatio: 1, angle: 0, variation: 0.4 }, {
    spacing: 0.03,
    grainAmount: 0.85, grainScale: 0.03, pressureTooth: true,
    pressureSize: [0.7, 1], pressureOpacity: [0.12, 0.95],
    pressureCurve: {
      points: [{ x: 0, y: 0.06 }, { x: 0.25, y: 0.2 }, { x: 0.55, y: 0.5 }, { x: 0.85, y: 0.82 }, { x: 1, y: 1 }],
    },
    velocityOpacity: 0.25,
    tiltSize: 1.2, tiltOpacity: 0.45, tiltShading: true,
    sizeJitter: 0.18, opacityJitter: 0.25, scatter: 0.02, rotationJitter: 0.25,
    flow: 0.8, taperStart: 2, taperEnd: 2.5, smoothing: 0.3,
    valueJitter: 0.04,
  }),
  pen: preset('pen', 'Studio Pen', { kind: 'hard', hardness: 0.92, aspectRatio: 1, angle: 0 }, {
    spacing: 0.02,
    pressureSize: [0.35, 1], pressureOpacity: [1, 1],
    velocitySize: 0.12,
    taperStart: 1.2, taperEnd: 2.2, smoothing: 0.45,
  }),
  paintbrush: preset('paintbrush', 'Round Brush', { kind: 'bristle', hardness: 0.45, aspectRatio: 1, angle: 0, count: 20, variation: 0.35 }, {
    spacing: 0.035,
    grainAmount: 0.12, grainScale: 0.02,
    pressureSize: [0.45, 1], pressureOpacity: [0.75, 1],
    velocitySize: 0.15,
    sizeJitter: 0.08, opacityJitter: 0.06, rotationJitter: 0.06,
    flow: 0.95, taperStart: 1, taperEnd: 1.4,
    wetMixDefault: { dilution: 0.35, charge: 0.8, pull: 0.25 },
    valueJitter: 0.08, saturationJitter: 0.06,
  }),
  charcoal: preset('charcoal', 'Charcoal Stick', { kind: 'granular', hardness: 0.3, aspectRatio: 1.4, angle: 0.3, variation: 0.7 }, {
    spacing: 0.045,
    grainAmount: 0.95, grainScale: 0.014, pressureTooth: true,
    pressureSize: [0.6, 1], pressureOpacity: [0.35, 1],
    tiltSize: 0.9, tiltOpacity: 0.3, tiltShading: true,
    scatter: 0.1, sizeJitter: 0.22, opacityJitter: 0.35, rotationJitter: 0.5,
    flow: 0.95, smoothing: 0.25,
    valueJitter: 0.06,
  }),
  fountain_pen: preset('fountain_pen', 'Fountain Pen', { kind: 'hard', hardness: 0.8, aspectRatio: 2.2, angle: -0.7 }, {
    spacing: 0.015,
    rotationMode: 'fixed',
    pressureSize: [0.3, 0.85], pressureOpacity: [0.9, 1],
    velocitySize: 0.3,
    taperStart: 1.5, taperEnd: 3, smoothing: 0.5,
  }),
  oil_paint: preset('oil_paint', 'Oil Paint', { kind: 'bristle', hardness: 0.35, aspectRatio: 1.25, angle: 0, count: 10, variation: 0.45 }, {
    spacing: 0.04,
    grainAmount: 0.22, grainScale: 0.03,
    pressureSize: [0.55, 1], pressureOpacity: [0.85, 1],
    pressureCurve: PRESSURE_CURVE_PRESETS.heavy ?? LINEAR,
    sizeJitter: 0.1, opacityJitter: 0.08, rotationJitter: 0.1,
    flow: 0.92, taperStart: 0.6, taperEnd: 0.8,
    wetMixDefault: { dilution: 0.5, charge: 0.7, pull: 0.4 },
    valueJitter: 0.12, saturationJitter: 0.08,
  }),
  acrylic: preset('acrylic', 'Acrylic', { kind: 'bristle', hardness: 0.5, aspectRatio: 1, angle: 0, count: 16, variation: 0.3 }, {
    spacing: 0.035,
    grainAmount: 0.1, grainScale: 0.025,
    pressureSize: [0.5, 1], pressureOpacity: [0.9, 1],
    sizeJitter: 0.06, opacityJitter: 0.05,
    flow: 0.96, taperStart: 0.6, taperEnd: 0.8,
    wetMixDefault: { dilution: 0.25, charge: 0.85, pull: 0.2 },
    valueJitter: 0.07, saturationJitter: 0.04,
  }),
  watercolor: preset('watercolor', 'Watercolor', { kind: 'soft', hardness: 0.22, aspectRatio: 1, angle: 0 }, {
    spacing: 0.05,
    grainAmount: 0.5, grainScale: 0.02,
    pressureSize: [0.6, 1.15], pressureOpacity: [0.25, 0.7],
    pressureCurve: PRESSURE_CURVE_PRESETS.lightTouch ?? LINEAR,
    velocityOpacity: 0.3,
    sizeJitter: 0.12, opacityJitter: 0.15, scatter: 0.03,
    flow: 0.4, taperStart: 0.8, taperEnd: 1.2, smoothing: 0.4,
    wetMixDefault: { dilution: 0.65, charge: 0.5, pull: 0.35 },
    valueJitter: 0.1, saturationJitter: 0.12,
    wetEdge: 0.7,
  }),
  marker: preset('marker', 'Flat Marker', { kind: 'rake', hardness: 0.75, aspectRatio: 1, angle: 0, count: 5, variation: 0.25 }, {
    spacing: 0.025,
    pressureSize: [0.85, 1], pressureOpacity: [0.9, 1],
    flow: 0.85, taperStart: 0.2, taperEnd: 0.2, smoothing: 0.4,
    wetEdge: 0.25,
  }),

  // ---- New brushes ----
  technical_pen: preset('technical_pen', 'Technical Pen', { kind: 'hard', hardness: 0.98, aspectRatio: 1, angle: 0 }, {
    spacing: 0.02,
    pressureSize: [1, 1], pressureOpacity: [1, 1],
    taperStart: 0, taperEnd: 0, smoothing: 0.55,
  }),
  gel_pen: preset('gel_pen', 'Gel Pen', { kind: 'hard', hardness: 0.88, aspectRatio: 1, angle: 0 }, {
    spacing: 0.02,
    pressureSize: [0.6, 1], pressureOpacity: [0.95, 1],
    taperStart: 0.8, taperEnd: 1.5, smoothing: 0.5,
  }),
  ink_brush: preset('ink_brush', 'Ink Brush', { kind: 'soft', hardness: 0.65, aspectRatio: 1, angle: 0 }, {
    spacing: 0.02,
    pressureSize: [0.1, 1.25], pressureOpacity: [0.85, 1],
    velocitySize: 0.35,
    taperStart: 2.5, taperEnd: 4, smoothing: 0.55,
    wetEdge: 0.15,
  }),
  calligraphy: preset('calligraphy', 'Calligraphy', { kind: 'flat', hardness: 0.9, aspectRatio: 3.2, angle: -0.6 }, {
    spacing: 0.015,
    rotationMode: 'fixed',
    pressureSize: [0.55, 1.1], pressureOpacity: [1, 1],
    taperStart: 0.4, taperEnd: 1, smoothing: 0.5,
  }),
  pencil_6b: preset('pencil_6b', 'Soft Pencil (6B)', { kind: 'granular', hardness: 0.4, aspectRatio: 1.2, angle: 0, variation: 0.6 }, {
    spacing: 0.03,
    grainAmount: 0.75, grainScale: 0.022, pressureTooth: true,
    pressureSize: [0.6, 1.1], pressureOpacity: [0.25, 1],
    tiltSize: 1.4, tiltOpacity: 0.4, tiltShading: true,
    sizeJitter: 0.2, opacityJitter: 0.25, scatter: 0.05, rotationJitter: 0.3,
    flow: 0.95, taperStart: 1.5, taperEnd: 2, smoothing: 0.3,
    valueJitter: 0.05,
  }),
  crayon: preset('crayon', 'Crayon', { kind: 'granular', hardness: 0.6, aspectRatio: 1.1, angle: 0, variation: 0.65 }, {
    spacing: 0.04,
    grainAmount: 1, grainScale: 0.016, pressureTooth: true,
    pressureSize: [0.75, 1], pressureOpacity: [0.4, 0.95],
    sizeJitter: 0.15, opacityJitter: 0.3, scatter: 0.06, rotationJitter: 0.4,
    flow: 0.95, taperStart: 0.4, taperEnd: 0.4, smoothing: 0.25,
    valueJitter: 0.06,
  }),
  chalk: preset('chalk', 'Chalk', { kind: 'granular', hardness: 0.35, aspectRatio: 1.3, angle: 0.2, variation: 0.7 }, {
    spacing: 0.045,
    grainAmount: 0.95, grainScale: 0.01, pressureTooth: true,
    pressureSize: [0.7, 1], pressureOpacity: [0.35, 0.9],
    tiltSize: 0.8, tiltShading: true,
    sizeJitter: 0.2, opacityJitter: 0.35, scatter: 0.08, rotationJitter: 0.5,
    flow: 0.75, smoothing: 0.25,
    valueJitter: 0.08,
  }),
  soft_pastel: preset('soft_pastel', 'Soft Pastel', { kind: 'granular', hardness: 0.25, aspectRatio: 1.2, angle: 0, variation: 0.55 }, {
    spacing: 0.05,
    grainAmount: 0.6, grainScale: 0.013, pressureTooth: true,
    pressureSize: [0.7, 1.05], pressureOpacity: [0.3, 0.85],
    tiltSize: 1, tiltShading: true,
    sizeJitter: 0.15, opacityJitter: 0.2, scatter: 0.05,
    flow: 0.8, smoothing: 0.3,
    wetMixDefault: { dilution: 0.3, charge: 0.7, pull: 0.45 },
    valueJitter: 0.1, saturationJitter: 0.08,
  }),
  airbrush_soft: preset('airbrush_soft', 'Soft Airbrush', { kind: 'soft', hardness: 0.05, aspectRatio: 1, angle: 0 }, {
    spacing: 0.05,
    pressureSize: [0.8, 1], pressureOpacity: [0.05, 0.55],
    flow: 0.12, taperStart: 0, taperEnd: 0, smoothing: 0.35,
  }),
  airbrush_hard: preset('airbrush_hard', 'Hard Airbrush', { kind: 'soft', hardness: 0.7, aspectRatio: 1, angle: 0 }, {
    spacing: 0.05,
    pressureSize: [0.6, 1], pressureOpacity: [0.3, 0.9],
    flow: 0.75, taperStart: 0.5, taperEnd: 0.5,
  }),
  spray_paint: preset('spray_paint', 'Spray Paint', { kind: 'spray', hardness: 0.4, aspectRatio: 1, angle: 0, count: 90, variation: 0.8 }, {
    spacing: 0.14,
    rotationMode: 'random',
    pressureSize: [0.85, 1.1], pressureOpacity: [0.3, 0.8],
    scatter: 0.12, sizeJitter: 0.3, opacityJitter: 0.4, rotationJitter: Math.PI,
    flow: 0.85, taperStart: 0, taperEnd: 0, smoothing: 0.3,
  }),
  splatter: preset('splatter', 'Splatter', { kind: 'spray', hardness: 0.7, aspectRatio: 1, angle: 0, count: 3, variation: 1 }, {
    spacing: 0.5, minSpacingPx: 6,
    rotationMode: 'random',
    pressureSize: [0.6, 1.4], pressureOpacity: [0.7, 1],
    scatter: 0.9, sizeJitter: 0.8, opacityJitter: 0.5, rotationJitter: Math.PI,
    flow: 0.95, taperStart: 0, taperEnd: 0, smoothing: 0.2,
  }),
  glow: preset('glow', 'Glow', { kind: 'soft', hardness: 0.2, aspectRatio: 1, angle: 0 }, {
    spacing: 0.05,
    pressureSize: [0.5, 1], pressureOpacity: [0.15, 0.6],
    flow: 0.3, blend: 'add', taperStart: 1, taperEnd: 1.5, smoothing: 0.45,
  }),
};

/** Display order + grouping for pickers. */
export const BRUSH_GROUPS: Array<{ label: string; ids: string[] }> = [
  { label: 'Sketching', ids: ['pencil', 'pencil_6b', 'charcoal', 'chalk', 'crayon', 'soft_pastel'] },
  { label: 'Inking', ids: ['pen', 'technical_pen', 'gel_pen', 'ink_brush', 'fountain_pen', 'calligraphy'] },
  { label: 'Painting', ids: ['paintbrush', 'oil_paint', 'acrylic', 'watercolor'] },
  { label: 'Airbrushing', ids: ['airbrush_soft', 'airbrush_hard', 'spray_paint', 'splatter', 'marker', 'glow'] },
];

const DEFAULT_PRESET = BRUSH_PRESETS.paintbrush;

export function getBrushPreset(brushType: BrushType | string): EngineBrushPreset {
  return BRUSH_PRESETS[brushType] ?? DEFAULT_PRESET;
}

/**
 * Normalize a user-authored custom brush into the engine parameter space.
 */
export function presetFromCustomBrush(custom: CustomBrushPreset): EngineBrushPreset {
  const shape = custom.shape ?? ({} as CustomBrushPreset['shape']);
  const stroke = custom.stroke ?? ({} as CustomBrushPreset['stroke']);
  const dynamics = custom.dynamics ?? ({} as CustomBrushPreset['dynamics']);
  const texture = custom.texture ?? ({} as CustomBrushPreset['texture']);
  const color = custom.color ?? ({} as CustomBrushPreset['color']);

  const baseType: string = shape?.baseType ?? 'round';
  const tipKind: TipKind =
    baseType === 'bristle' || baseType === 'pencil_bristle' ? 'bristle'
    : baseType === 'scatter' ? 'granular'
    : baseType === 'flat' ? 'flat'
    : 'soft';

  const pressureSensitivity = dynamics?.pressureSensitivity ?? 0.8;
  const affectsSize = dynamics?.pressureAffects?.includes('size') ?? true;
  const affectsOpacity = dynamics?.pressureAffects?.includes('opacity') ?? false;
  const taper = stroke?.taper;

  return preset(`custom:${custom.id}`, custom.name ?? 'Custom Brush', {
    kind: tipKind,
    hardness: shape?.roundness ?? 0.5,
    aspectRatio: shape?.aspectRatio ?? 1,
    angle: shape?.angle ?? 0,
    count: texture?.bristleCount ?? 12,
    variation: texture?.bristleVariation ?? 0.3,
  }, {
    spacing: Math.max(0.02, (stroke?.spacing ?? 10) / 100),
    grainAmount: texture?.grain ?? 0,
    grainScale: 0.015 * (texture?.noiseScale ?? 1),
    pressureTooth: (texture?.grain ?? 0) > 0.3,
    scatter: stroke?.jitter?.position ?? 0,
    sizeJitter: stroke?.jitter?.size ?? 0,
    opacityJitter: stroke?.jitter?.opacity ?? 0,
    rotationJitter: (stroke?.jitter?.rotation ?? 0) * Math.PI,
    pressureSize: affectsSize ? [1 - pressureSensitivity * 0.8, 1] : [1, 1],
    pressureOpacity: affectsOpacity ? [1 - pressureSensitivity * 0.8, 1] : [1, 1],
    pressureCurve: dynamics?.pressureCurve ?? LINEAR,
    velocitySize: (dynamics?.velocityAffects?.includes('size') ? dynamics?.velocitySensitivity ?? 0 : 0) * 0.5,
    velocityOpacity: (dynamics?.velocityAffects?.includes('opacity') ? dynamics?.velocitySensitivity ?? 0 : 0) * 0.5,
    taperStart: taper ? (taper.startSize ?? 0) * ((taper.tipLength ?? 10) / 10) * 2 : 0,
    taperEnd: taper ? (taper.endSize ?? 0) * ((taper.tipLength ?? 10) / 10) * 2 : 0,
    flow: color?.flowRate ?? 0.85,
  });
}
