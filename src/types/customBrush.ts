export interface BrushShape {
  baseType: 'round' | 'flat' | 'bristle' | 'scatter';
  aspectRatio: number; // 1 = circular, <1 = vertical, >1 = horizontal
  angle: number; // rotation of brush tip in radians
  roundness: number; // 0-1, affects edge softness
}

// Pressure curve point for custom pressure response
export interface PressureCurvePoint {
  x: number; // 0-1, input pressure
  y: number; // 0-1, output value
}

export interface PressureCurve {
  points: PressureCurvePoint[];
}

export type PressureCurvePresetName = 'linear' | 'lightTouch' | 'heavy' | 'sCurve';

// Preset pressure curves
export const PRESSURE_CURVE_PRESETS: Record<PressureCurvePresetName, PressureCurve> = {
  linear: {
    points: [{ x: 0, y: 0 }, { x: 1, y: 1 }]
  },
  lightTouch: {
    points: [{ x: 0, y: 0 }, { x: 0.25, y: 0.6 }, { x: 0.5, y: 0.85 }, { x: 1, y: 1 }]
  },
  heavy: {
    points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.15 }, { x: 0.75, y: 0.4 }, { x: 1, y: 1 }]
  },
  sCurve: {
    points: [{ x: 0, y: 0 }, { x: 0.25, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.75, y: 0.9 }, { x: 1, y: 1 }]
  }
};

export interface BrushDynamics {
  pressureSensitivity: number; // 0-1
  pressureAffects: ('size' | 'opacity' | 'flow')[];
  pressureCurve: PressureCurve; // Custom pressure response curve
  velocitySensitivity: number; // 0-1
  velocityAffects: ('size' | 'opacity' | 'flow')[];
  tiltSensitivity: number; // 0-1
  tiltAffects: ('size' | 'opacity' | 'angle')[];
}

export interface BrushJitter {
  position: number; // 0-1
  size: number; // 0-1
  rotation: number; // 0-1
  opacity: number; // 0-1
}

export interface BrushTaper {
  startSize: number; // 0-1, taper at stroke start
  endSize: number; // 0-1, taper at stroke end
  startOpacity: number; // 0-1
  endOpacity: number; // 0-1
  tipLength: number; // 0-100%, length of taper effect
}

export interface BrushStroke {
  spacing: number; // % of brush size between stamps (1-200)
  spacingJitter: number; // 0-1, randomness in spacing
  jitterLateral: number; // 0-1, perpendicular jitter
  jitterLinear: number; // 0-1, along-stroke jitter
  fallOff: 'none' | 'linear' | 'parabolic' | 'exponential'; // pressure falloff curve
  stabilization: number; // 0-1, stroke smoothing/stabilization
  streamline: number; // 0-1, path correction
  taper: BrushTaper;
  jitter: BrushJitter;
}

export interface BrushColor {
  baseOpacity: number; // 0-1
  flowRate: number; // 0-1, paint "wetness"
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay';
  colorVariation: number; // 0-1, random hue/sat/brightness shifts
}

export interface BrushTexture {
  grain: number; // 0-1
  noiseScale: number; // 0.1-10
  edgeBleed: number; // 0-1
  bristleCount: number; // 0-50
  bristleVariation: number; // 0-1
}

export interface CustomBrushPreset {
  id: string;
  name: string;
  icon: string; // Lucide icon name
  category: 'drawing' | 'painting' | 'custom';
  
  // Size range
  sizeRange: [number, number]; // min/max size
  
  // Core settings
  shape: BrushShape;
  dynamics: BrushDynamics;
  stroke: BrushStroke;
  color: BrushColor;
  texture: BrushTexture;
  
  // Metadata
  createdAt: number;
  updatedAt: number;
  isBuiltIn: boolean;
  previewStroke?: string; // Base64 preview image
}

// Default preset values
export const DEFAULT_BRUSH_SHAPE: BrushShape = {
  baseType: 'round',
  aspectRatio: 1,
  angle: 0,
  roundness: 1,
};

export const DEFAULT_BRUSH_DYNAMICS: BrushDynamics = {
  pressureSensitivity: 0.8,
  pressureAffects: ['size', 'opacity'],
  pressureCurve: { ...PRESSURE_CURVE_PRESETS.linear },
  velocitySensitivity: 0.3,
  velocityAffects: ['size'],
  tiltSensitivity: 0.5,
  tiltAffects: ['size'],
};

export const DEFAULT_BRUSH_JITTER: BrushJitter = {
  position: 0,
  size: 0,
  rotation: 0,
  opacity: 0,
};

export const DEFAULT_BRUSH_TAPER: BrushTaper = {
  startSize: 0,
  endSize: 0,
  startOpacity: 1,
  endOpacity: 1,
  tipLength: 10,
};

export const DEFAULT_BRUSH_STROKE: BrushStroke = {
  spacing: 10,
  spacingJitter: 0,
  jitterLateral: 0,
  jitterLinear: 0,
  fallOff: 'none',
  stabilization: 0.5,
  streamline: 0.5,
  taper: DEFAULT_BRUSH_TAPER,
  jitter: DEFAULT_BRUSH_JITTER,
};

export const DEFAULT_BRUSH_COLOR: BrushColor = {
  baseOpacity: 1,
  flowRate: 1,
  blendMode: 'normal',
  colorVariation: 0,
};

export const DEFAULT_BRUSH_TEXTURE: BrushTexture = {
  grain: 0,
  noiseScale: 1,
  edgeBleed: 0,
  bristleCount: 8,
  bristleVariation: 0.3,
};

export const createDefaultPreset = (partial?: Partial<CustomBrushPreset>): CustomBrushPreset => ({
  id: crypto.randomUUID(),
  name: 'New Brush',
  icon: 'Brush',
  category: 'custom',
  sizeRange: [1, 100],
  shape: { ...DEFAULT_BRUSH_SHAPE },
  dynamics: { ...DEFAULT_BRUSH_DYNAMICS },
  stroke: { ...DEFAULT_BRUSH_STROKE, jitter: { ...DEFAULT_BRUSH_JITTER }, taper: { ...DEFAULT_BRUSH_TAPER } },
  color: { ...DEFAULT_BRUSH_COLOR },
  texture: { ...DEFAULT_BRUSH_TEXTURE },
  createdAt: Date.now(),
  updatedAt: Date.now(),
  isBuiltIn: false,
  ...partial,
});
