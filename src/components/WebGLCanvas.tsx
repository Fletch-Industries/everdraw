/**
 * WebGLCanvas - GPU-accelerated drawing surface.
 *
 * Input pipeline: coalesced pointer events → StrokeSession (stabilization +
 * dynamics) → instanced stamp rendering into an active-stroke FBO, with a
 * screen-only predicted tail for minimal perceived latency. Strokes are
 * committed to React state ONCE per stroke (no per-move setState), and the
 * committed stroke is re-rendered through the deterministic full-stroke pass
 * so replay (undo/redo, reload, context restore) is pixel-identical.
 */

import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { Point, Stroke, Layer, BrushType, WetMixSettings, ReferenceImage, MixSample, InputMode } from '@/types/drawing';
import { CustomBrushPreset } from '@/types/customBrush';
import { CanvasSize } from '@/types/canvasSize';
import { CanvasTransform } from '@/types/canvasTransform';
import { StrokeSession, StrokeSessionConfig } from '@/utils/strokeSession';
import { StrokeCommitConfig } from '@/hooks/useDrawing';
import { WebGLLayerManager } from '@/utils/webglLayerManager';
import { WebGLBrushEngine } from '@/utils/webglBrushEngine';
import { renderLayerStrokes } from '@/utils/webglStrokeRenderer';
import { useMultiTouchGestures } from '@/hooks/useMultiTouchGestures';

// Long-press eyedropper
const LONG_PRESS_DELAY = 500; // ms
const LONG_PRESS_MOVE_THRESHOLD = 10; // px

