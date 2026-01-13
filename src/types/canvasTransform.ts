export interface CanvasTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
}

export const DEFAULT_TRANSFORM: CanvasTransform = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
};
