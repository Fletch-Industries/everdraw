/**
 * WebGL Stroke Renderer - replays committed strokes into layer FBOs.
 *
 * Used for undo/redo, project load, context restoration, and canvas resize.
 * Uses the exact same code path as stroke finalize (processFullStroke), so a
 * replayed stroke is pixel-identical to what was drawn live.
 */

import { Stroke } from '@/types/drawing';
import { StrokeSession, StrokeSessionConfig } from './strokeSession';
import { getBrushPreset, presetFromCustomBrush } from './brushPresets';
import { WebGLBrushEngine } from './webglBrushEngine';
import { WebGLLayerManager } from './webglLayerManager';

/**
 * Render a complete stroke into the active-stroke FBO.
 */
export function renderStrokeToFBO(
  stroke: Stroke,
  brushEngine: WebGLBrushEngine,
  dpr: number = 1
): void {
  if (stroke.points.length < 1) return;

  const config: StrokeSessionConfig = {
    brushType: stroke.brush,
    color: stroke.color,
    size: stroke.size,
    opacity: stroke.opacity ?? 1,
    customBrush: stroke.customBrushPreset,
    wetMix: stroke.wetMix,
    isEraser: stroke.isEraser,
    mixSamples: stroke.mixSamples,
  };

  const { stamps } = StrokeSession.processFullStroke(config, stroke.points);
  if (stamps.length === 0) return;

  const preset = stroke.customBrushPreset
    ? presetFromCustomBrush(stroke.customBrushPreset)
    : getBrushPreset(stroke.brush);

  brushEngine.renderStamps(stamps, {
    brushType: stroke.brush,
    customBrush: stroke.customBrushPreset,
    preset,
    isEraser: stroke.isEraser,
    dpr,
  });
}

/**
 * Rebuild a layer's FBO from its stroke history.
 */
export function renderLayerStrokes(
  layerId: string,
  strokes: Stroke[],
  brushEngine: WebGLBrushEngine,
  layerManager: WebGLLayerManager,
  dpr: number = 1
): void {
  layerManager.clearLayerFBO(layerId);

  for (const stroke of strokes) {
    // Paint-bucket fills apply directly to the layer content beneath them.
    if (stroke.fill) {
      brushEngine.applyFillToLayer(layerId, stroke.fill.x, stroke.fill.y, stroke.color, dpr);
      continue;
    }
    layerManager.clearActiveStrokeFBO();
    renderStrokeToFBO(stroke, brushEngine, dpr);
    const preset = stroke.customBrushPreset
      ? presetFromCustomBrush(stroke.customBrushPreset)
      : getBrushPreset(stroke.brush);
    brushEngine.mergeActiveStrokeToLayer(layerId, stroke.isEraser, stroke.opacity ?? 1, preset.wetEdge);
  }
}