interface WebGLCanvasProps {
  layers: Layer[];
  /** Optional — the WebGL path commits strokes in one call at pointer-up. */
  onStartStroke?: (point: Point) => void;
  onEndStroke: (points: Point[], mixSamples: MixSample[] | undefined, config: StrokeCommitConfig) => void;
  onCancelStroke: () => void;
  inputMode: InputMode;
  backgroundColor: string;
  activeLayerId: string;
  transform: CanvasTransform;
  onTransformChange: (scale: number, offsetX: number, offsetY: number, rotation: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  canvasSize: CanvasSize;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
  /** Provides a renderer for transparent (no-background) export. */
  onTransparentExportReady?: (fn: (() => HTMLCanvasElement | null) | null) => void;
  /** Commit a paint-bucket fill (drag-and-drop a color onto the canvas). */
  onFill?: (points: Point[], color: string) => void;

  // Brush properties for imperative rendering
  currentColor: string;
  currentBrushSize: number;
  currentBrushOpacity: number;
  currentBrushType: BrushType;
  currentIsEraser: boolean;
  currentCustomBrush?: CustomBrushPreset;
  currentWetMix?: WetMixSettings;

  // Eyedropper
  isEyedropperActive?: boolean;
  onEyedropperPick?: (color: string) => void;
  onLongPressEyedropperStart?: (screenPos: { x: number; y: number }, canvasPos: { x: number; y: number }, color: string) => void;
  onLongPressEyedropperMove?: (screenPos: { x: number; y: number }, canvasPos: { x: number; y: number }, color: string) => void;
  onLongPressEyedropperEnd?: (color: string) => void;

  referenceImages?: ReferenceImage[];
}

export function checkWebGL2Support(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

/** Drop near-duplicate points so storage/replay stay lean without changing the line. */
function compactPoints(points: Point[]): Point[] {
  if (points.length <= 3) return points;
  const result: Point[] = [points[0]];
  let last = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    if (dx * dx + dy * dy >= 0.35 || Math.abs(p.pressure - last.pressure) > 0.015) {
      result.push(p);
      last = p;
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

export const WebGLCanvas = ({
  layers,
  onEndStroke,
  onCancelStroke,
  inputMode,
  backgroundColor,
  activeLayerId,
  transform,
  onTransformChange,
  onUndo,
  onRedo,
  canvasSize,
  onCanvasReady,
  onTransparentExportReady,
  onFill,
  currentColor,
  currentBrushSize,
  currentBrushOpacity,
  currentBrushType,
  currentIsEraser,
  currentCustomBrush,
  currentWetMix,
  isEyedropperActive = false,
  onEyedropperPick,
  onLongPressEyedropperStart,
  onLongPressEyedropperMove,
  onLongPressEyedropperEnd,
  referenceImages = [],
}: WebGLCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const layerManagerRef = useRef<WebGLLayerManager | null>(null);
  const brushEngineRef = useRef<WebGLBrushEngine | null>(null);

  // Bumped to force full re-initialization (context restore)
  const [glVersion, setGlVersion] = useState(0);

  // Drawing state
  const isDrawingRef = useRef(false);
  const sessionRef = useRef<StrokeSession | null>(null);
  const strokePointsRef = useRef<Point[]>([]);
  const pendingRenderPointsRef = useRef<Point[]>([]);
  const predictedPointsRef = useRef<Point[]>([]);
  const drawRafRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const synthPressureRef = useRef(0.6);
  const lastInputRef = useRef<{ x: number; y: number; t: number } | null>(null);

  // Layer change tracking: count + last stroke identity per layer
  const layerTrackRef = useRef<Map<string, { count: number; lastStroke: Stroke | null }>>(new Map());
  const justCommittedRef = useRef<{ layerId: string; points: Point[] } | null>(null);
  const undoSnapshotRef = useRef<{ layerId: string; count: number } | null>(null);
  const redoSnapshotRef = useRef<{ layerId: string; count: number } | null>(null);

  // Composite scheduling (on-demand; no free-running RAF loop when idle)
  const compositeRafRef = useRef<number | null>(null);

  // Latest props mirrored into refs so the composite pass never goes stale
  const layersRef = useRef(layers);
  const backgroundColorRef = useRef(backgroundColor);
  const activeLayerIdRef = useRef(activeLayerId);
  const referenceImagesRef = useRef(referenceImages);
  layersRef.current = layers;
  backgroundColorRef.current = backgroundColor;
  activeLayerIdRef.current = activeLayerId;
  referenceImagesRef.current = referenceImages;

  // Reference image bitmap cache
  const referenceImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Gesture / input helpers
  const isGesturingRef = useRef(false);
  const containerRectRef = useRef<DOMRect | null>(null);

  // Long-press eyedropper
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressPointerIdRef = useRef<number | null>(null);
  const isLongPressingRef = useRef(false);

  /**
   * Resolution: use full devicePixelRatio, clamped by a physical-pixel budget
   * so huge canvases on high-DPR devices don't exhaust GPU memory.
   */
  const effectiveDpr = useMemo(() => {
    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const budget = isMobileDevice ? 8_500_000 : 18_000_000;
    const maxByBudget = Math.sqrt(budget / Math.max(1, canvasSize.width * canvasSize.height));
    return Math.max(1, Math.min(window.devicePixelRatio || 1, maxByBudget, 3));
  }, [canvasSize]);

  const transformMath = useMemo(() => {
    const radians = -transform.rotation * Math.PI / 180;
    return { cos: Math.cos(radians), sin: Math.sin(radians) };
  }, [transform.rotation]);

  // ------------------------------------------------------------ compositing

  const drawComposite = useCallback(() => {
    const gl = glRef.current;
    const canvas = canvasRef.current;
    const layerManager = layerManagerRef.current;
    const brushEngine = brushEngineRef.current;
    if (!gl || gl.isContextLost() || !canvas || !layerManager || !brushEngine) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);

    const hex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(backgroundColorRef.current);
    const [r, g, b] = hex
      ? [parseInt(hex[1], 16) / 255, parseInt(hex[2], 16) / 255, parseInt(hex[3], 16) / 255]
      : [0, 0, 0];
    gl.clearColor(r, g, b, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Reference images render beneath the paint layers
    for (const ref of referenceImagesRef.current) {
      if (!ref.visible) continue;
      const img = referenceImageCacheRef.current.get(ref.id);
      if (!img?.complete || img.naturalWidth === 0) continue;
      const texture = brushEngine.getImageTexture(ref.id, img);
      if (!texture) continue;
      const w = ref.originalWidth * ref.transform.scale;
      const h = ref.originalHeight * ref.transform.scale;
      brushEngine.drawImageToScreen(
        texture,
        ref.transform.x + w / 2,
        ref.transform.y + h / 2,
        w, h,
        (ref.transform.rotation * Math.PI) / 180,
        ref.opacity,
        effectiveDpr
      );
    }

    const drawing = isDrawingRef.current;
    const session = sessionRef.current;
    const isEraser = session?.getConfig().isEraser ?? false;

    // Predicted tail stamps (never committed) join the live stroke in flow
    // space inside compositeLayerWithActiveStroke, so preview opacity applies
    // exactly once — no double-darkening where the tail meets the stroke.
    let tailStamps: ReturnType<StrokeSession['previewPoints']> | undefined;
    let tailOpts: Parameters<WebGLBrushEngine['renderStamps']>[1] | undefined;
    if (drawing && session && predictedPointsRef.current.length > 0 && !isEraser) {
      const preview = session.previewPoints(predictedPointsRef.current);
      if (preview.length > 0) {
        const config = session.getConfig();
        tailStamps = preview;
        tailOpts = {
          brushType: config.brushType,
          customBrush: config.customBrush,
          preset: session.getPreset(),
          isEraser: false,
          dpr: effectiveDpr,
        };
      }
    }

    const ordered = layerManager.getOrderedLayerFBOs(layersRef.current);
    for (const { fbo, layer } of ordered) {
      if (!layer.visible) continue;

      if (drawing && layer.id === activeLayerIdRef.current) {
        // Compose layer + live stroke (+ predicted tail) in a scratch FBO so
        // eraser preview only affects this layer, then draw with the layer's
        // opacity. The stroke composites at the brush opacity (glaze model).
        const strokeOpacity = session?.getConfig().opacity ?? 1;
        const wetEdge = session?.getPreset().wetEdge ?? 0;
        const scratch = brushEngine.compositeLayerWithActiveStroke(
          fbo, isEraser, strokeOpacity, wetEdge, tailStamps, tailOpts
        );
        brushEngine.renderFBOToTarget(scratch ?? fbo, null, layer.opacity);
      } else {
        brushEngine.renderFBOToTarget(fbo, null, layer.opacity);
      }
    }
  }, [effectiveDpr]);

  const scheduleComposite = useCallback(() => {
    if (compositeRafRef.current !== null) return;
    compositeRafRef.current = requestAnimationFrame(() => {
      compositeRafRef.current = null;
      drawComposite();
    });
  }, [drawComposite]);

  // ------------------------------------------------------- stroke rendering

  const flushPendingStrokePoints = useCallback(() => {
    const session = sessionRef.current;
    const brushEngine = brushEngineRef.current;
    if (!session || !brushEngine || pendingRenderPointsRef.current.length === 0) return;

    const points = pendingRenderPointsRef.current;
    pendingRenderPointsRef.current = [];
    const stamps: ReturnType<StrokeSession['processPoint']> = [];
    for (const p of points) stamps.push(...session.processPoint(p));

    if (stamps.length > 0) {
      const config = session.getConfig();
      brushEngine.renderStamps(stamps, {
        brushType: config.brushType,
        customBrush: config.customBrush,
        preset: session.getPreset(),
        isEraser: config.isEraser,
        dpr: effectiveDpr,
      });
    }
  }, [effectiveDpr]);

  const drawFrame = useCallback(() => {
    drawRafRef.current = null;
    if (!isDrawingRef.current) return;
    flushPendingStrokePoints();
    drawComposite();
    // Keep the loop alive while drawing so predicted tail stays fresh
    drawRafRef.current = requestAnimationFrame(drawFrame);
  }, [flushPendingStrokePoints, drawComposite]);

  const startDrawLoop = useCallback(() => {
    if (drawRafRef.current === null) {
      drawRafRef.current = requestAnimationFrame(drawFrame);
    }
  }, [drawFrame]);

  const stopDrawLoop = useCallback(() => {
    if (drawRafRef.current !== null) {
      cancelAnimationFrame(drawRafRef.current);
      drawRafRef.current = null;
    }
  }, []);

  const discardActiveStroke = useCallback(() => {
    stopDrawLoop();
    isDrawingRef.current = false;
    sessionRef.current = null;
    strokePointsRef.current = [];
    pendingRenderPointsRef.current = [];
    predictedPointsRef.current = [];
    activePointerIdRef.current = null;
    layerManagerRef.current?.clearActiveStrokeFBO();
    scheduleComposite();
  }, [stopDrawLoop, scheduleComposite]);

  // ------------------------------------------------------------- gestures

  const handleGestureStart = useCallback(() => {
    isGesturingRef.current = true;
    if (isDrawingRef.current) {
      discardActiveStroke();
      onCancelStroke();
    }
  }, [discardActiveStroke, onCancelStroke]);

  const handleGestureEnd = useCallback(() => {
    isGesturingRef.current = false;
  }, []);

  const handleMultiTouchStart = useCallback(() => {
    if (isDrawingRef.current) {
      discardActiveStroke();
      onCancelStroke();
    }
  }, [discardActiveStroke, onCancelStroke]);

  const gestureCallbacks = useMemo(() => ({
    onUndo,
    onRedo,
    onTransformChange,
    onGestureStart: handleGestureStart,
    onGestureEnd: handleGestureEnd,
    onMultiTouchStart: handleMultiTouchStart,
  }), [onUndo, onRedo, onTransformChange, handleGestureStart, handleGestureEnd, handleMultiTouchStart]);

  useMultiTouchGestures(containerRef, gestureCallbacks, transform);

  // -------------------------------------------------------- initialization

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true, // required by export + eyedropper readbacks
      desynchronized: true,        // low-latency canvas hint (Chrome/Android)
      powerPreference: 'high-performance',
    });

    if (!gl) {
      console.error('WebGL2 not supported');
      return;
    }

    glRef.current = gl;

    const dpr = effectiveDpr;
    canvas.width = Math.round(canvasSize.width * dpr);
    canvas.height = Math.round(canvasSize.height * dpr);
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;

    const layerManager = new WebGLLayerManager(gl);
    layerManager.initialize(canvas.width, canvas.height);
    layerManagerRef.current = layerManager;

    const brushEngine = new WebGLBrushEngine(gl, layerManager);
    brushEngineRef.current = brushEngine;

    // Rebuild every layer from stroke history (initial mount, canvas resize,
    // and context restoration all land here).
    layerManager.syncWithLayers(layersRef.current);
    layerTrackRef.current = new Map();
    undoSnapshotRef.current = null;
    redoSnapshotRef.current = null;
    for (const layer of layersRef.current) {
      renderLayerStrokes(layer.id, layer.strokes, brushEngine, layerManager, dpr);
      layerTrackRef.current.set(layer.id, {
        count: layer.strokes.length,
        lastStroke: layer.strokes[layer.strokes.length - 1] ?? null,
      });
    }

    // Context loss handling: prevent default so the context is restorable,
    // then rebuild everything from stroke history when it comes back.
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      discardActiveStroke();
    };
    const handleContextRestored = () => {
      setGlVersion(v => v + 1);
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    onCanvasReady?.(canvas);
    onTransparentExportReady?.(() =>
      brushEngineRef.current?.renderLayersToTransparentCanvas(layersRef.current) ?? null
    );
    drawComposite();

    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      stopDrawLoop();
      if (compositeRafRef.current !== null) {
        cancelAnimationFrame(compositeRafRef.current);
        compositeRafRef.current = null;
      }
      if (!gl.isContextLost()) {
        brushEngine.dispose();
        layerManager.dispose();
      }
      glRef.current = null;
      layerManagerRef.current = null;
      brushEngineRef.current = null;
      onCanvasReady?.(null);
      onTransparentExportReady?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasSize, effectiveDpr, glVersion]);

