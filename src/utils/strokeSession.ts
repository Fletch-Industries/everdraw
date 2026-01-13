/**
 * StrokeSession - Deterministic per-stroke state management with full brush dynamics
 * 
 * Ensures identical stamp generation for both live drawing and replay (undo/redo).
 * Supports pressure curves, velocity sensitivity, taper, jitter, and multi-bristle generation.
 */

import { Point, BrushType, WetMixSettings } from '@/types/drawing';
import { CustomBrushPreset, PressureCurve, PRESSURE_CURVE_PRESETS } from '@/types/customBrush';
import { sampleCanvasColor, blendColors, calculateMixAmount } from './brushEngine';

export interface Stamp {
  x: number;
  y: number;
  size: number;
  pressure: number;
  opacity: number;
  angle: number;
  color: { r: number; g: number; b: number };
  // Extended properties for advanced rendering
  hardness?: number;      // 0-1, edge sharpness
  aspectRatio?: number;   // Brush aspect ratio
  brushAngle?: number;    // Brush tip rotation
  isBristle?: boolean;    // Whether this is a bristle sub-stamp
  bristleIndex?: number;  // Index within bristle group
}

export interface StrokeSessionConfig {
  brushType: BrushType;
  color: string;
  size: number;
  opacity: number;
  customBrush?: CustomBrushPreset;
  wetMix?: WetMixSettings;
  isEraser?: boolean;
}

// Smoothing constants
const POSITION_SMOOTHING = 0.4;
const PRESSURE_SMOOTHING = 0.3;
const OPACITY_SMOOTHING = 0.3;
const ANGLE_SMOOTHING = 0.5;

// Fast deterministic noise using integer hash (5x faster than sin-based)
const deterministicNoise = (x: number, y: number, seed: number = 0): number => {
  // Integer hash - much faster than Math.sin
  let n = (Math.floor(x * 1000) ^ Math.floor(y * 1000) ^ (seed | 0)) * 1073741789;
  n = ((n >> 16) ^ n) * 1073741789;
  n = ((n >> 16) ^ n);
  return (n & 0x7FFFFFFF) / 0x7FFFFFFF;
};

// Parse hex color to RGB
const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 255, g: 255, b: 255 };
};

// Apply pressure curve to input pressure
const applyPressureCurve = (inputPressure: number, curve: PressureCurve): number => {
  const points = curve.points;
  if (points.length < 2) return inputPressure;
  
  const p = Math.max(0, Math.min(1, inputPressure));
  
  let lower = points[0];
  let upper = points[points.length - 1];
  
  for (let i = 0; i < points.length - 1; i++) {
    if (p >= points[i].x && p <= points[i + 1].x) {
      lower = points[i];
      upper = points[i + 1];
      break;
    }
  }
  
  if (upper.x === lower.x) return lower.y;
  const t = (p - lower.x) / (upper.x - lower.x);
  return lower.y + (upper.y - lower.y) * t;
};

