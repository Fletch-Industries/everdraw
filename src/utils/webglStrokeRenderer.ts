/**
 * WebGL Stroke Renderer - Renders strokes from history to layer FBOs
 * 
 * Used for undo/redo and initial layer rendering.
 */

import { Stroke, Point, BrushType } from '@/types/drawing';
import { CustomBrushPreset } from '@/types/customBrush';
import { StrokeSession, StrokeSessionConfig, Stamp } from './strokeSession';
import { WebGLBrushEngine } from './webglBrushEngine';
import { WebGLLayerManager } from './webglLayerManager';

/**
 * Render a complete stroke to the active stroke FBO using deterministic session
 */
export function renderStrokeToFBO(
  stroke: Stroke,
  brushEngine: WebGLBrushEngine,
  layerManager: WebGLLayerManager,
  dpr: number = 1
): void {
  if (stroke.points.length < 2) return;

  // Create a stroke session with the stroke's properties
  const config: StrokeSessionConfig = {
    brushType: stroke.brush,
    color: stroke.color,
    size: stroke.size,
    opacity: stroke.opacity ?? 1,
    customBrush: stroke.customBrushPreset,
    wetMix: stroke.wetMix,
    isEraser: stroke.isEraser,
  };

  const session = new StrokeSession(config);
  
  // Process all points through the session to generate stamps
  const allStamps: Stamp[] = [];
  for (const point of stroke.points) {
    const stamps = session.processPoint(point);
    allStamps.push(...stamps);
  }

  // Render all stamps to active FBO
  // Note: We disable wet mixing during replay to prevent stale canvas sampling
  if (allStamps.length > 0) {
    brushEngine.renderStamps(
      allStamps,
      stroke.brush,
      stroke.customBrushPreset,
      stroke.isEraser,
      dpr,
      undefined, // Disable wet mix during replay
      undefined
    );
  }
}

/**
 * Render all strokes for a layer to its FBO
 */
export function renderLayerStrokes(
  layerId: string,
  strokes: Stroke[],
  brushEngine: WebGLBrushEngine,
  layerManager: WebGLLayerManager,
  dpr: number = 1
): void {
  // Clear the layer FBO first
  layerManager.clearLayerFBO(layerId);
  
  // Render each stroke
  for (const stroke of strokes) {
    // Clear active stroke FBO
    layerManager.clearActiveStrokeFBO();
    
    // Render stroke to active FBO
    renderStrokeToFBO(stroke, brushEngine, layerManager, dpr);
    
    // Merge active FBO to layer FBO
    brushEngine.mergeActiveStrokeToLayer(layerId, stroke.isEraser);
  }
}

/**
 * Check if a layer needs re-rendering based on stroke count
 */
export function layerNeedsRerender(
  layerId: string,
  currentStrokeCount: number,
  lastStrokeCounts: Map<string, number>
): boolean {
  const lastCount = lastStrokeCounts.get(layerId);
  return lastCount === undefined || lastCount !== currentStrokeCount;
}