  // Container rect caching
  const updateContainerRect = useCallback(() => {
    if (containerRef.current) {
      containerRectRef.current = containerRef.current.getBoundingClientRect();
    }
  }, []);

  useEffect(() => {
    updateContainerRect();
    window.addEventListener('resize', updateContainerRect);
    return () => window.removeEventListener('resize', updateContainerRect);
  }, [updateContainerRect]);

  // Desktop wheel navigation: pinch/ctrl+wheel zooms toward the cursor,
  // two-finger scroll pans. Native non-passive listener because React's
  // onWheel cannot reliably preventDefault page scrolling.
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const onTransformChangeRef = useRef(onTransformChange);
  onTransformChangeRef.current = onTransformChange;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const t = transformRef.current;
      const rect = containerRectRef.current ?? container.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      if (e.ctrlKey || e.metaKey) {
        // Zoom about the cursor. With transform = translate(T) scale(s)
        // rotate(θ) about the container center, the cursor-fixed update is
        // T' = (p - c) - k·(p - c - T), k = s'/s — rotation-safe, no trig.
        const factor = Math.exp(-e.deltaY * 0.01);
        const newScale = Math.min(8, Math.max(0.1, t.scale * factor));
        const k = newScale / t.scale;
        const dx = px - cx - t.offsetX;
        const dy = py - cy - t.offsetY;
        const newOffsetX = (px - cx) - k * dx;
        const newOffsetY = (py - cy) - k * dy;
        onTransformChangeRef.current(newScale, newOffsetX, newOffsetY, t.rotation);
      } else {
        onTransformChangeRef.current(t.scale, t.offsetX - e.deltaX, t.offsetY - e.deltaY, t.rotation);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Reference image preloading
  useEffect(() => {
    const cache = referenceImageCacheRef.current;
    const liveIds = new Set(referenceImages.map(r => r.id));

    referenceImages.forEach(ref => {
      if (!cache.has(ref.id)) {
        const img = new Image();
        img.onload = () => scheduleComposite();
        img.src = ref.imageData;
        cache.set(ref.id, img);
      }
    });
    cache.forEach((_, id) => {
      if (!liveIds.has(id)) cache.delete(id);
    });
    brushEngineRef.current?.pruneImageTextures(liveIds);
    scheduleComposite();
  }, [referenceImages, scheduleComposite]);

  // ------------------------------------------------- layer change handling

  useEffect(() => {
    const layerManager = layerManagerRef.current;
    const brushEngine = brushEngineRef.current;
    if (!layerManager || !brushEngine) return;

    layerManager.syncWithLayers(layers);

    const seen = new Set<string>();
    for (const layer of layers) {
      seen.add(layer.id);
      const track = layerTrackRef.current.get(layer.id);
      const count = layer.strokes.length;
      const lastStroke = layer.strokes[count - 1] ?? null;

      if (!track) {
        if (count > 0) {
          renderLayerStrokes(layer.id, layer.strokes, brushEngine, layerManager, effectiveDpr);
        }
        layerTrackRef.current.set(layer.id, { count, lastStroke });
        continue;
      }

      if (track.count === count && track.lastStroke === lastStroke) continue;

      const committed = justCommittedRef.current;
      const undoSnap = undoSnapshotRef.current;
      const redoSnap = redoSnapshotRef.current;

      if (
        committed &&
        layer.id === committed.layerId &&
        count === track.count + 1 &&
        lastStroke?.points === committed.points
      ) {
        // Our own imperative commit — FBO already has these pixels.
        justCommittedRef.current = null;
      } else if (
        undoSnap && layer.id === undoSnap.layerId &&
        count === undoSnap.count && track.count === count + 1 &&
        brushEngine.restoreLayerSnapshot(layer.id, 'undo')
      ) {
        // Fast one-step undo: restore the pre-stroke snapshot.
        // (Snapshot stays valid so undo→redo toggling remains instant.)
      } else if (
        redoSnap && layer.id === redoSnap.layerId &&
        count === redoSnap.count && track.count === count - 1 &&
        brushEngine.restoreLayerSnapshot(layer.id, 'redo')
      ) {
        // Fast one-step redo: restore the post-stroke snapshot.
      } else {
        renderLayerStrokes(layer.id, layer.strokes, brushEngine, layerManager, effectiveDpr);
        if (undoSnap?.layerId === layer.id) undoSnapshotRef.current = null;
        if (redoSnap?.layerId === layer.id) redoSnapshotRef.current = null;
      }

      layerTrackRef.current.set(layer.id, { count, lastStroke });
    }

    // Drop tracking for deleted layers
    for (const id of Array.from(layerTrackRef.current.keys())) {
      if (!seen.has(id)) layerTrackRef.current.delete(id);
    }

    scheduleComposite();
  }, [layers, effectiveDpr, scheduleComposite]);

  // Recomposite on visual-only prop changes
  useEffect(() => {
    scheduleComposite();
  }, [backgroundColor, activeLayerId, scheduleComposite]);

  // ------------------------------------------------------- input handling

  const screenToCanvas = useCallback((screenX: number, screenY: number): { x: number; y: number } => {
    const rect = containerRectRef.current;
    if (!rect) return { x: screenX, y: screenY };

    const cx = rect.width / 2;
    const cy = rect.height / 2;

    let x = screenX - rect.left - transform.offsetX;
    let y = screenY - rect.top - transform.offsetY;

    const { cos, sin } = transformMath;
    const dx = x - cx;
    const dy = y - cy;
    x = cx + dx * cos - dy * sin;
    y = cy + dx * sin + dy * cos;

    x = cx + (x - cx) / transform.scale;
    y = cy + (y - cy) / transform.scale;

    return {
      x: x - cx + canvasSize.width / 2,
      y: y - cy + canvasSize.height / 2,
    };
  }, [transform.offsetX, transform.offsetY, transform.scale, transformMath, canvasSize]);

  const getPointFromEvent = useCallback((e: PointerEvent): Point => {
    const { x, y } = screenToCanvas(e.clientX, e.clientY);

    const tiltXRad = (e.tiltX || 0) * Math.PI / 180;
    const tiltYRad = (e.tiltY || 0) * Math.PI / 180;
    const altitude = Math.PI / 2 - Math.acos(Math.cos(tiltXRad) * Math.cos(tiltYRad));

    // Pressure: real for pens; synthesized from speed for mouse/finger so
    // non-stylus strokes still get natural width/opacity variation.
    let pressure = e.pressure;
    if (e.pointerType !== 'pen') {
      const now = e.timeStamp || performance.now();
      const last = lastInputRef.current;
      if (last) {
        const dt = Math.max(1, now - last.t);
        const speed = Math.hypot(e.clientX - last.x, e.clientY - last.y) / dt;
        const target = Math.max(0.35, Math.min(1, 1 - speed * 0.35));
        synthPressureRef.current += (target - synthPressureRef.current) * 0.2;
      }
      lastInputRef.current = { x: e.clientX, y: e.clientY, t: now };
      pressure = synthPressureRef.current;
    } else if (pressure <= 0) {
      pressure = 0.5;
    }

    return {
      x, y, pressure,
      // Use the event's own timestamp: coalesced stylus events carry accurate
      // per-event times, while Date.now() stamps a whole batch identically —
      // which made velocity oscillate 4x at batch frequency (width ribbing).
      timestamp: e.timeStamp || Date.now(),
      tiltX: e.tiltX || 0,
      tiltY: e.tiltY || 0,
      altitude,
    };
  }, [screenToCanvas]);

  const shouldAllowInput = useCallback((e: React.PointerEvent): boolean => {
    if (isGesturingRef.current) return false;
    if (inputMode === 'pencil_and_touch') return true;
    return e.pointerType === 'pen' || e.pointerType === 'mouse';
  }, [inputMode]);

  // Eyedropper: read a pixel from the drawing buffer (preserveDrawingBuffer on)
  const getColorAtPoint = useCallback((canvasX: number, canvasY: number): string => {
    const gl = glRef.current;
    const canvas = canvasRef.current;
    if (!gl || !canvas || gl.isContextLost()) return '#000000';

    const px = Math.max(0, Math.min(canvas.width - 1, Math.round(canvasX * effectiveDpr)));
    const py = Math.max(0, Math.min(canvas.height - 1, canvas.height - 1 - Math.round(canvasY * effectiveDpr)));
    const pixel = new Uint8Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const toHex = (v: number) => v.toString(16).padStart(2, '0');
    return `#${toHex(pixel[0])}${toHex(pixel[1])}${toHex(pixel[2])}`;
  }, [effectiveDpr]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartPosRef.current = null;
    longPressPointerIdRef.current = null;
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    updateContainerRect();

    if (isEyedropperActive) {
      const { x, y } = screenToCanvas(e.clientX, e.clientY);
      onEyedropperPick?.(getColorAtPoint(x, y));
      return;
    }

    if (isLongPressingRef.current) return;

    // Long-press eyedropper for finger touch
    if (e.pointerType === 'touch' && onLongPressEyedropperStart) {
      cancelLongPress();
      longPressStartPosRef.current = { x: e.clientX, y: e.clientY };
      longPressPointerIdRef.current = e.pointerId;
      longPressTimerRef.current = window.setTimeout(() => {
        if (!longPressStartPosRef.current) return;
        isLongPressingRef.current = true;
        if (isDrawingRef.current) {
          discardActiveStroke();
          onCancelStroke();
        }
        navigator.vibrate?.(10);
        const canvasPos = screenToCanvas(longPressStartPosRef.current.x, longPressStartPosRef.current.y);
        onLongPressEyedropperStart(longPressStartPosRef.current, canvasPos, getColorAtPoint(canvasPos.x, canvasPos.y));
        longPressTimerRef.current = null;
      }, LONG_PRESS_DELAY);

      if (inputMode === 'pencil_only') return;
    }

    if (!shouldAllowInput(e)) return;
    if (isDrawingRef.current) return;

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    activePointerIdRef.current = e.pointerId;
    lastInputRef.current = null;
    synthPressureRef.current = 0.6;

    const point = getPointFromEvent(e.nativeEvent);

    const config: StrokeSessionConfig = {
      brushType: currentBrushType,
      color: currentColor,
      size: currentBrushSize,
      opacity: currentBrushOpacity,
      customBrush: currentCustomBrush,
      wetMix: currentWetMix,
      isEraser: currentIsEraser,
    };
    const session = new StrokeSession(config);

    const brushEngine = brushEngineRef.current;
    // Wet mixing: capture a CPU snapshot of the visible layers once per stroke.
    if (brushEngine && currentWetMix && !currentIsEraser &&
        (currentWetMix.dilution > 0 || currentWetMix.pull > 0)) {
      session.setSampler(brushEngine.createWetMixSampler(layersRef.current, effectiveDpr));
    }

    // Snapshot the pre-stroke layer for the fast undo path.
    const activeLayer = layersRef.current.find(l => l.id === activeLayerIdRef.current);
    if (brushEngine && activeLayer && brushEngine.snapshotLayer(activeLayer.id, 'undo')) {
      undoSnapshotRef.current = { layerId: activeLayer.id, count: activeLayer.strokes.length };
    } else {
      undoSnapshotRef.current = null;
    }
    redoSnapshotRef.current = null;

    sessionRef.current = session;
    strokePointsRef.current = [point];
    pendingRenderPointsRef.current = [];
    predictedPointsRef.current = [];
    isDrawingRef.current = true;

    layerManagerRef.current?.clearActiveStrokeFBO();

    // First stamp immediately for instant feedback
    const stamps = session.processPoint(point);
    if (stamps.length > 0 && brushEngine) {
      brushEngine.renderStamps(stamps, {
        brushType: config.brushType,
        customBrush: config.customBrush,
        preset: session.getPreset(),
        isEraser: config.isEraser,
        dpr: effectiveDpr,
      });
    }
    drawComposite();
    startDrawLoop();
    // Intentionally NO React state update here — a render at pen-down adds
    // latency to the exact moment the stylus touches down. The stroke config
    // captured in the session is passed back whole at commit.
  }, [
    updateContainerRect, isEyedropperActive, screenToCanvas, onEyedropperPick, getColorAtPoint,
    cancelLongPress, onLongPressEyedropperStart, inputMode, shouldAllowInput, getPointFromEvent,
    currentBrushType, currentColor, currentBrushSize, currentBrushOpacity, currentCustomBrush,
    currentWetMix, currentIsEraser, effectiveDpr, drawComposite, startDrawLoop,
    discardActiveStroke, onCancelStroke,
  ]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // Long-press eyedropper movement
    if (isLongPressingRef.current && e.pointerId === longPressPointerIdRef.current) {
      const screenPos = { x: e.clientX, y: e.clientY };
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      onLongPressEyedropperMove?.(screenPos, canvasPos, getColorAtPoint(canvasPos.x, canvasPos.y));
      return;
    }
    if (longPressStartPosRef.current && e.pointerId === longPressPointerIdRef.current) {
      const dx = e.clientX - longPressStartPosRef.current.x;
      const dy = e.clientY - longPressStartPosRef.current.y;
      if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_THRESHOLD) cancelLongPress();
    }