// Get brush-specific defaults
const getBrushDefaults = (brushType: BrushType, customBrush?: CustomBrushPreset) => {
  if (customBrush) {
    return {
      spacing: (customBrush.stroke?.spacing ?? 10) / 100,
      bristleCount: customBrush.texture?.bristleCount ?? 12,
      hardness: customBrush.shape?.roundness ?? 0.5,
      grain: customBrush.texture?.grain ?? 0,
      pressureSensitivity: customBrush.dynamics?.pressureSensitivity ?? 0.8,
      pressureCurve: customBrush.dynamics?.pressureCurve ?? PRESSURE_CURVE_PRESETS.linear,
      velocitySensitivity: customBrush.dynamics?.velocitySensitivity ?? 0.3,
      jitter: customBrush.stroke?.jitter ?? { position: 0, size: 0, rotation: 0, opacity: 0 },
      taper: customBrush.stroke?.taper ?? { startSize: 0, endSize: 0, startOpacity: 1, endOpacity: 1, tipLength: 10 },
      aspectRatio: customBrush.shape?.aspectRatio ?? 1,
      brushAngle: customBrush.shape?.angle ?? 0,
      baseType: customBrush.shape?.baseType ?? 'round',
      colorVariation: customBrush.color?.colorVariation ?? 0,
      bristleVariation: customBrush.texture?.bristleVariation ?? 0.3,
      flow: customBrush.color?.flowRate ?? 0.8,  // Flow control
    };
  }
  
// Mobile detection for performance caps
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  
  // PERFORMANCE: Aggressive mobile optimizations for responsive drawing
  // Mobile spacing is 2-3x larger, bristle counts are heavily reduced
  switch (brushType) {
    case 'pencil':
      return {
        spacing: isMobile ? 0.008 : 0.005,   // Very tight spacing for continuous lines
        bristleCount: isMobile ? 6 : 10,     // More bristle strokes for coverage
        hardness: 0.5,                        // Softer edges for natural blending
        grain: 0.35,                          // Moderate grain texture
        pressureSensitivity: 0.9,             // High pressure response - light = faint
        pressureCurve: {                      // Custom curve: very light at low pressure
          id: 'pencil_soft',
          name: 'Pencil Soft',
          points: [
            { x: 0, y: 0.08 },   // Near-zero at no pressure (soft sketch start)
            { x: 0.2, y: 0.15 }, // Very light at low pressure
            { x: 0.5, y: 0.4 },  // Builds up gradually
            { x: 0.8, y: 0.7 },  // Stronger at medium-high
            { x: 1, y: 1 },      // Full at max
          ],
        },
        velocitySensitivity: 0.3,             // Less velocity impact
        jitter: { 
          position: 0.15,    // Position spread for graphite texture
          size: 0.25,        // Variable bristle thickness
          rotation: 0.1,     // Rotation for natural look
          opacity: 0.3       // Variable opacity for broken texture
        },
        taper: { 
          startSize: 0.2,    // Soft start taper
          endSize: 0.25,     // Natural end taper
          startOpacity: 0.7, // Start slightly lighter
          endOpacity: 1, 
          tipLength: 15      // Longer taper zone
        },
        aspectRatio: 3.0,    // More elongated for continuous stroke feel
        brushAngle: 0,
        baseType: 'pencil_bristle' as const,  // Special pencil bristle type
        colorVariation: 0.08,                 // Graphite color shift
        bristleVariation: 0.45,               // High variation for texture
        flow: 0.5,                            // Lower flow = builds up gradually (key for sketchy feel)
        // Pencil-specific properties
        paperGrain: 0.4,                      // Paper texture interaction strength
      };
    case 'pen':
    case 'fountain_pen':
      return {
        spacing: isMobile ? 0.025 : 0.015,  // Very tight spacing for smooth lines
        bristleCount: 1,
        hardness: 0.85,  // Slightly softer edges
        grain: 0,
        pressureSensitivity: 0.9,
        pressureCurve: PRESSURE_CURVE_PRESETS.linear,
        velocitySensitivity: 0.6,
        jitter: { position: 0, size: 0, rotation: 0, opacity: 0 },
        taper: { startSize: 0.3, endSize: 0.3, startOpacity: 1, endOpacity: 1, tipLength: 10 },
        aspectRatio: 1,
        brushAngle: 0,
        baseType: 'round' as const,
        colorVariation: 0,
        bristleVariation: 0,
        flow: 1.0,  // Full flow for crisp lines
      };
    case 'paintbrush':
      return {
        spacing: isMobile ? 0.035 : 0.025,  // Very dense for smooth paint strokes (reduced from 0.06)
        bristleCount: isMobile ? 8 : 18,
        hardness: 0.35,  // Slightly firmer for more solid coverage
        grain: 0.08,
        pressureSensitivity: 0.85,
        pressureCurve: PRESSURE_CURVE_PRESETS.linear,
        velocitySensitivity: 0.4,
        jitter: { position: 0.015, size: 0.06, rotation: 0.08, opacity: 0.03 },
        taper: { startSize: 0.1, endSize: 0.15, startOpacity: 1, endOpacity: 1, tipLength: 12 },
        aspectRatio: 1,
        brushAngle: 0,
        baseType: 'bristle' as const,
        colorVariation: 0.02,
        bristleVariation: 0.35,
        flow: 0.98,  // Very high flow for solid, opaque paint
      };
    case 'oil_paint':
      return {
        spacing: isMobile ? 0.035 : 0.025,  // Denser for smooth oil strokes
        bristleCount: isMobile ? 6 : 14,
        hardness: 0.3,  // Slightly firmer for solid oil paint
        grain: 0.12,
        pressureSensitivity: 0.75,
        pressureCurve: PRESSURE_CURVE_PRESETS.heavy,
        velocitySensitivity: 0.3,
        jitter: { position: 0.02, size: 0.08, rotation: 0.12, opacity: 0.04 },
        taper: { startSize: 0.08, endSize: 0.12, startOpacity: 1, endOpacity: 1, tipLength: 10 },
        aspectRatio: 1.2,
        brushAngle: 0,
        baseType: 'bristle' as const,
        colorVariation: 0.03,
        bristleVariation: 0.4,
        flow: 0.95,  // High flow for rich, solid oil paint
      };
    case 'acrylic':
      return {
        spacing: isMobile ? 0.04 : 0.03,  // Denser for smooth acrylic
        bristleCount: isMobile ? 7 : 16,
        hardness: 0.45,  // Firmer for solid acrylic coverage
        grain: 0.06,
        pressureSensitivity: 0.8,
        pressureCurve: PRESSURE_CURVE_PRESETS.linear,
        velocitySensitivity: 0.35,
        jitter: { position: 0.015, size: 0.05, rotation: 0.06, opacity: 0.02 },
        taper: { startSize: 0.1, endSize: 0.1, startOpacity: 1, endOpacity: 1, tipLength: 8 },
        aspectRatio: 1,
        brushAngle: 0,
        baseType: 'bristle' as const,
        colorVariation: 0.02,
        bristleVariation: 0.3,
        flow: 0.95,  // High flow - acrylic is typically opaque and solid
      };
    case 'watercolor':
      return {
        spacing: isMobile ? 0.045 : 0.03,  // Denser for smooth watercolor washes
        bristleCount: isMobile ? 5 : 8,
        hardness: 0.2,  // Soft edges for watercolor effect
        grain: 0.15,
        pressureSensitivity: 0.7,
        pressureCurve: PRESSURE_CURVE_PRESETS.lightTouch,
        velocitySensitivity: 0.5,
        jitter: { position: 0.04, size: 0.12, rotation: 0.15, opacity: 0.08 },
        taper: { startSize: 0.15, endSize: 0.2, startOpacity: 0.9, endOpacity: 0.8, tipLength: 15 },
        aspectRatio: 1,
        brushAngle: 0,
        baseType: 'round' as const,
        colorVariation: 0.04,
        bristleVariation: 0.5,
        flow: 0.6,  // Lower flow for gradual watercolor washes (intentionally wet)
      };
    case 'charcoal':
      return {
        spacing: isMobile ? 0.04 : 0.025,  // Denser for smooth charcoal
        bristleCount: isMobile ? 8 : 20,
        hardness: 0.25,  // Slightly firmer edges
        grain: 0.5,
        pressureSensitivity: 0.85,
        pressureCurve: PRESSURE_CURVE_PRESETS.linear,
        velocitySensitivity: 0.4,
        jitter: { position: 0.06, size: 0.1, rotation: 0.2, opacity: 0.06 },
        taper: { startSize: 0.2, endSize: 0.25, startOpacity: 1, endOpacity: 1, tipLength: 12 },
        aspectRatio: 1.5,
        brushAngle: 0.3,
        baseType: 'scatter' as const,
        colorVariation: 0.08,
        bristleVariation: 0.5,
        flow: 0.95,  // High flow for solid charcoal marks
      };
    case 'marker':
      return {
        spacing: isMobile ? 0.03 : 0.02,  // Denser for smooth marker strokes
        bristleCount: 1,
        hardness: 0.75,  // Slightly softer marker edge
        grain: 0,
        pressureSensitivity: 0.3,
        pressureCurve: PRESSURE_CURVE_PRESETS.heavy,
        velocitySensitivity: 0.1,
        jitter: { position: 0, size: 0, rotation: 0, opacity: 0 },
        taper: { startSize: 0, endSize: 0, startOpacity: 1, endOpacity: 1, tipLength: 5 },
        aspectRatio: 1,
        brushAngle: 0,
        baseType: 'flat' as const,
        colorVariation: 0,
        bristleVariation: 0,
        flow: 0.95,  // Very high flow for solid marker coverage
      };
    default:
      return {
        spacing: isMobile ? 0.05 : 0.03,
        bristleCount: 1,
        hardness: 0.4,
        grain: 0,
        pressureSensitivity: 0.8,
        pressureCurve: PRESSURE_CURVE_PRESETS.linear,
        velocitySensitivity: 0.3,
        jitter: { position: 0, size: 0, rotation: 0, opacity: 0 },
        taper: { startSize: 0, endSize: 0, startOpacity: 1, endOpacity: 1, tipLength: 10 },
        aspectRatio: 1,
        brushAngle: 0,
        baseType: 'round' as const,
        colorVariation: 0,
        bristleVariation: 0,
        flow: 0.8,
      };
  }
};

export class StrokeSession {
  private config: StrokeSessionConfig;
  private baseColor: { r: number; g: number; b: number };
  private brushDefaults: ReturnType<typeof getBrushDefaults>;
  
