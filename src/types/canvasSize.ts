export interface CanvasSize {
  width: number;
  height: number;
  dpi: number;
}

export const DEFAULT_CANVAS_SIZE: CanvasSize = {
  width: 2732,
  height: 2048,
  dpi: 300,
};

// Common presets like Procreate
export const CANVAS_PRESETS = [
  { name: 'Square', width: 2048, height: 2048, dpi: 300 },
  { name: 'Screen', width: 2732, height: 2048, dpi: 264 },
  { name: '4K', width: 3840, height: 2160, dpi: 300 },
  { name: 'A4 Print', width: 2480, height: 3508, dpi: 300 },
  { name: 'Letter Print', width: 2550, height: 3300, dpi: 300 },
  { name: 'Instagram Post', width: 1080, height: 1080, dpi: 72 },
  { name: 'Instagram Story', width: 1080, height: 1920, dpi: 72 },
  { name: 'Web Banner', width: 1920, height: 1080, dpi: 72 },
] as const;
