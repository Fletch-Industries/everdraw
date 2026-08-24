/**
 * StrokeSession - deterministic stroke → stamp pipeline.
 *
 * Converts raw pointer input into brush stamps with stabilization, pressure/
 * velocity/tilt dynamics, fixed-spacing arc-length stamping, and taper.
 *
 * Determinism contract: `StrokeSession.processFullStroke(config, points)` is
 * the single source of truth for a stroke's final appearance. Live drawing
 * uses the incremental `processPoint` path for latency, and the stroke is
 * re-rendered through `processFullStroke` on pointer-up (and on undo/redo
 * replay), so the committed pixels always match the replayed pixels.
 */

import { Point, BrushType, WetMixSettings, MixSample } from '@/types/drawing';
import { CustomBrushPreset, PressureCurve } from '@/types/customBrush';
import { EngineBrushPreset, getBrushPreset, presetFromCustomBrush } from './brushPresets';

export type { MixSample };

export interface Stamp {
  x: number;
  y: number;
  size: number;
  pressure: number;
  opacity: number;
  angle: number;
  color: { r: number; g: number; b: number };
  hardness?: number;
  aspectRatio?: number;
}

export interface StrokeSessionConfig {
  brushType: BrushType;
  color: string;
  size: number;
  opacity: number;
  customBrush?: CustomBrushPreset;
  wetMix?: WetMixSettings;
  isEraser?: boolean;
  /** When replaying a stroke, previously recorded wet-mix colors. */
  mixSamples?: MixSample[];
}

/** CPU-side pixel snapshot the session samples for wet mixing. */
export interface PixelSampler {
  width: number;   // physical pixels
  height: number;
  /** RGBA, premultiplied or straight — sampled with alpha weighting. */
  pixels: Uint8Array | Uint8ClampedArray;
  /** canvas-space coordinate * scale = pixel coordinate. */
  scale: number;
  /** If true, pixel rows are bottom-up (gl.readPixels layout). */
  flipY?: boolean;
}

const WHITE = { r: 255, g: 255, b: 255 };

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m
    ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
    : { ...WHITE };
};

/** Deterministic 0-1 hash from two integers. */
const hash2 = (a: number, b: number): number => {
  let h = (a | 0) * 0x85ebca6b ^ (b | 0) * 0xc2b2ae35;
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
  h ^= h >>> 15;
  return (h >>> 0) / 0xffffffff;
};