  // Smoothed state
  private smoothedX: number = 0;
  private smoothedY: number = 0;
  private smoothedPressure: number = 0.5;
  private smoothedOpacity: number = 1;
  private smoothedAngle: number = 0;
  
  // Tilt tracking for Apple Pencil (pencil brush shading)
  private smoothedTiltX: number = 0;
  private smoothedTiltY: number = 0;
  private smoothedAltitude: number = Math.PI / 2; // Default to upright
  private tiltFactor: number = 0; // 0 = upright, 1 = flat (shading mode)
  
  // Velocity tracking
  private lastTimestamp: number = 0;
  private velocity: number = 0;
  
  // Distance tracking for stamp spacing and taper
  private cumulativeDistance: number = 0;
  private lastEmittedX: number = 0;
  private lastEmittedY: number = 0;
  private totalStrokeLength: number = 0;
  
  // Point count for initialization
  private pointCount: number = 0;
  private isInitialized: boolean = false;
  
  // Stamp index for deterministic jitter
  private stampIndex: number = 0;
  
  // Wet mix state - CPU-side color accumulation like Canvas 2D
  private wetMixCurrentColor: { r: number; g: number; b: number };
  private wetMixSamplingCtx: CanvasRenderingContext2D | null = null;
  private wetMixDpr: number = 1;
  private wetMixSampleInterval: number = 0;
  private distanceSinceLastWetSample: number = 0;
  
  // Control point for Bézier curve interpolation (reduces polygonal appearance on fast strokes)
  private controlPointX: number = 0;
  private controlPointY: number = 0;
  // Previous raw input point for control point calculation
  private prevRawX: number = 0;
  private prevRawY: number = 0;
  
  // Arc-length carry-over to prevent gaps when stamp cap is hit
  private pendingArcLength: number = 0;
  
  // Device detection for performance caps
  private readonly isIPad: boolean;
  private readonly isMobile: boolean;
  private readonly MAX_STAMPS_PER_SEGMENT: number;
  
  constructor(config: StrokeSessionConfig) {
    this.config = config;
    this.baseColor = hexToRgb(config.color);
    this.brushDefaults = getBrushDefaults(config.brushType, config.customBrush);
    // Initialize wet mix color to brush color
    this.wetMixCurrentColor = { ...this.baseColor };
    // Sample interval: ~30% of brush size for performance
    this.wetMixSampleInterval = config.size * 0.3;
    
    // Device detection (cached for performance)
    const ua = navigator.userAgent;
    this.isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
    // iPad detection: either explicit iPad UA or Safari on macOS with touch support
    this.isIPad = /iPad/i.test(ua) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    // iPad Pro has more GPU headroom than iPhone/Android phones
    // Higher cap allows more stamps per segment without creating gaps
    this.MAX_STAMPS_PER_SEGMENT = this.isIPad ? 64 : (this.isMobile ? 32 : 128);
  }
  
  
  /**
   * Set the sampling context for wet mixing (must be called before processing points)
   * This should be a snapshot of the canvas state at stroke start
   */
  setSamplingContext(ctx: CanvasRenderingContext2D | null, dpr: number = 1): void {
    this.wetMixSamplingCtx = ctx;
    this.wetMixDpr = dpr;
  }

  /**
   * Process a new point and return stamps to render
   */
  processPoint(point: Point): Stamp[] {
    const stamps: Stamp[] = [];
    
    // First point: initialize state and emit first stamp
    if (!this.isInitialized) {
      this.smoothedX = point.x;
      this.smoothedY = point.y;
      this.smoothedPressure = point.pressure;
      this.smoothedOpacity = this.config.opacity;
      this.smoothedAngle = 0;
      // Initialize tilt from first point
      this.smoothedTiltX = point.tiltX ?? 0;
      this.smoothedTiltY = point.tiltY ?? 0;
      this.smoothedAltitude = point.altitude ?? Math.PI / 2;
      this.tiltFactor = this.calculateTiltFactor(this.smoothedAltitude);
      this.lastEmittedX = point.x;
      this.lastEmittedY = point.y;
      this.controlPointX = point.x;
      this.controlPointY = point.y;
      this.prevRawX = point.x;
      this.prevRawY = point.y;
      this.lastTimestamp = point.timestamp;
      this.isInitialized = true;
      this.pointCount = 1;
      
      // Emit first stamp(s)
      stamps.push(...this.createStamps(0));
      return stamps;
    }
    
    // Calculate velocity
    const timeDelta = Math.max(1, point.timestamp - this.lastTimestamp);
    const dx = point.x - this.smoothedX;
    const dy = point.y - this.smoothedY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    this.velocity = dist / timeDelta;
    this.lastTimestamp = point.timestamp;
    
    // Velocity-adaptive smoothing: reduce lag at high velocities for faster tracking
    // Base smoothing factor
    const baseSmoothing = this.brushDefaults.taper.tipLength > 0 ? 0.3 : POSITION_SMOOTHING;
    // At high velocity, increase smoothing factor (less lag) - velocity ~0 = base, velocity > 3 = up to 0.7
    const velocityBoost = Math.min(0.35, this.velocity * 0.12);
    const adaptiveSmoothing = Math.min(0.8, baseSmoothing + velocityBoost);
    
    this.smoothedX = this.lerp(this.smoothedX, point.x, adaptiveSmoothing);
    this.smoothedY = this.lerp(this.smoothedY, point.y, adaptiveSmoothing);
    this.smoothedPressure = this.lerp(this.smoothedPressure, point.pressure, PRESSURE_SMOOTHING);
    this.smoothedOpacity = this.lerp(this.smoothedOpacity, this.config.opacity, OPACITY_SMOOTHING);
    
    // Update control point: use the previous raw input as control point
    // This creates smooth Catmull-Rom-like curves through the input points
    this.controlPointX = this.prevRawX;
    this.controlPointY = this.prevRawY;
    this.prevRawX = point.x;
    this.prevRawY = point.y;
    
    // Calculate angle from movement direction
    if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
      const rawAngle = Math.atan2(dy, dx);
      this.smoothedAngle = this.lerpAngle(this.smoothedAngle, rawAngle, ANGLE_SMOOTHING);
    }
    
    // Smooth tilt values for Apple Pencil
    const TILT_SMOOTHING = 0.3;
    if (point.tiltX !== undefined) {
      this.smoothedTiltX = this.lerp(this.smoothedTiltX, point.tiltX, TILT_SMOOTHING);
    }
    if (point.tiltY !== undefined) {
      this.smoothedTiltY = this.lerp(this.smoothedTiltY, point.tiltY, TILT_SMOOTHING);
    }
    if (point.altitude !== undefined) {
      this.smoothedAltitude = this.lerp(this.smoothedAltitude, point.altitude, TILT_SMOOTHING);
      this.tiltFactor = this.calculateTiltFactor(this.smoothedAltitude);
    }
    
