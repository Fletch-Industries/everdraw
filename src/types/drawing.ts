import { CustomBrushPreset } from './customBrush';

export type BrushType = 'pencil' | 'pen' | 'paintbrush' | 'charcoal' | 'fountain_pen' | 'oil_paint' | 'acrylic' | 'watercolor' | 'marker' | 'custom';

// Wet mixing settings for paint brushes (Procreate-style color pickup)
export interface WetMixSettings {
  dilution: number;  // 0-1: how much the brush color mixes with canvas colors (0 = no mixing, 1 = full mixing)
  charge: number;    // 0-1: how much "paint" the brush holds before picking up color (0 = immediately picks up, 1 = full paint load)
  pull: number;      // 0-1: smudge/drag amount - how much existing paint is pulled along (0 = no smudge, 1 = full smudge)
}

export interface Point {
  x: number;
  y: number;
  pressure: number;
  timestamp: number;
  tiltX?: number;  // Apple Pencil tilt (-90 to 90 degrees)
  tiltY?: number;  // Apple Pencil tilt (-90 to 90 degrees)
  altitude?: number; // Angle from surface (0 = flat, π/2 = perpendicular)
}

export type InputMode = 'pencil_only' | 'pencil_and_touch';

export interface Stroke {
  points: Point[];
  brush: BrushType;
  color: string;
  size: number;
  opacity: number; // 0-1, brush stroke opacity
  customBrushPreset?: CustomBrushPreset; // For custom brushes
  wetMix?: WetMixSettings; // Optional wet mixing settings for paint-like brushes
  isEraser?: boolean; // True if this stroke is an eraser (uses destination-out composite)
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number; // 0-1
  strokes: Stroke[];
}

export interface LayerMergeEvent {
  sourceLayerId: string;
  targetLayerId: string;
}

export interface DrawingState {
  layers: Layer[];
  activeLayerId: string;
  currentStroke: Stroke | null;
  color: string;
  brushSize: number;
  brushOpacity: number; // 0-1
  brushType: BrushType;
  backgroundColor: string;
  pendingLayerMerge: LayerMergeEvent | null;
  activeCustomBrush: CustomBrushPreset | null;
  wetMix: WetMixSettings; // Wet mixing settings for paint brushes
  referenceImages: ReferenceImage[]; // Reference images for tracing
}

// Reference image for tracing
export interface ReferenceImage {
  id: string;
  name: string;
  imageData: string; // Base64 encoded image
  opacity: number; // 0-1
  visible: boolean;
  locked: boolean;
  transform: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
  };
  originalWidth: number;
  originalHeight: number;
}