const applyPressureCurve = (pressure: number, curve: PressureCurve): number => {
  const pts = curve.points;
  if (!pts || pts.length < 2) return pressure;
  const p = Math.max(0, Math.min(1, pressure));
  for (let i = 0; i < pts.length - 1; i++) {
    if (p >= pts[i].x && p <= pts[i + 1].x) {
      const span = pts[i + 1].x - pts[i].x;
      const t = span > 0 ? (p - pts[i].x) / span : 0;
      return pts[i].y + (pts[i + 1].y - pts[i].y) * t;
    }
  }
  return p <= pts[0].x ? pts[0].y : pts[pts.length - 1].y;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const lerpAngle = (a: number, b: number, t: number): number => {
  let diff = b - a;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return a + diff * t;
};

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Mean alpha of a tip along its center chord — how much of a full-coverage
 * disc one stamp is "worth". Used to normalize per-stamp alpha by overlap so
 * a stroke converges to its flow target regardless of size and spacing.
 * Analytic per tip family (must not depend on the DOM so replay stays pure).
 */
const tipDensityFor = (tip: EngineBrushPreset['tip']): number => {
  switch (tip.kind) {
    case 'hard':
    case 'flat':
      return 0.9;
    case 'soft':
      return 0.3 + tip.hardness * 0.5;
    case 'bristle':
      return 0.55;
    case 'rake':
      return 0.6;
    case 'granular':
      return 0.5;
    case 'spray':
      return 0.15;
    default:
      return 0.6;
  }
};

export class StrokeSession {
  private readonly config: StrokeSessionConfig;
  private readonly preset: EngineBrushPreset;
  private readonly baseColor: { r: number; g: number; b: number };
  private readonly seed: number;
  private readonly baseSpacing: number;
  private readonly taperStartLen: number;
  private readonly taperEndLen: number;
  private readonly tipDensity: number;

  /**
   * Distance to the next stamp. Follows the CURRENT dab size (not the base
   * brush size) so light-pressure passages and tapered tips stay contiguous
   * instead of separating into visible dots.
   */
  private currentSpacing: number;

  // Smoothed input state
  private smoothedX = 0;
  private smoothedY = 0;
  private smoothedPressure = 0.5;
  private smoothedAngle = 0;
  private hasAngle = false;
  private smoothedAltitude = Math.PI / 2;
  private tiltAzimuth = 0;

  // Walker state
  private prevRawX = 0;
  private prevRawY = 0;
  private prevAnchorX = 0;
  private prevAnchorY = 0;
  private prevAnchorPressure = 0.5;
  private residual = 0;          // distance walked since last emitted stamp
  private cumulativeDistance = 0;
  private stampIndex = 0;
  private initialized = false;

  // Velocity tracking (px/ms)
  private lastTimestamp = 0;
  private velocity = 0;

  // Wet mixing: the brush carries `pickupAmount` (0-1) of `pickupColor`
  // (canvas paint it has dragged through); the deposited color is
  // lerp(baseColor, pickupColor, pickupAmount). The amount approaches a
  // speed-dependent cap, so a slow drag blends toward equilibrium (never
  // fully losing the brush's own paint) and a fast stroke self-cleans.
  private mixColor: { r: number; g: number; b: number };
  private pickupColor: { r: number; g: number; b: number };
  private pickupAmount = 0;
  private sampler: PixelSampler | null = null;
  private mixSampleInterval: number;
  private distSinceMixSample = 0;
  private recordedMixSamples: MixSample[] = [];
  private replaySamples: MixSample[] | null = null;
  private replaySampleIdx = 0;

  /** When set (full-stroke pass), enables end taper. */
  private knownTotalLength: number | null = null;

  /** Measure-only pass: walk geometry without materializing stamps. */
  private measureOnly = false;

  constructor(config: StrokeSessionConfig) {
    this.config = config;
    this.preset = config.customBrush
      ? presetFromCustomBrush(config.customBrush)
      : getBrushPreset(config.brushType);
    this.baseColor = hexToRgb(config.color);
    this.mixColor = { ...this.baseColor };
    this.pickupColor = { ...this.baseColor };
    this.mixSampleInterval = Math.max(3, config.size * 0.15);
    this.replaySamples = config.mixSamples && config.mixSamples.length > 0 ? config.mixSamples : null;

    // Deterministic per-stroke seed from stable config values.
    this.seed =
      (this.baseColor.r * 7 + this.baseColor.g * 131 + this.baseColor.b * 809 +
        Math.round(config.size * 16) * 2593 + (config.isEraser ? 7919 : 0)) | 0;

    const p = this.preset;
    this.baseSpacing = Math.max(p.minSpacingPx, config.size * p.spacing);
    this.currentSpacing = this.baseSpacing;
    this.taperStartLen = p.taperStart * config.size;
    this.taperEndLen = p.taperEnd * config.size;
    this.tipDensity = tipDensityFor(p.tip);
  }

  getConfig(): StrokeSessionConfig {
    return this.config;
  }

  getPreset(): EngineBrushPreset {
    return this.preset;
  }

  /** Wet-mix colors recorded during this session (store on the stroke for replay). */
  getMixSamples(): MixSample[] {
    return this.recordedMixSamples;
  }

  setSampler(sampler: PixelSampler | null): void {
    this.sampler = sampler;
  }

  /**
   * Process one input point, returning the stamps to render.
   */
  processPoint(point: Point): Stamp[] {
    const stamps: Stamp[] = [];

    if (!this.initialized) {
      this.initialized = true;
      this.smoothedX = point.x;
      this.smoothedY = point.y;
      this.smoothedPressure = point.pressure;
      this.smoothedAltitude = point.altitude ?? Math.PI / 2;
      this.updateTiltAzimuth(point);
      this.prevRawX = point.x;
      this.prevRawY = point.y;
      this.prevAnchorX = point.x;
      this.prevAnchorY = point.y;
      this.prevAnchorPressure = point.pressure;
      this.lastTimestamp = point.timestamp;
      // A tap should leave a mark: emit the first stamp immediately.
      this.updateMixColor(point.x, point.y);
      const first = this.createStamp(point.x, point.y, point.pressure, 0);
      stamps.push(first);
      if (first) {
        this.currentSpacing = Math.max(
          this.preset.minSpacingPx,
          Math.min(this.baseSpacing, first.size * this.preset.spacing)
        );
      }
      return stamps;
    }

    // Velocity
    const dt = Math.max(1, point.timestamp - this.lastTimestamp);
    const rawDx = point.x - this.smoothedX;
    const rawDy = point.y - this.smoothedY;
    const rawDist = Math.hypot(rawDx, rawDy);
    this.velocity = this.velocity * 0.6 + (rawDist / dt) * 0.4;
    this.lastTimestamp = point.timestamp;

    // Stabilization (streamline): EMA toward the raw point. Higher smoothing =
    // lower follow rate. Speed boosts the follow rate so fast flicks don't lag.
    const followBase = 1 - this.preset.smoothing * 0.85;
    const follow = Math.min(0.95, followBase + this.velocity * 0.06);
    this.smoothedX += (point.x - this.smoothedX) * follow;
    this.smoothedY += (point.y - this.smoothedY) * follow;
    this.smoothedPressure += (point.pressure - this.smoothedPressure) * 0.35;

    // Direction
    if (rawDist > 0.05) {
      const rawAngle = Math.atan2(rawDy, rawDx);
      this.smoothedAngle = this.hasAngle ? lerpAngle(this.smoothedAngle, rawAngle, 0.4) : rawAngle;
      this.hasAngle = true;
    }

    // Tilt
    if (point.altitude !== undefined) {
      this.smoothedAltitude += (point.altitude - this.smoothedAltitude) * 0.3;
    }
    this.updateTiltAzimuth(point);

    // Walk a quadratic Bézier from the previous anchor (control = previous raw
    // point) and emit stamps at exact `spacing` intervals.
    const x0 = this.prevAnchorX, y0 = this.prevAnchorY;
    const cx = this.prevRawX, cy = this.prevRawY;
    const x1 = this.smoothedX, y1 = this.smoothedY;
    const p0 = this.prevAnchorPressure;
    const p1 = this.smoothedPressure;

    const approxLen = Math.hypot(x1 - x0, y1 - y0);
    if (approxLen > 0.01) {
      const samples = Math.max(2, Math.min(24, Math.ceil(approxLen / 3)));
      let sx = x0, sy = y0;
      let walked = 0;
      const segTotalEstimate = approxLen; // for pressure interpolation

      for (let s = 1; s <= samples; s++) {
        const t = s / samples;
        const mt = 1 - t;
        const ex = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
        const ey = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
        let segLen = Math.hypot(ex - sx, ey - sy);
        let segX = sx, segY = sy;

        // Emit stamps inside this subsegment
        while (this.residual + segLen >= this.currentSpacing) {
          const spacing = this.currentSpacing;
          const need = spacing - this.residual;
          const f = segLen > 0 ? need / segLen : 0;
          const stampX = segX + (ex - segX) * f;
          const stampY = segY + (ey - segY) * f;
          segX = stampX;
          segY = stampY;
          segLen -= need;
          this.residual = 0;
          walked += need;
          this.cumulativeDistance += spacing;
          this.distSinceMixSample += spacing;

          const progress = Math.min(1, walked / Math.max(1e-3, segTotalEstimate));
          const pressure = lerp(p0, p1, progress);
          this.updateMixColor(stampX, stampY);
          const stamp = this.createStamp(stampX, stampY, pressure, this.cumulativeDistance);
          stamps.push(stamp);

          // Next-stamp spacing follows the dab we just placed.
          if (stamp) {
            this.currentSpacing = Math.max(
              this.preset.minSpacingPx,
              Math.min(this.baseSpacing, stamp.size * this.preset.spacing)
            );
          }
        }

        this.residual += segLen;
        walked += segLen;
        sx = ex;
        sy = ey;
      }
    }

    this.prevAnchorX = this.smoothedX;
    this.prevAnchorY = this.smoothedY;
    this.prevAnchorPressure = this.smoothedPressure;
    this.prevRawX = point.x;
    this.prevRawY = point.y;

    return stamps;
  }

  /**
   * Preview stamps for predicted input without mutating session state.
   * Used to render the low-latency predicted tail (screen-only).
   */
  previewPoints(points: Point[]): Stamp[] {
    if (points.length === 0) return [];
    const snapshot = this.snapshotState();
    const stamps: Stamp[] = [];
    for (const p of points) {
      stamps.push(...this.processPoint(p));
    }
    this.restoreState(snapshot);
    return stamps;
  }

  /**
   * Process an entire stroke deterministically with full taper information.
   * This is THE canonical renderer: used at stroke finalize and for replay.
   */
  static processFullStroke(
    config: StrokeSessionConfig,
    points: Point[],
    sampler?: PixelSampler | null
  ): { stamps: Stamp[]; mixSamples: MixSample[] } {
    if (points.length === 0) return { stamps: [], mixSamples: [] };

    // Pass 1: measure total stroke length (walker geometry, no stamps kept).
    const measure = new StrokeSession(config);
    measure.measureOnly = true;
    for (const p of points) measure.processPoint(p);
    const totalLength = measure.cumulativeDistance + measure.residual;

    // Pass 2: emit stamps with end taper enabled.
    const session = new StrokeSession(config);
    session.knownTotalLength = totalLength;
    if (sampler) session.setSampler(sampler);
    const stamps: Stamp[] = [];
    for (const p of points) stamps.push(...session.processPoint(p));
    return { stamps, mixSamples: session.getMixSamples() };
  }

  // ---------------------------------------------------------------- internals

  private snapshotState() {
    return {
      smoothedX: this.smoothedX, smoothedY: this.smoothedY,
      smoothedPressure: this.smoothedPressure, smoothedAngle: this.smoothedAngle,
      hasAngle: this.hasAngle, smoothedAltitude: this.smoothedAltitude,
      tiltAzimuth: this.tiltAzimuth, hasAzimuth: this.hasAzimuth,
      prevRawX: this.prevRawX, prevRawY: this.prevRawY,
      prevAnchorX: this.prevAnchorX, prevAnchorY: this.prevAnchorY,
      prevAnchorPressure: this.prevAnchorPressure,
      currentSpacing: this.currentSpacing,
      residual: this.residual, cumulativeDistance: this.cumulativeDistance,
      stampIndex: this.stampIndex, initialized: this.initialized,
      lastTimestamp: this.lastTimestamp, velocity: this.velocity,
      mixColor: { ...this.mixColor }, distSinceMixSample: this.distSinceMixSample,
      pickupColor: { ...this.pickupColor }, pickupAmount: this.pickupAmount,
      recordedLen: this.recordedMixSamples.length, replaySampleIdx: this.replaySampleIdx,
    };
  }

  private restoreState(s: ReturnType<StrokeSession['snapshotState']>) {
    this.smoothedX = s.smoothedX; this.smoothedY = s.smoothedY;
    this.smoothedPressure = s.smoothedPressure; this.smoothedAngle = s.smoothedAngle;
    this.hasAngle = s.hasAngle; this.smoothedAltitude = s.smoothedAltitude;
    this.tiltAzimuth = s.tiltAzimuth; this.hasAzimuth = s.hasAzimuth;
    this.prevRawX = s.prevRawX; this.prevRawY = s.prevRawY;
    this.prevAnchorX = s.prevAnchorX; this.prevAnchorY = s.prevAnchorY;
    this.prevAnchorPressure = s.prevAnchorPressure;
    this.currentSpacing = s.currentSpacing;
    this.residual = s.residual; this.cumulativeDistance = s.cumulativeDistance;
    this.stampIndex = s.stampIndex; this.initialized = s.initialized;
    this.lastTimestamp = s.lastTimestamp; this.velocity = s.velocity;
    this.mixColor = s.mixColor; this.distSinceMixSample = s.distSinceMixSample;
    this.pickupColor = s.pickupColor; this.pickupAmount = s.pickupAmount;
    this.recordedMixSamples.length = s.recordedLen;
    this.replaySampleIdx = s.replaySampleIdx;
  }

  private hasAzimuth = false;

  private updateTiltAzimuth(point: Point): void {
    const tx = point.tiltX ?? 0;
    const ty = point.tiltY ?? 0;
    if (Math.abs(tx) > 1 || Math.abs(ty) > 1) {
      const raw = Math.atan2(ty, tx);
      // Smooth the azimuth — raw per-event values jitter, and jittering the
      // stamp angle of an elongated tip reads as shimmering segmentation.
      this.tiltAzimuth = this.hasAzimuth ? lerpAngle(this.tiltAzimuth, raw, 0.2) : raw;
      this.hasAzimuth = true;
    }
  }

  /**
   * 0 = pen upright, 1 = pen flat. Gated so a normal writing grip (~50-60°
   * altitude) does NOT trigger shading — stamps would elongate at a fixed
   * azimuth and picket-fence along the stroke. Shading engages only when the
   * pencil is deliberately laid down, like Procreate.
   */
  private tiltFactor(): number {
    const alt = Math.max(0, Math.min(Math.PI / 2, this.smoothedAltitude));
    const raw = 1 - alt / (Math.PI / 2);
    return smoothstep(0.45, 0.85, raw);
  }

  private updateMixColor(x: number, y: number): void {
    const { wetMix, isEraser } = this.config;
    if (isEraser) return;

    // Replay path: step through previously recorded colors by distance.
    if (this.replaySamples) {
      const d = this.cumulativeDistance;
      const samples = this.replaySamples;
      if (d < samples[0].d) return; // base color until the first recorded sample
      while (this.replaySampleIdx < samples.length - 1 && samples[this.replaySampleIdx + 1].d <= d) {
        this.replaySampleIdx++;
      }
      const s = samples[this.replaySampleIdx];
      this.mixColor = { r: s.r, g: s.g, b: s.b };
      return;
    }

    if (!wetMix || !this.sampler) return;
    if (wetMix.dilution <= 0 && wetMix.pull <= 0) return;
    if (this.distSinceMixSample < this.mixSampleInterval) return;
    this.distSinceMixSample = 0;

    // Speed governs how wet the interaction is: below ~0.3 px/ms the brush
    // sits in the paint and mixes deeply; fast strokes lay paint down clean.
    const velocityFactor = 1 / (1 + Math.pow(this.velocity / 0.6, 2));

    // Charge = fresh paint load; a loaded brush resists picking up color.
    const progress = Math.min(1, this.cumulativeDistance / Math.max(1, this.config.size * 30));
    const chargeRemaining = wetMix.charge * (1 - Math.pow(progress, 1.5));

    // Equilibrium pickup cap: how dirty the brush can get at this speed.
    // Even a fully saturated slow drag keeps some of the brush's own paint
    // (never converges to pure canvas color), and pull raises the ceiling.
    const wetness = Math.min(1,
      wetMix.dilution * (1 - chargeRemaining * 0.85) + wetMix.pull * 0.8);
    const pickupCap = Math.min(0.9, wetness * 0.85) * velocityFactor;

    // Approach rate, normalized by sample density so pickup speed (in
    // brush-diameters of travel) is independent of spacing.
    const rate = Math.min(0.5, (this.mixSampleInterval / Math.max(1, this.config.size)) * (1.2 + wetness));

    const sampled = this.samplePixels(x, y, this.config.size * 0.5);
    if (sampled && sampled.a > 0.08) {
      // The picked-up paint color follows what the brush drags through.
      const ct = Math.min(1, rate * 2.5 * sampled.a);
      this.pickupColor = {
        r: this.pickupColor.r * (1 - ct) + sampled.r * ct,
        g: this.pickupColor.g * (1 - ct) + sampled.g * ct,
        b: this.pickupColor.b * (1 - ct) + sampled.b * ct,
      };
      // Dirtiness approaches the speed-dependent cap...
      this.pickupAmount += (pickupCap - this.pickupAmount) * rate * sampled.a;
    } else {
      // ...and sheds gradually while depositing over clean canvas.
      this.pickupAmount *= 1 - rate * 0.35;
    }

    this.pickupAmount = Math.max(0, Math.min(0.92, this.pickupAmount));
    this.mixColor = {
      r: this.baseColor.r + (this.pickupColor.r - this.baseColor.r) * this.pickupAmount,
      g: this.baseColor.g + (this.pickupColor.g - this.baseColor.g) * this.pickupAmount,
      b: this.baseColor.b + (this.pickupColor.b - this.baseColor.b) * this.pickupAmount,
    };
    this.recordedMixSamples.push({
      d: this.cumulativeDistance,
      r: this.mixColor.r, g: this.mixColor.g, b: this.mixColor.b,
    });
  }

  private samplePixels(cx: number, cy: number, radius: number) {
    const s = this.sampler;
    if (!s) return null;
    const px = Math.round(cx * s.scale);
    const pyRaw = Math.round(cy * s.scale);
    const py = s.flipY ? s.height - 1 - pyRaw : pyRaw;
    const r = Math.max(1, Math.min(8, Math.round(radius * s.scale * 0.5)));

    let sr = 0, sg = 0, sb = 0, sa = 0, count = 0;
    const step = Math.max(1, Math.floor(r / 2));
    for (let dy = -r; dy <= r; dy += step) {
      for (let dx = -r; dx <= r; dx += step) {
        const x = px + dx;
        const y = py + dy;
        if (x < 0 || y < 0 || x >= s.width || y >= s.height) continue;
        const i = (y * s.width + x) * 4;
        const a = s.pixels[i + 3] / 255;
        if (a > 0.004) {
          // Un-premultiply (safe for straight alpha too when a is high).
          sr += s.pixels[i] / Math.max(a, 0.01);
          sg += s.pixels[i + 1] / Math.max(a, 0.01);
          sb += s.pixels[i + 2] / Math.max(a, 0.01);
        }
        sa += a;
        count++;
      }
    }
    if (count === 0) return null;
    const visible = Math.max(1, count);
    return {
      r: Math.min(255, sr / visible),
      g: Math.min(255, sg / visible),
      b: Math.min(255, sb / visible),
      a: sa / count,
    };
  }

  private createStamp(x: number, y: number, rawPressure: number, distance: number): Stamp {
    const p = this.preset;
    const idx = this.stampIndex++;
    if (this.measureOnly) {
      // Geometry-only pass; the caller discards the array contents.
      return null as unknown as Stamp;
    }
    const pressure = Math.max(0.02, Math.min(1, rawPressure));
    const curved = applyPressureCurve(pressure, p.pressureCurve);

    let sizeF = lerp(p.pressureSize[0], p.pressureSize[1], curved);
    let opacityF = lerp(p.pressureOpacity[0], p.pressureOpacity[1], curved);

    // Velocity dynamics
    if (p.velocitySize > 0) sizeF *= Math.max(0.25, 1 - this.velocity * p.velocitySize * 0.03);
    if (p.velocityOpacity > 0) opacityF *= Math.max(0.2, 1 - this.velocity * p.velocityOpacity * 0.03);

    // Tilt dynamics
    const tilt = this.tiltFactor();
    let aspect = p.tip.aspectRatio;
    let angle: number;
    switch (p.rotationMode) {
      case 'fixed': angle = p.tip.angle; break;
      case 'random': angle = hash2(this.seed, idx * 7 + 1) * Math.PI * 2; break;
      default: angle = this.smoothedAngle + p.tip.angle;
    }
    // Nib brushes (fixed rotation, elongated tip): "size" is the nib's LONG
    // axis, so a calligraphy pen draws a thin italic line, not a fat blob.
    if (p.rotationMode === 'fixed' && aspect > 1) {
      sizeF /= aspect;
    }
    if (tilt > 0.1) {
      sizeF *= 1 + tilt * p.tiltSize;
      opacityF *= 1 - tilt * p.tiltOpacity;
      if (p.tiltShading) {
        aspect *= 1 + tilt * 1.2;
        angle = this.tiltAzimuth;
      }
    }

    // Taper
    if (this.taperStartLen > 0) {
      const f = smoothstep(0, this.taperStartLen, distance);
      sizeF *= lerp(0.15, 1, f);
      opacityF *= lerp(0.5, 1, f);
    }
    if (this.knownTotalLength !== null && this.taperEndLen > 0) {
      const remaining = Math.max(0, this.knownTotalLength - distance);
      const f = smoothstep(0, this.taperEndLen, remaining);
      sizeF *= lerp(0.1, 1, f);
      opacityF *= lerp(0.4, 1, f);
    }

    // Deterministic jitter
    let jx = 0, jy = 0;
    if (p.scatter > 0) {
      const mag = this.config.size * sizeF * p.scatter;
      jx = (hash2(this.seed, idx * 4) - 0.5) * 2 * mag;
      jy = (hash2(this.seed, idx * 4 + 1) - 0.5) * 2 * mag;
    }
    if (p.sizeJitter > 0) {
      sizeF *= 1 + (hash2(this.seed, idx * 4 + 2) - 0.5) * p.sizeJitter;
    }
    if (p.opacityJitter > 0) {
      opacityF *= 1 - hash2(this.seed, idx * 4 + 3) * p.opacityJitter;
    }
    if (p.rotationJitter > 0) {
      angle += (hash2(this.seed, idx * 5 + 4) - 0.5) * 2 * p.rotationJitter;
    }

    // Glaze/flow model: opacityF modulates the coverage a single pass of the
    // stroke converges to; the per-stamp alpha is normalized by how many
    // stamps overlap each pixel, so build-up is size- and spacing-invariant.
    // The brush "opacity" slider is applied when the stroke is composited.
    // Erasers always erase at full strength where the tip covers — softness
    // comes from the tip texture, strength from the opacity slider. Without
    // this, low flow/pressure left ghost paint behind every eraser pass.
    const coverage = this.config.isEraser
      ? 0.995
      : Math.min(0.995, Math.max(0, opacityF * p.flow));
    const stampSize = Math.max(0.75, this.config.size * sizeF);
    const overlap = Math.max(1, (stampSize * this.tipDensity) / this.currentSpacing);
    const alpha = 1 - Math.pow(1 - coverage, 1 / overlap);

    // Per-stamp color dynamics
    let color = this.config.isEraser ? WHITE : this.mixColor;
    if (!this.config.isEraser && (p.valueJitter > 0 || p.saturationJitter > 0)) {
      let { r, g, b } = color;
      if (p.valueJitter > 0) {
        const v = (hash2(this.seed, idx * 9 + 6) - 0.5) * 2 * p.valueJitter;
        if (v >= 0) {
          r += (255 - r) * v; g += (255 - g) * v; b += (255 - b) * v;
        } else {
          r *= 1 + v; g *= 1 + v; b *= 1 + v;
        }
      }
      if (p.saturationJitter > 0) {
        const s = hash2(this.seed, idx * 9 + 7) * p.saturationJitter;
        const gray = r * 0.299 + g * 0.587 + b * 0.114;
        r += (gray - r) * s; g += (gray - g) * s; b += (gray - b) * s;
      }
      color = { r, g, b };
    }

    return {
      x: x + jx,
      y: y + jy,
      size: stampSize,
      pressure,
      opacity: Math.max(0, Math.min(1, alpha)),
      angle,
      color: { r: color.r, g: color.g, b: color.b },
      hardness: p.tip.hardness,
      aspectRatio: aspect,
    };
  }
}