    this.pointCount++;
    
    // Calculate distance from last emitted stamp
    // Approximate arc length of the Bézier curve (more accurate for curved paths)
    // Use 4-point sampling for arc length estimation
    const arcLength = this.approximateBezierArcLength(
      this.lastEmittedX, this.lastEmittedY,
      this.controlPointX, this.controlPointY,
      this.smoothedX, this.smoothedY
    );
    
    // Spacing threshold based on brush size and settings
    // Consistent spacing regardless of velocity - performance controlled by mobile-specific base spacing
    const rawSpacingPx = this.config.size * this.brushDefaults.spacing;
    
    // CRITICAL FIX: Clamp max spacing in pixels to prevent visible dabs on large brushes
    // Each brush type has a max spacing threshold based on its visual characteristics
    const maxSpacingPx = this.getMaxSpacingPx(this.isMobile);
    const spacing = Math.max(1, Math.min(rawSpacingPx, maxSpacingPx));
    
    // Include pending arc length from previous segment (carry-over to prevent gaps)
    const totalArc = this.pendingArcLength + arcLength;
    
    // Emit stamps at fixed spacing intervals along the Bézier arc
    if (totalArc >= spacing) {
      // Calculate required stamps for total arc
      let numStamps = Math.ceil(totalArc / spacing);
      
      // Apply safety cap but carry over the remainder instead of creating gaps
      if (numStamps > this.MAX_STAMPS_PER_SEGMENT) {
        // Emit only up to cap, carry over the rest
        numStamps = this.MAX_STAMPS_PER_SEGMENT;
        // Calculate how much arc we're consuming and save the rest
        const consumedArc = numStamps * spacing;
        this.pendingArcLength = totalArc - consumedArc;
      } else {
        // Clear pending - we can handle everything
        this.pendingArcLength = 0;
      }
      
      // TRUE ARC-LENGTH RESAMPLING: Walk along Bézier at fixed spacing intervals
      // Build polyline approximation of the Bézier curve
      const POLYLINE_SAMPLES = 10;
      const polyX: number[] = [this.lastEmittedX];
      const polyY: number[] = [this.lastEmittedY];
      const polyDist: number[] = [0]; // Cumulative distance at each sample
      
      let cumDist = 0;
      for (let s = 1; s <= POLYLINE_SAMPLES; s++) {
        const t = s / POLYLINE_SAMPLES;
        const px = this.quadraticBezier(this.lastEmittedX, this.controlPointX, this.smoothedX, t);
        const py = this.quadraticBezier(this.lastEmittedY, this.controlPointY, this.smoothedY, t);
        const dx = px - polyX[polyX.length - 1];
        const dy = py - polyY[polyY.length - 1];
        cumDist += Math.sqrt(dx * dx + dy * dy);
        polyX.push(px);
        polyY.push(py);
        polyDist.push(cumDist);
      }
      
      const totalPolyDist = cumDist;
      
      // TRUE FIXED-SPACING WALK: emit stamps at exact spacing intervals from pendingArcLength
      // This eliminates density variation caused by the old (i/numStamps) distribution
      let walkedDistance = this.pendingArcLength; // Start from leftover distance
      
      while (walkedDistance + spacing <= totalPolyDist + 0.001) {
        walkedDistance += spacing;
        const targetDist = walkedDistance;
        
        // Find the polyline segment containing this distance
        let segIdx = 0;
        for (let j = 1; j < polyDist.length; j++) {
          if (polyDist[j] >= targetDist) {
            segIdx = j - 1;
            break;
          }
          segIdx = j - 1;
        }
        
        // Interpolate within the segment
        const segStart = polyDist[segIdx];
        const segEnd = polyDist[segIdx + 1] || polyDist[segIdx];
        const segLen = segEnd - segStart;
        const localT = segLen > 0 ? (targetDist - segStart) / segLen : 0;
        
        const stampX = polyX[segIdx] + ((polyX[segIdx + 1] ?? polyX[segIdx]) - polyX[segIdx]) * localT;
        const stampY = polyY[segIdx] + ((polyY[segIdx + 1] ?? polyY[segIdx]) - polyY[segIdx]) * localT;
        
        this.cumulativeDistance += spacing;
        this.totalStrokeLength = this.cumulativeDistance;
        this.distanceSinceLastWetSample += spacing;
        
        // Update wet mix color by sampling canvas (CPU-side, like Canvas 2D did)
        this.updateWetMixColor(stampX, stampY);
        
        // Create stamps at this position (may be multiple for bristle brushes)
        const positionStamps = this.createStamps(this.cumulativeDistance, stampX, stampY);
        stamps.push(...positionStamps);
        
        // Safety cap to prevent infinite loops
        if (stamps.length > this.MAX_STAMPS_PER_SEGMENT * 30) break;
      }
      
      // Carry over remaining distance for next segment (prevents gaps between segments)
      this.pendingArcLength = walkedDistance - totalPolyDist;
      if (this.pendingArcLength < 0) this.pendingArcLength = 0;
      
      this.lastEmittedX = this.smoothedX;
      this.lastEmittedY = this.smoothedY;
    }
    