    if (!isDrawingRef.current || e.pointerId !== activePointerIdRef.current) return;
    e.preventDefault();

    // Full-precision input via coalesced events; rendering is RAF-batched.
    const coalesced = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ce of coalesced) {
      const p = getPointFromEvent(ce);
      strokePointsRef.current.push(p);
      pendingRenderPointsRef.current.push(p);
    }

    // Predicted events feed the low-latency tail. Keep it short — long
    // predictions overshoot on curves and pop at the stroke head.
    const predicted = e.nativeEvent.getPredictedEvents?.() ?? [];
    predictedPointsRef.current = predicted.slice(0, 2).map(pe => getPointFromEvent(pe));
  }, [screenToCanvas, getColorAtPoint, onLongPressEyedropperMove, cancelLongPress, getPointFromEvent]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    // Long-press eyedropper end
    if (isLongPressingRef.current && e.pointerId === longPressPointerIdRef.current) {
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      onLongPressEyedropperEnd?.(getColorAtPoint(canvasPos.x, canvasPos.y));
      isLongPressingRef.current = false;
      cancelLongPress();
      return;
    }
    cancelLongPress();

    if (!isDrawingRef.current || e.pointerId !== activePointerIdRef.current) return;
    e.preventDefault();
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    stopDrawLoop();
    predictedPointsRef.current = [];

    const session = sessionRef.current;
    const brushEngine = brushEngineRef.current;
    const layerManager = layerManagerRef.current;
    const layerId = activeLayerIdRef.current;

    const finalPoint = getPointFromEvent(e.nativeEvent);
    strokePointsRef.current.push(finalPoint);

    if (session && brushEngine && layerManager) {
      const config = session.getConfig();
      const points = compactPoints(strokePointsRef.current);

      // Deterministic finalize: re-render the whole stroke through the same
      // full-stroke pass used by replay (correct end taper, exact pixels).
      // Wet-mix colors recorded live are replayed by distance, so the final
      // pass and all future replays reproduce the mixing exactly.
      layerManager.clearActiveStrokeFBO();
      const liveMixSamples = session.getMixSamples();
      const finalConfig: StrokeSessionConfig = liveMixSamples.length > 0
        ? { ...config, mixSamples: liveMixSamples }
        : config;
      const finalPass = StrokeSession.processFullStroke(finalConfig, points);

      if (finalPass.stamps.length > 0) {
        brushEngine.renderStamps(finalPass.stamps, {
          brushType: config.brushType,
          customBrush: config.customBrush,
          preset: session.getPreset(),
          isEraser: config.isEraser,
          dpr: effectiveDpr,
        });
      }

      brushEngine.mergeActiveStrokeToLayer(layerId, config.isEraser, config.opacity, session.getPreset().wetEdge);

      // Post-stroke snapshot enables the fast redo path.
      const activeLayer = layersRef.current.find(l => l.id === layerId);
      if (activeLayer && brushEngine.snapshotLayer(layerId, 'redo')) {
        redoSnapshotRef.current = { layerId, count: activeLayer.strokes.length + 1 };
      }

      justCommittedRef.current = { layerId, points };
      isDrawingRef.current = false;
      sessionRef.current = null;
      strokePointsRef.current = [];
      pendingRenderPointsRef.current = [];
      activePointerIdRef.current = null;

      scheduleComposite();
      onEndStroke(points, liveMixSamples.length > 0 ? liveMixSamples : undefined, {
        brush: config.brushType,
        color: config.color,
        size: config.size,
        opacity: config.opacity,
        customBrushPreset: config.customBrush,
        wetMix: config.wetMix,
        isEraser: config.isEraser,
      });
    } else {
      discardActiveStroke();
      onCancelStroke();
    }
  }, [
    screenToCanvas, getColorAtPoint, onLongPressEyedropperEnd, cancelLongPress, stopDrawLoop,
    getPointFromEvent, effectiveDpr, scheduleComposite, onEndStroke, discardActiveStroke, onCancelStroke,
  ]);

  // Paint-bucket fill via color drag-and-drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-color')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const color = e.dataTransfer.getData('application/x-color');
    const brushEngine = brushEngineRef.current;
    if (!color || !brushEngine || !onFill) return;

    updateContainerRect();
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    if (x < 0 || y < 0 || x >= canvasSize.width || y >= canvasSize.height) return;

    const layerId = activeLayerIdRef.current;
    const activeLayer = layersRef.current.find(l => l.id === layerId);
    if (!activeLayer) return;

    // Pre-fill snapshot enables instant undo of the fill.
    if (brushEngine.snapshotLayer(layerId, 'undo')) {
      undoSnapshotRef.current = { layerId, count: activeLayer.strokes.length };
    }

    if (!brushEngine.applyFillToLayer(layerId, x, y, color, effectiveDpr)) return;

    if (brushEngine.snapshotLayer(layerId, 'redo')) {
      redoSnapshotRef.current = { layerId, count: activeLayer.strokes.length + 1 };
    }

    const points: Point[] = [{ x, y, pressure: 1, timestamp: Date.now() }];
    justCommittedRef.current = { layerId, points };
    scheduleComposite();
    onFill(points, color);
  }, [onFill, updateContainerRect, screenToCanvas, canvasSize, effectiveDpr, scheduleComposite]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    cancelLongPress();
    if (isLongPressingRef.current && e.pointerId === longPressPointerIdRef.current) {
      isLongPressingRef.current = false;
      return;
    }
    if (isDrawingRef.current && e.pointerId === activePointerIdRef.current) {
      discardActiveStroke();
      onCancelStroke();
    }
  }, [cancelLongPress, discardActiveStroke, onCancelStroke]);

  const canvasStyle = useMemo(() => ({
    transform: `translate(${transform.offsetX}px, ${transform.offsetY}px) scale(${transform.scale}) rotate(${transform.rotation}deg)`,
    transformOrigin: 'center center',
  }), [transform]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden flex items-center justify-center"
      style={{ touchAction: 'none' }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <canvas
        ref={canvasRef}
        className={`block ${isEyedropperActive ? 'cursor-crosshair' : ''}`}
        style={canvasStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      />
    </div>
  );
};