    return stamps;
  }
  
  /**
   * Update wet mix color by sampling canvas - CPU-side accumulation like Canvas 2D
   */
  private updateWetMixColor(x: number, y: number): void {
    const { wetMix, isEraser } = this.config;
    
    // Skip if wet mixing disabled, is eraser, or no sampling context
    if (!wetMix || isEraser || !this.wetMixSamplingCtx) return;
    if (wetMix.dilution <= 0 && wetMix.pull <= 0) return;
    
    // Throttle sampling by distance for performance
    if (this.distanceSinceLastWetSample < this.wetMixSampleInterval) return;
    this.distanceSinceLastWetSample = 0;
    
    // Calculate stroke progress for charge depletion
    const strokeProgress = this.totalStrokeLength > 0 
      ? this.cumulativeDistance / Math.max(this.totalStrokeLength, this.config.size * 10)
      : 0;
    
    // Calculate mix amounts based on velocity and progress (same as Canvas 2D)
    const { colorMix, smudge } = calculateMixAmount(this.velocity, strokeProgress, wetMix);
    
    // Only sample if there's meaningful mixing to do
    if (colorMix < 0.01 && smudge < 0.01) return;
    
    // Sample from the canvas snapshot
    const sampledColor = sampleCanvasColor(
      this.wetMixSamplingCtx,
      x, y,
      this.config.size * 0.5,
      this.wetMixDpr
    );
    
    // Only blend if we sampled something visible
    if (sampledColor.a > 0.1) {
      // Blend current wet mix color with sampled color
      this.wetMixCurrentColor = blendColors(
        this.wetMixCurrentColor,
        sampledColor,
        colorMix + smudge * 0.5
      );
    }
  }

  /**
   * Create stamps at a given position (handles multi-bristle generation)
   */
  private createStamps(strokeDistance: number, x?: number, y?: number): Stamp[] {
    const stamps: Stamp[] = [];
    const posX = x ?? this.smoothedX;
    const posY = y ?? this.smoothedY;
    
    // Apply pressure curve
    const { pressureSensitivity, pressureCurve, velocitySensitivity } = this.brushDefaults;
    let adjustedPressure = applyPressureCurve(this.smoothedPressure, pressureCurve);
    adjustedPressure = this.lerp(1, adjustedPressure, pressureSensitivity);
    
    // Apply velocity sensitivity (faster = smaller/lighter)
    const velocityFactor = Math.max(0.3, 1 - this.velocity * velocitySensitivity * 0.02);
    
    // Pencil-specific: apply tilt for shading effect
    let tiltSizeFactor = 1;
    let tiltOpacityFactor = 1;
    let tiltAspectRatio = this.brushDefaults.aspectRatio;
    let tiltAngleOffset = 0;
    
    if (this.config.brushType === 'pencil' && this.tiltFactor > 0.1) {
      // When tilted: increase size (1x to 2.5x), decrease opacity, stretch aspect ratio
      tiltSizeFactor = 1 + this.tiltFactor * 1.5; // Up to 2.5x size when flat
      tiltOpacityFactor = 1 - this.tiltFactor * 0.4; // Up to 40% opacity reduction
      tiltAspectRatio = 1 + this.tiltFactor * 1.5; // Stretch up to 2.5:1
      
      // Calculate tilt direction angle from tiltX and tiltY
      if (Math.abs(this.smoothedTiltX) > 0.01 || Math.abs(this.smoothedTiltY) > 0.01) {
        tiltAngleOffset = Math.atan2(this.smoothedTiltY, this.smoothedTiltX);
      }
    }
    
    // Apply taper
    const { taper } = this.brushDefaults;
    let taperSizeFactor = 1;
    let taperOpacityFactor = 1;
    
    if (this.totalStrokeLength > 0) {
      const strokeProgress = strokeDistance / Math.max(1, this.totalStrokeLength);
      const taperLength = taper.tipLength / 100;
      
      // Start taper
      if (strokeProgress < taperLength && taper.startSize > 0) {
        const t = strokeProgress / taperLength;
        taperSizeFactor = this.lerp(1 - taper.startSize, 1, t);
        taperOpacityFactor = this.lerp(taper.startOpacity, 1, t);
      }
      // End taper (estimate based on recent velocity)
      if (strokeProgress > 1 - taperLength && taper.endSize > 0) {
        const t = (strokeProgress - (1 - taperLength)) / taperLength;
        taperSizeFactor = this.lerp(1, 1 - taper.endSize, t);
        taperOpacityFactor = this.lerp(1, taper.endOpacity, t);
      }
    }
    
    // Base stamp size with all factors (including tilt)
    const baseStampSize = this.config.size * adjustedPressure * velocityFactor * taperSizeFactor * tiltSizeFactor;
    // Apply flow control - lower flow = more stamps needed for full opacity = smoother blending
    const flow = this.brushDefaults.flow ?? 0.8;
    const baseOpacity = this.smoothedOpacity * taperOpacityFactor * tiltOpacityFactor * flow;
    
    // Check if we need multi-bristle generation
    const { bristleCount, baseType, bristleVariation } = this.brushDefaults;
    const needsBristles = (baseType === 'bristle' || baseType === 'scatter') && bristleCount > 1;
    const needsPencilBristles = baseType === 'pencil_bristle' && bristleCount > 1;
    
    // PERFORMANCE: Aggressive caps for mobile - max 8 stamps per point
    const MAX_STAMPS_PER_POINT = this.isMobile ? 8 : 20;
    
    if (needsPencilBristles) {
      // PENCIL BRISTLE MODE: Generate multiple thin elongated strokes like Canvas 2D
      // This creates authentic graphite texture with continuous overlapping lines
      const count = Math.min(bristleCount, MAX_STAMPS_PER_POINT);
      const baseWidth = baseStampSize * 0.8; // Spread across stroke width
      
      for (let b = 0; b < count; b++) {
        const pencilStamp = this.createPencilBristleStamp(
          posX, posY,
          baseStampSize, baseOpacity,
          b, count, strokeDistance,
          baseWidth,
          tiltAspectRatio, tiltAngleOffset
        );
        stamps.push(pencilStamp);
      }
    } else if (needsBristles) {
      // Generate multiple bristle sub-stamps (capped for performance)
      // ENHANCED: Increase bristle count for large brushes to provide better coverage
      const effectiveBristleCount = baseStampSize > 80 
        ? Math.min(Math.ceil(bristleCount * 1.5), this.isMobile ? 12 : 24)
        : bristleCount;
      const count = Math.min(effectiveBristleCount, MAX_STAMPS_PER_POINT);
      
      // ENHANCED: For large bristle brushes, emit extra stamps along stroke direction
      // This ensures no gaps even at high velocities
      const needsExtraOverlap = baseStampSize > 80 && this.isMobile;
      const overlapPositions = needsExtraOverlap ? [-0.3, 0, 0.3] : [0];
      
      for (const overlapOffset of overlapPositions) {
        const offsetX = Math.cos(this.smoothedAngle) * baseStampSize * overlapOffset;
        const offsetY = Math.sin(this.smoothedAngle) * baseStampSize * overlapOffset;
        const overlapOpacity = needsExtraOverlap ? baseOpacity * 0.5 : baseOpacity;
        
        for (let b = 0; b < count; b++) {
          const bristleStamp = this.createBristleStamp(
            posX + offsetX, posY + offsetY, 
            baseStampSize, overlapOpacity, 
            b, count, strokeDistance
          );
          stamps.push(bristleStamp);
        }
      }
    } else {
      // Mobile: conditionally use overlap for large brushes where dab edges are visible
      if (this.isMobile) {
        const { jitter, aspectRatio, brushAngle, colorVariation, hardness, baseType } = this.brushDefaults;
        
        // Calculate spacing to determine if overlap is needed
        const rawSpacingPx = this.config.size * this.brushDefaults.spacing;
        const maxSpacingPx = this.getMaxSpacingPx(true);
        const effectiveSpacing = Math.min(rawSpacingPx, maxSpacingPx);
        
        // Enable overlap only when dab edges would be visible:
        // - Large brushes (>60px) OR
        // - Large effective spacing (>10px) OR
        // - Low opacity (<0.6) where individual stamps are more visible
        const needsOverlap = baseStampSize > 60 || effectiveSpacing > 10 || baseOpacity < 0.6;
        const overlapCount = needsOverlap ? 2 : 1; // Just 2 stamps for mobile (not 3)
        
        for (let o = 0; o < overlapCount; o++) {
          const seed = this.stampIndex * 100 + o;
          
          // Offset along stroke direction for overlap
          const overlapOffset = overlapCount > 1 
            ? (o - 0.5) * baseStampSize * 0.08 // Smaller offset than desktop
            : 0;
          const stampX = posX + Math.cos(this.smoothedAngle) * overlapOffset;
          const stampY = posY + Math.sin(this.smoothedAngle) * overlapOffset;
          
          const jitterX = (deterministicNoise(stampX * 0.1, stampY * 0.1, seed) - 0.5) * baseStampSize * jitter.position * 2;
          const jitterY = (deterministicNoise(stampX * 0.1, stampY * 0.1, seed + 100) - 0.5) * baseStampSize * jitter.position * 2;
          const sizeJitter = 1 + (deterministicNoise(stampX, stampY, seed + 200) - 0.5) * jitter.size * 2;
          const opacityJitter = 1 + (deterministicNoise(stampX, stampY, seed + 300) - 0.5) * jitter.opacity * 2;
          const rotationJitter = (deterministicNoise(stampX, stampY, seed + 400) - 0.5) * jitter.rotation * Math.PI;
          
          // Reduce opacity for overlapping stamps
          const overlapOpacityFactor = overlapCount > 1 ? 0.7 : 1;
          
          // Use white for eraser, wet mix color for normal brush
          let color = this.config.isEraser 
            ? { r: 255, g: 255, b: 255 } 
            : { ...this.wetMixCurrentColor };
          if (colorVariation > 0 && !this.config.isEraser) {
            const colorNoise = deterministicNoise(this.stampIndex, strokeDistance, 500 + o);
            const variation = (colorNoise - 0.5) * colorVariation * 50;
            color = {
              r: Math.max(0, Math.min(255, color.r + variation)),
              g: Math.max(0, Math.min(255, color.g + variation)),
              b: Math.max(0, Math.min(255, color.b + variation)),
            };
          }
          
          // Apply tilt aspect ratio for pencil brush
          const finalAspectRatio = this.config.brushType === 'pencil' ? tiltAspectRatio : aspectRatio;
          const finalBrushAngle = this.config.brushType === 'pencil' && this.tiltFactor > 0.1 
            ? brushAngle + tiltAngleOffset + rotationJitter
            : brushAngle + rotationJitter;
          
          stamps.push({
            x: stampX + jitterX,
            y: stampY + jitterY,
            size: Math.max(1, baseStampSize * sizeJitter),
            pressure: this.smoothedPressure,
            opacity: Math.max(0, Math.min(1, baseOpacity * opacityJitter * overlapOpacityFactor)),
            angle: this.smoothedAngle + finalBrushAngle,
            color,
            hardness,
            aspectRatio: finalAspectRatio,
            brushAngle: finalBrushAngle,
            isBristle: false,
          });
        }
      } else {
        // Desktop: use overlapping stamps for quality
        const singleStamps = this.createSingleStamp(posX, posY, baseStampSize, baseOpacity, strokeDistance);
        stamps.push(...singleStamps);
      }
    }
    
    this.stampIndex++;
    return stamps;
  }

  /**
   * Create a single bristle sub-stamp with stroke-direction offsets for overlap
   */
  private createBristleStamp(
    x: number, y: number,
    baseSize: number, baseOpacity: number,
    bristleIndex: number, totalBristles: number,
    strokeDistance: number
  ): Stamp {
    const { jitter, aspectRatio, brushAngle, bristleVariation, colorVariation, hardness } = this.brushDefaults;
    
    // Bristle fan spread perpendicular to stroke direction
    const fanPosition = (bristleIndex / (totalBristles - 1)) - 0.5; // -0.5 to 0.5
    const fanWidth = baseSize * 0.7; // Slightly reduced for better overlap
    const perpAngle = this.smoothedAngle + Math.PI / 2;
    
    // Base bristle offset (perpendicular to stroke)
    let offsetX = Math.cos(perpAngle) * fanPosition * fanWidth;
    let offsetY = Math.sin(perpAngle) * fanPosition * fanWidth;
    
    // ENHANCED: Calculate effective spacing to determine overlap needed
    // Stroke-direction offset should scale with spacing to ensure bristles overlap
    const rawSpacingPx = this.config.size * this.brushDefaults.spacing;
    const maxSpacingPx = this.getMaxSpacingPx(this.isMobile);
    const effectiveSpacing = Math.min(rawSpacingPx, maxSpacingPx);
    
    // Along-stroke overlap factor: ensure bristles bridge the gap between emission points
    // Scale with effective spacing relative to brush size
    const strokeOverlapFactor = Math.max(0.4, (effectiveSpacing / baseSize) * 1.5);
    const strokeDirOffset = (bristleIndex / totalBristles - 0.5) * baseSize * strokeOverlapFactor;
    offsetX += Math.cos(this.smoothedAngle) * strokeDirOffset;
    offsetY += Math.sin(this.smoothedAngle) * strokeDirOffset;
    
    // Add per-bristle jitter (deterministic based on position and index)
    const seed = bristleIndex * 1000 + this.stampIndex;
    const jitterNoise1 = deterministicNoise(x * 0.1, y * 0.1, seed);
    const jitterNoise2 = deterministicNoise(x * 0.1, y * 0.1, seed + 100);
    
    // Position jitter
    offsetX += (jitterNoise1 - 0.5) * baseSize * jitter.position * 2;
    offsetY += (jitterNoise2 - 0.5) * baseSize * jitter.position * 2;
    
    // Bristle variation (random spread)
    offsetX += (deterministicNoise(bristleIndex, strokeDistance, 1) - 0.5) * baseSize * bristleVariation;
    offsetY += (deterministicNoise(bristleIndex, strokeDistance, 2) - 0.5) * baseSize * bristleVariation;
    
    // Size jitter - make bristles larger for better coverage
    const sizeJitter = 1 + (deterministicNoise(x, y, seed + 200) - 0.5) * jitter.size * 2;
    const bristleSize = (baseSize / Math.sqrt(totalBristles * 0.6)) * sizeJitter * (0.7 + jitterNoise1 * 0.3);
    
    // Opacity jitter
    const opacityJitter = 1 + (deterministicNoise(x, y, seed + 300) - 0.5) * jitter.opacity * 2;
    const bristleOpacity = baseOpacity * opacityJitter * (0.5 + jitterNoise2 * 0.5);
    
    // Rotation jitter
    const rotationJitter = (deterministicNoise(x, y, seed + 400) - 0.5) * jitter.rotation * Math.PI;
    
    // Use white for eraser, wet mix color for normal brush
    let color = this.config.isEraser 
      ? { r: 255, g: 255, b: 255 } 
      : { ...this.wetMixCurrentColor };
    if (colorVariation > 0 && !this.config.isEraser) {
      const colorNoise = deterministicNoise(bristleIndex, this.stampIndex, 500);
      const variation = (colorNoise - 0.5) * colorVariation * 50;
      color = {
        r: Math.max(0, Math.min(255, color.r + variation)),
        g: Math.max(0, Math.min(255, color.g + variation)),
        b: Math.max(0, Math.min(255, color.b + variation)),
      };
    }
    
    return {
      x: x + offsetX,
      y: y + offsetY,
      size: Math.max(1, bristleSize),
      pressure: this.smoothedPressure,
      opacity: Math.max(0, Math.min(1, bristleOpacity)),
      angle: this.smoothedAngle + brushAngle + rotationJitter,
      color,
      hardness,
      aspectRatio,
      brushAngle: brushAngle + rotationJitter,
      isBristle: true,
      bristleIndex,
    };
  }

  /**
   * Create a pencil bristle stamp - segment ribbon approach like Canvas 2D pencil
   * Creates elongated stamps that connect along the stroke for continuous lines
   */
  private createPencilBristleStamp(
    x: number, y: number,
    baseSize: number, baseOpacity: number,
    bristleIndex: number, totalBristles: number,
    strokeDistance: number,
    baseWidth: number,
    tiltAspectRatio: number, tiltAngleOffset: number
  ): Stamp {
    const { jitter, colorVariation, hardness, aspectRatio: defaultAspectRatio } = this.brushDefaults;
    
    // Perpendicular spread across stroke width - graphite bristles fan out
    const fanPosition = (bristleIndex / Math.max(1, totalBristles - 1)) - 0.5; // -0.5 to 0.5
    const perpAngle = this.smoothedAngle + Math.PI / 2;
    
    // Calculate perpendicular offset - wider spread for natural graphite distribution
    let offsetX = Math.cos(perpAngle) * fanPosition * baseWidth * 0.9;
    let offsetY = Math.sin(perpAngle) * fanPosition * baseWidth * 0.9;
    
    // Per-bristle deterministic noise
    const seed = bristleIndex * 1000 + this.stampIndex;
    const jitterNoise1 = deterministicNoise(x * 0.1, y * 0.1, seed);
    const jitterNoise2 = deterministicNoise(x * 0.1, y * 0.1, seed + 100);
    
    // Position jitter for graphite scatter (less than before - let spacing handle continuity)
    offsetX += (jitterNoise1 - 0.5) * baseSize * jitter.position * 1.5;
    offsetY += (jitterNoise2 - 0.5) * baseSize * jitter.position * 1.5;
    
    // Along-stroke offset - INCREASED for better overlap between emission points
    // This is key for continuous appearance
    const strokeSpread = baseSize * 0.35; // Cover more along stroke
    const strokeOffset = (deterministicNoise(bristleIndex, this.stampIndex, 200) - 0.5) * strokeSpread;
    offsetX += Math.cos(this.smoothedAngle) * strokeOffset;
    offsetY += Math.sin(this.smoothedAngle) * strokeOffset;
    
    // Bristle size - thin but not too thin (20-35% of brush size for overlap)
    const sizeJitter = 1 + (deterministicNoise(x, y, seed + 200) - 0.5) * jitter.size * 2;
    const bristleSize = baseSize * (0.2 + jitterNoise1 * 0.15) * sizeJitter;
    
    // PENCIL OPACITY: Key to soft sketch feel
    // - Low pressure = very faint (paper tooth showing through)
    // - Builds up with repeated strokes
    const pressureFactor = Math.pow(this.smoothedPressure, 0.7); // Gentler curve
    const opacityJitter = 1 + (deterministicNoise(x, y, seed + 300) - 0.5) * jitter.opacity * 2;
    // Base opacity is low at light pressure, builds with pressure
    const bristleOpacity = baseOpacity * opacityJitter * (0.25 + pressureFactor * 0.6) * (0.5 + jitterNoise2 * 0.5);
    
    // Slight rotation jitter per bristle
    const rotationJitter = (deterministicNoise(x, y, seed + 400) - 0.5) * jitter.rotation * Math.PI;
    
    // Graphite color with gray variation (subtle shifts like real graphite)
    let color = this.config.isEraser 
      ? { r: 255, g: 255, b: 255 } 
      : { ...this.wetMixCurrentColor };
    if (colorVariation > 0 && !this.config.isEraser) {
      const colorNoise = deterministicNoise(bristleIndex, this.stampIndex, 500);
      const grayShift = (colorNoise - 0.5) * colorVariation * 50; // ±25 RGB for graphite shimmer
      color = {
        r: Math.max(0, Math.min(255, color.r + grayShift)),
        g: Math.max(0, Math.min(255, color.g + grayShift)),
        b: Math.max(0, Math.min(255, color.b + grayShift)),
      };
    }
    
    // SEGMENT RIBBON: High aspect ratio creates elongated stamps that overlap
    // These act like short line segments bridging between emission points
    const pencilAspectRatio = defaultAspectRatio * (this.tiltFactor > 0.1 ? tiltAspectRatio : 1);
    
    return {
      x: x + offsetX,
      y: y + offsetY,
      size: Math.max(1, bristleSize),
      pressure: this.smoothedPressure,
      opacity: Math.max(0, Math.min(1, bristleOpacity)),
      angle: this.smoothedAngle + tiltAngleOffset + rotationJitter,
      color,
      hardness,
      aspectRatio: pencilAspectRatio,
      brushAngle: tiltAngleOffset + rotationJitter,
      isBristle: true,
      bristleIndex,
    };
  }

  /**
   * Create stamps for smooth brush types (pen, marker, etc.)
   * Generates overlapping stamps along stroke direction for continuous appearance
   */
  private createSingleStamp(
    x: number, y: number,
    baseSize: number, baseOpacity: number,
    strokeDistance: number
  ): Stamp[] {
    const { jitter, aspectRatio, brushAngle, colorVariation, hardness, baseType } = this.brushDefaults;
    const stamps: Stamp[] = [];
    
    // For smooth brush types, generate overlapping stamps along stroke direction
    const needsOverlap = baseType === 'round' || baseType === 'flat';
    const overlapCount = needsOverlap ? 3 : 1;
    
    for (let o = 0; o < overlapCount; o++) {
      const seed = this.stampIndex * 100 + o;
      
      // Offset along stroke direction for overlap
      const overlapOffset = (o - (overlapCount - 1) / 2) * baseSize * 0.15;
      const stampX = x + Math.cos(this.smoothedAngle) * overlapOffset;
      const stampY = y + Math.sin(this.smoothedAngle) * overlapOffset;
      
      // Position jitter
      const jitterX = (deterministicNoise(stampX * 0.1, stampY * 0.1, seed) - 0.5) * baseSize * jitter.position * 2;
      const jitterY = (deterministicNoise(stampX * 0.1, stampY * 0.1, seed + 100) - 0.5) * baseSize * jitter.position * 2;
      
      // Size jitter
      const sizeJitter = 1 + (deterministicNoise(stampX, stampY, seed + 200) - 0.5) * jitter.size * 2;
      
      // Opacity jitter - reduce opacity for overlapping stamps
      const opacityJitter = 1 + (deterministicNoise(stampX, stampY, seed + 300) - 0.5) * jitter.opacity * 2;
      const finalOpacity = baseOpacity * opacityJitter / (overlapCount > 1 ? 1.5 : 1);
      
      // Rotation jitter
      const rotationJitter = (deterministicNoise(stampX, stampY, seed + 400) - 0.5) * jitter.rotation * Math.PI;
      
      // Use white for eraser, wet mix color for normal brush
      let color = this.config.isEraser 
        ? { r: 255, g: 255, b: 255 } 
        : { ...this.wetMixCurrentColor };
      if (colorVariation > 0 && !this.config.isEraser) {
        const colorNoise = deterministicNoise(this.stampIndex, strokeDistance, 500);
        const variation = (colorNoise - 0.5) * colorVariation * 50;
        color = {
          r: Math.max(0, Math.min(255, color.r + variation)),
          g: Math.max(0, Math.min(255, color.g + variation)),
          b: Math.max(0, Math.min(255, color.b + variation)),
        };
      }
      
      stamps.push({
        x: stampX + jitterX,
        y: stampY + jitterY,
        size: Math.max(1, baseSize * sizeJitter),
        pressure: this.smoothedPressure,
        opacity: Math.max(0, Math.min(1, finalOpacity)),
        angle: this.smoothedAngle + brushAngle + rotationJitter,
        color,
        hardness,
        aspectRatio,
        brushAngle: brushAngle + rotationJitter,
        isBristle: false,
      });
    }
    
    return stamps;
  }

  /**
   * Process multiple points in batch (for replay/undo)
   */
  processPoints(points: Point[]): Stamp[] {
    const allStamps: Stamp[] = [];
    for (const point of points) {
      const stamps = this.processPoint(point);
      allStamps.push(...stamps);
    }
    return allStamps;
  }

  /**
   * Linear interpolation
   */
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /**
   * Quadratic Bézier interpolation for smooth curves
   * p0 = start point, p1 = control point, p2 = end point
   * Produces smooth curves instead of polygonal paths on fast strokes
   */
  private quadraticBezier(p0: number, p1: number, p2: number, t: number): number {
    const mt = 1 - t;
    return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
  }

  /**
   * Approximate arc length of a quadratic Bézier curve
   * Uses Simpson's rule with 4 samples for fast and accurate estimation
   */
  private approximateBezierArcLength(
    x0: number, y0: number,
    cx: number, cy: number,
    x1: number, y1: number
  ): number {
    // Sample 4 points along the curve and sum chord lengths
    // This is faster than full integration and accurate enough for stamp spacing
    let length = 0;
    let prevX = x0;
    let prevY = y0;
    
    for (let i = 1; i <= 4; i++) {
      const t = i / 4;
      const x = this.quadraticBezier(x0, cx, x1, t);
      const y = this.quadraticBezier(y0, cy, y1, t);
      length += Math.sqrt((x - prevX) * (x - prevX) + (y - prevY) * (y - prevY));
      prevX = x;
      prevY = y;
    }
    
    return length;
  }

  /**
   * Get maximum spacing in pixels per brush type
   * Prevents visible individual dabs on large brushes by clamping absolute spacing
   * REDUCED for bristle brushes to prevent gaps on fast strokes
   */
  private getMaxSpacingPx(isMobile: boolean): number {
    const { baseType } = this.brushDefaults;
    const brushType = this.config.brushType;
    
    // Brush-specific max spacing based on visual tolerance
    // Bristle brushes need TIGHTER spacing because sub-stamps fan perpendicular,
    // not along the stroke direction, so gaps appear more easily
    switch (brushType) {
      case 'pen':
      case 'fountain_pen':
        return isMobile ? 6 : 4;
      case 'pencil':
        return isMobile ? 3 : 2;  // Very tight max spacing for smooth continuous strokes
      case 'marker':
        return isMobile ? 12 : 8;
      case 'paintbrush':
      case 'acrylic':
        // REDUCED: bristle brushes need tighter spacing (was 14/10)
        return isMobile ? 8 : 6;
      case 'oil_paint':
        // REDUCED: (was 16/12)
        return isMobile ? 10 : 8;
      case 'watercolor':
        return isMobile ? 18 : 14;
      case 'charcoal':
        return isMobile ? 16 : 10;
      default:
        // For custom brushes, use baseType as a hint
        if (baseType === 'round' || baseType === 'flat') {
          return isMobile ? 12 : 8;
        } else if (baseType === 'bristle') {
          // REDUCED: custom bristle brushes (was 14/10)
          return isMobile ? 8 : 6;
        }
        return isMobile ? 12 : 8;
    }
  }

  /**
   * Angle interpolation with wrap-around handling
   */
  private lerpAngle(a: number, b: number, t: number): number {
    let diff = b - a;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return a + diff * t;
  }

  /**
   * Get current state for debugging/inspection
   */
  getState() {
    return {
      smoothedX: this.smoothedX,
      smoothedY: this.smoothedY,
      smoothedPressure: this.smoothedPressure,
      cumulativeDistance: this.cumulativeDistance,
      pointCount: this.pointCount,
      velocity: this.velocity,
      stampIndex: this.stampIndex,
    };
  }

  /**
   * Get the brush config
   */
  getConfig(): StrokeSessionConfig {
    return this.config;
  }
  
  /**
   * Get brush defaults for external access
   */
  getBrushDefaults() {
    return this.brushDefaults;
  }

  /**
   * Calculate tilt factor from altitude angle
   * 0 = upright (writing), 1 = flat (shading)
   */
  private calculateTiltFactor(altitude: number): number {
    // altitude: 0 = flat on surface, π/2 = perpendicular
    // Convert to 0 = upright, 1 = flat
    const normalizedAltitude = Math.max(0, Math.min(Math.PI / 2, altitude));
    return 1 - (normalizedAltitude / (Math.PI / 2));
  }

  /**
   * Get current tilt factor for shader uniforms
   */
  getTiltFactor(): number {
    return this.tiltFactor;
  }

  /**
   * Get paper grain setting for pencil brush
   */
  getPaperGrain(): number {
    return (this.brushDefaults as any).paperGrain ?? 0;
  }
}
