import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { Stroke, Point, Layer, LayerMergeEvent, WetMixSettings, ReferenceImage } from '@/types/drawing';
import { renderStroke, renderStrokeSegment, renderEraserStroke, decimatePoints } from '@/utils/brushEngine';
import { floodFill } from '@/utils/floodFill';
import { InputMode } from '@/types/drawing';
import { CanvasTransform } from '@/types/canvasTransform';
import { CanvasSize } from '@/types/canvasSize';
import { useMultiTouchGestures } from '@/hooks/useMultiTouchGestures';

// Max points before decimation kicks in - prevents memory issues on iPad
const MAX_ERASER_POINTS = 200;

// Long-press eyedropper constants
const LONG_PRESS_DELAY = 500; // ms
const LONG_PRESS_MOVE_THRESHOLD = 10; // px

interface CanvasProps {
  layers: Layer[];
  currentStroke: Stroke | null;
  onStartStroke: (point: Point) => void;
  onContinueStroke: (point: Point) => void;
  onEndStroke: () => void;
  inputMode: InputMode;
  backgroundColor: string;
  activeLayerId: string;
  pendingLayerMerge: LayerMergeEvent | null;
  onClearPendingMerge: () => void;
  transform: CanvasTransform;
  onTransformChange: (scale: number, offsetX: number, offsetY: number, rotation: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  canvasSize: CanvasSize;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
  // Eyedropper
  isEyedropperActive?: boolean;
  onEyedropperPick?: (color: string) => void;
  // Long-press eyedropper loupe
  onLongPressEyedropperStart?: (screenPos: { x: number; y: number }, canvasPos: { x: number; y: number }, color: string) => void;
  onLongPressEyedropperMove?: (screenPos: { x: number; y: number }, canvasPos: { x: number; y: number }, color: string) => void;
  onLongPressEyedropperEnd?: (color: string) => void;
  // Reference images
  referenceImages?: ReferenceImage[];
  // Flood fill callback
  onFloodFill?: (layerId: string, x: number, y: number, color: string) => void;
}

export const Canvas = ({
  layers,
  currentStroke,
  onStartStroke,
  onContinueStroke,
  onEndStroke,
  inputMode,
  backgroundColor,
  activeLayerId,
  pendingLayerMerge,
  onClearPendingMerge,
  transform,
  onTransformChange,
  onUndo,
  onRedo,
  canvasSize,
  onCanvasReady,
  isEyedropperActive = false,
  onEyedropperPick,
  onLongPressEyedropperStart,
  onLongPressEyedropperMove,
  onLongPressEyedropperEnd,
  referenceImages = [],
  onFloodFill,
}: CanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const activeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawingRef = useRef(false);
  const lastRenderedPointIndexRef = useRef(0);
  const lastLayerStrokeCountsRef = useRef<Map<string, number>>(new Map());
  const lastBackgroundRef = useRef(backgroundColor);
  const lastStrokeWasEraserRef = useRef(false);
  
  // Eraser optimization refs
  const eraserRafRef = useRef<number | null>(null);
  const eraserPointsToRenderRef = useRef<number>(0);
  const eraserContextSetupRef = useRef(false);
  
  // Cached container rect to avoid getBoundingClientRect on every pointer move
  const containerRectRef = useRef<DOMRect | null>(null);

  // RAF-based composite throttling - prevents 240 composites/sec during drawing
  const compositeDirtyRef = useRef(false);
  const compositeRafIdRef = useRef<number | null>(null);

  // When a stroke ends, we keep the active buffer around until it is merged into the layer canvas.
  // This prevents the "stroke disappears / changes" issues due to effect timing.
  const pendingStrokeMergeRef = useRef(false);
  const strokeLayerIdRef = useRef<string | null>(null);
  const isGesturingRef = useRef(false);

  // Long-press eyedropper refs
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressPointerIdRef = useRef<number | null>(null);
  const isLongPressingRef = useRef(false);

  // Drag-and-drop fill state
  const [isDragOver, setIsDragOver] = useState(false);

  // RAF-throttled pointer move refs (iOS performance: reduce 240Hz → 60Hz)
  const pendingPointRef = useRef<Point | null>(null);
  const pointRafIdRef = useRef<number | null>(null);

  // Reference image cache (iOS performance: avoid new Image() per frame)
  const referenceImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Multi-touch gesture handling
  const handleGestureStart = useCallback(() => {
    isGesturingRef.current = true;
    // Cancel any in-progress stroke
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      onEndStroke();
    }
  }, [onEndStroke]);

  const handleGestureEnd = useCallback(() => {
    isGesturingRef.current = false;
  }, []);

  // Called immediately when 2+ fingers are detected (before gesture/tap is determined)
  const handleMultiTouchStart = useCallback(() => {
    // Cancel any in-progress stroke immediately when multi-touch detected
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      onEndStroke();
    }
  }, [onEndStroke]);

  const gestureCallbacks = useMemo(() => ({
    onUndo,
    onRedo,
    onTransformChange,
    onGestureStart: handleGestureStart,
    onGestureEnd: handleGestureEnd,
    onMultiTouchStart: handleMultiTouchStart,
  }), [onUndo, onRedo, onTransformChange, handleGestureStart, handleGestureEnd, handleMultiTouchStart]);

  useMultiTouchGestures(containerRef, gestureCallbacks, transform);

  // Create a hash to detect layer config changes (id, visibility, opacity, order)
  const layerConfigHash = useMemo(() => {
    return layers.map(l => `${l.id}:${l.visible}:${l.opacity}:${l.strokes.length}`).join('|');
  }, [layers]);

  // Pre-calculate transform math values (cos, sin) to avoid recalculating on every pointer move
  const transformMath = useMemo(() => {
    const radians = -transform.rotation * Math.PI / 180;
    return {
      cos: Math.cos(radians),
      sin: Math.sin(radians),
    };
  }, [transform.rotation]);

  // Update cached container rect
  const updateContainerRect = useCallback(() => {
    if (containerRef.current) {
      containerRectRef.current = containerRef.current.getBoundingClientRect();
    }
  }, []);

  // Compute effective DPR once (capped on mobile for performance) - defined early for use in getLayerCanvas
  const effectiveDpr = useMemo(() => {
    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    return isMobileDevice ? Math.min(window.devicePixelRatio || 1, 1.5) : (window.devicePixelRatio || 1);
  }, []);

  // Get or create a canvas for a layer
  const getLayerCanvas = useCallback((layerId: string, width: number, height: number, dpr: number) => {
    let canvas = layerCanvasesRef.current.get(layerId);
    if (!canvas) {
      canvas = document.createElement('canvas');
      layerCanvasesRef.current.set(layerId, canvas);
    }
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    }
    return canvas;
  }, []);

  // Cache for layer contexts - cleared when layers change
  const layerCtxCacheRef = useRef<Map<string, CanvasRenderingContext2D>>(new Map());

  // Clean up canvases for deleted layers
  useEffect(() => {
    const currentLayerIds = new Set(layers.map(l => l.id));
    const canvasLayerIds = Array.from(layerCanvasesRef.current.keys());
    canvasLayerIds.forEach(id => {
      // Don't delete the source canvas if we have a pending merge for it
      if (pendingLayerMerge?.sourceLayerId === id) return;
      
      if (!currentLayerIds.has(id)) {
        layerCanvasesRef.current.delete(id);
        lastLayerStrokeCountsRef.current.delete(id);
        layerCtxCacheRef.current.delete(id); // Clean up cached context
      }
    });
  }, [layers, pendingLayerMerge]);


  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Use custom canvas size instead of container size
    const { width, height } = canvasSize;
    const dpr = effectiveDpr;
    
    // Create or resize active canvas
    if (!activeCanvasRef.current) {
      activeCanvasRef.current = document.createElement('canvas');
    }
    const activeCanvas = activeCanvasRef.current;
    
    // Resize main canvas to custom size
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    
    activeCanvas.width = width * dpr;
    activeCanvas.height = height * dpr;
    
    const ctx = canvas.getContext('2d');
    const activeCtx = activeCanvas.getContext('2d');
    
    if (ctx) ctx.scale(dpr, dpr);
    if (activeCtx) activeCtx.scale(dpr, dpr);
    
    // Reset layer canvases
    layerCanvasesRef.current.clear();
    lastLayerStrokeCountsRef.current.clear();
  }, [canvasSize, effectiveDpr]);

  useEffect(() => {
    resizeCanvas();
    updateContainerRect();
    
    // Notify parent that canvas is ready
    if (canvasRef.current && onCanvasReady) {
      onCanvasReady(canvasRef.current);
    }
    
    const handleResize = () => {
      updateContainerRect();
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      // Clean up any pending eraser RAF on unmount
      if (eraserRafRef.current) {
        cancelAnimationFrame(eraserRafRef.current);
        eraserRafRef.current = null;
      }
      // Clean up pointer RAF on unmount
      if (pointRafIdRef.current) {
        cancelAnimationFrame(pointRafIdRef.current);
        pointRafIdRef.current = null;
      }
      // Notify parent canvas is gone
      if (onCanvasReady) {
        onCanvasReady(null);
      }
    };
  }, [resizeCanvas, updateContainerRect, onCanvasReady]);

  // Pre-load and cache reference images (iOS performance: avoid new Image() per frame)
  useEffect(() => {
    const cache = referenceImageCacheRef.current;
    const currentIds = new Set(referenceImages.map(r => r.id));
    
    // Load new images
    referenceImages.forEach(ref => {
      if (!cache.has(ref.id)) {
        const img = new Image();
        img.onload = () => {
          compositeDirtyRef.current = true; // Trigger re-composite when loaded
        };
        img.src = ref.imageData;
        cache.set(ref.id, img);
      }
    });
    
    // Remove stale entries
    cache.forEach((_, id) => {
      if (!currentIds.has(id)) cache.delete(id);
    });
  }, [referenceImages]);

  // Get the composited canvas for wet mixing (all layers below + current layer content)
  const getCompositedSourceCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext('2d');
  }, []);

  // Render a single layer to its canvas
  // isFullRerender: true when re-rendering entire layer (undo/redo) - disables wet mixing
  const renderLayer = useCallback((layer: Layer, isFullRerender: boolean = true) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const { width, height } = canvasSize;
    const dpr = effectiveDpr;
    
    const layerCanvas = getLayerCanvas(layer.id, width, height, dpr);
    const ctx = layerCanvas.getContext('2d');
    if (!ctx) return;
    
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
    ctx.restore();
    
    // CRITICAL: Don't use wet mixing during full re-renders (undo/redo)
    // This prevents color inversion bugs from sampling stale canvas state
    // Wet mixing should only happen during live drawing when canvas state is current
    layer.strokes.forEach(stroke => {
      // Pass undefined for wetMix and sourceCtx during re-renders to use original colors
      renderStroke(
        ctx, 
        stroke.points, 
        stroke.brush, 
        stroke.color, 
        stroke.size, 
        stroke.opacity ?? 1, 
        stroke.customBrushPreset, 
        isFullRerender ? undefined : stroke.wetMix,  // Disable wet mix on re-render
        undefined,  // Never sample during re-render
        dpr,
        stroke.isEraser ?? false
      );
    });
    
    lastLayerStrokeCountsRef.current.set(layer.id, layer.strokes.length);
  }, [getLayerCanvas, canvasSize, effectiveDpr]);

  const clearActiveCanvas = useCallback(() => {
    const activeCanvas = activeCanvasRef.current;
    if (!activeCanvas) return;

    const activeCtx = activeCanvas.getContext('2d');
    if (!activeCtx) return;

    activeCtx.save();
    activeCtx.setTransform(1, 0, 0, 1, 0, 0);
    activeCtx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
    activeCtx.restore();
  }, []);

  // Merge active stroke buffer into a layer canvas (pixel-perfect, avoids re-render drift)
  const mergeActiveToLayer = useCallback((layerId: string, isEraser: boolean = false) => {
    const activeCanvas = activeCanvasRef.current;
    if (!activeCanvas) return;

    const layerCanvas = layerCanvasesRef.current.get(layerId);
    if (!layerCanvas) return;

    const ctx = layerCanvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (isEraser) {
      ctx.globalCompositeOperation = 'destination-out';
    }
    ctx.drawImage(activeCanvas, 0, 0);
    ctx.restore();
  }, []);

  // Handle pixel-based layer merge (avoids re-rendering strokes)
  useEffect(() => {
    if (!pendingLayerMerge) return;

    const { sourceLayerId, targetLayerId } = pendingLayerMerge;
    const sourceCanvas = layerCanvasesRef.current.get(sourceLayerId);
    const targetCanvas = layerCanvasesRef.current.get(targetLayerId);

    if (sourceCanvas && targetCanvas) {
      const ctx = targetCanvas.getContext('2d');
      if (ctx) {
        // Draw source canvas pixels on top of target canvas
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(sourceCanvas, 0, 0);
        ctx.restore();
      }
    }

    // Update stroke count for target layer
    const targetLayer = layers.find(l => l.id === targetLayerId);
    if (targetLayer) {
      lastLayerStrokeCountsRef.current.set(targetLayerId, targetLayer.strokes.length);
    }

    // Clean up source canvas now that merge is complete
    layerCanvasesRef.current.delete(sourceLayerId);
    lastLayerStrokeCountsRef.current.delete(sourceLayerId);

    // Clear the pending merge
    onClearPendingMerge();
  }, [pendingLayerMerge, layers, onClearPendingMerge]);

  // Handle layer changes - check each layer individually
  useEffect(() => {
    // Skip if we just did a pixel-based merge (handled above)
    if (pendingLayerMerge) return;

    const strokeLayerId = strokeLayerIdRef.current ?? activeLayerId;

    layers.forEach(layer => {
      const lastCount = lastLayerStrokeCountsRef.current.get(layer.id) ?? -1;
      const currentCount = layer.strokes.length;

      if (lastCount === -1) {
        // New layer, render it
        renderLayer(layer);
        return;
      }

      if (currentCount === lastCount) return;

      // Only do the pixel-merge optimization when we KNOW a stroke just ended.
      // This prevents merges/reorders from being misinterpreted as a "new stroke" event.
      // Note: Eraser strokes are drawn directly to the layer, so they skip this merge step.
      const shouldPixelMerge =
        pendingStrokeMergeRef.current &&
        layer.id === strokeLayerId &&
        currentCount === lastCount + 1 &&
        !lastStrokeWasEraserRef.current; // Skip merge for eraser (already on layer)

      if (shouldPixelMerge) {
        mergeActiveToLayer(layer.id, false);
        lastLayerStrokeCountsRef.current.set(layer.id, currentCount);
        pendingStrokeMergeRef.current = false;
        clearActiveCanvas();
        return;
      }
      
      // For eraser strokes that just ended, just update the count (layer already has the erasure)
      if (pendingStrokeMergeRef.current && layer.id === strokeLayerId && lastStrokeWasEraserRef.current) {
        lastLayerStrokeCountsRef.current.set(layer.id, currentCount);
        pendingStrokeMergeRef.current = false;
        lastStrokeWasEraserRef.current = false;
        return;
      }

      // Anything else (undo, multiple strokes, etc): re-render the layer fully.
      if (pendingStrokeMergeRef.current && layer.id === strokeLayerId) {
        pendingStrokeMergeRef.current = false;
        clearActiveCanvas();
      }

      renderLayer(layer);
    });
  }, [layers, activeLayerId, renderLayer, mergeActiveToLayer, clearActiveCanvas, pendingLayerMerge]);

  // Handle background color changes for eraser strokes
  useEffect(() => {
    const oldBg = lastBackgroundRef.current;
    if (oldBg !== backgroundColor) {
      // Check if any layer has eraser strokes
      const hasEraserStrokes = layers.some(layer => 
        layer.strokes.some(s => s.color === oldBg)
      );
      if (hasEraserStrokes) {
        layers.forEach(layer => renderLayer(layer));
      }
    }
    lastBackgroundRef.current = backgroundColor;
  }, [backgroundColor, layers, renderLayer]);

  // Get cached layer context
  const getLayerCtx = useCallback((layerId: string): CanvasRenderingContext2D | null => {
    const cached = layerCtxCacheRef.current.get(layerId);
    if (cached) return cached;
    
    const layerCanvas = layerCanvasesRef.current.get(layerId);
    if (!layerCanvas) return null;
    
    const ctx = layerCanvas.getContext('2d');
    if (ctx) {
      layerCtxCacheRef.current.set(layerId, ctx);
    }
    return ctx;
  }, []);

  // Handle current stroke with incremental rendering
  useEffect(() => {
    const activeCanvas = activeCanvasRef.current;
    if (!activeCanvas) return;

    const activeCtx = activeCanvas.getContext('2d');
    if (!activeCtx) return;

    if (!currentStroke) {
      // Clean up eraser RAF and context state when stroke ends
      if (eraserRafRef.current) {
        cancelAnimationFrame(eraserRafRef.current);
        eraserRafRef.current = null;
      }
      eraserContextSetupRef.current = false;
      eraserPointsToRenderRef.current = 0;
      
      // If a stroke just ended, the pointer-up handler sets pendingStrokeMergeRef.current
      // and the layer-change effect will merge + clear this buffer.
      if (!pendingStrokeMergeRef.current) {
        clearActiveCanvas();
      }
      lastRenderedPointIndexRef.current = 0;
      return;
    }

    // While drawing, we never want to keep a previous pending merge flag.
    pendingStrokeMergeRef.current = false;
    
    // Track if this stroke is an eraser for proper merge handling
    lastStrokeWasEraserRef.current = currentStroke.isEraser ?? false;

    const points = currentStroke.points;
    const isEraser = currentStroke.isEraser ?? false;
    
    // ============= OPTIMIZED ERASER RENDERING =============
    // Uses simple line renderer, RAF batching, and point decimation
    if (isEraser) {
      const layerCtx = getLayerCtx(activeLayerId);
      if (!layerCtx) return;
      
      // Set up context ONCE at stroke start (not per segment)
      if (!eraserContextSetupRef.current) {
        layerCtx.save();
        layerCtx.globalCompositeOperation = 'destination-out';
        layerCtx.globalAlpha = 1;
        eraserContextSetupRef.current = true;
        eraserPointsToRenderRef.current = 0;
      }
      
      const newPointCount = points.length;
      const lastRendered = lastRenderedPointIndexRef.current;
      
      // Only render if we have new points
      if (newPointCount > lastRendered && newPointCount >= 2) {
        // Cancel any pending RAF to batch multiple point updates
        if (eraserRafRef.current) {
          cancelAnimationFrame(eraserRafRef.current);
        }
        
        // Batch rendering in next animation frame
        eraserRafRef.current = requestAnimationFrame(() => {
          eraserRafRef.current = null;
          
          // Get current points (may have more than when we scheduled)
          const currentPoints = currentStroke?.points;
          if (!currentPoints || currentPoints.length < 2) return;
          
          // Decimate points if stroke is getting too long (memory optimization)
          let pointsToRender = currentPoints;
          if (currentPoints.length > MAX_ERASER_POINTS) {
            pointsToRender = decimatePoints(currentPoints, 2);
          }
          
          const startIdx = Math.max(0, lastRenderedPointIndexRef.current - 1);
          
          // Use optimized simple eraser renderer
          renderEraserStroke(
            layerCtx,
            pointsToRender,
            currentStroke?.size ?? 10,
            startIdx
          );
          
          lastRenderedPointIndexRef.current = currentPoints.length;
        });
      }
      
      return; // Skip normal active canvas rendering
    }
    
    // Non-eraser strokes: use the active canvas buffer as before
    // Get source canvas for wet mixing (the composited main canvas)
    // This is safe during live drawing as the canvas state is current
    const dpr = effectiveDpr;
    const sourceCtx = getCompositedSourceCanvas();

    if (points.length <= 2 || lastRenderedPointIndexRef.current === 0) {
      clearActiveCanvas();

      if (points.length >= 2) {
        renderStroke(
          activeCtx, 
          points, 
          currentStroke.brush, 
          currentStroke.color, 
          currentStroke.size, 
          currentStroke.opacity ?? 1, 
          currentStroke.customBrushPreset, 
          currentStroke.wetMix, 
          sourceCtx ?? undefined,
          dpr,
          false
        );
      }
      lastRenderedPointIndexRef.current = points.length;
    } else if (points.length > lastRenderedPointIndexRef.current) {
      const startIdx = Math.max(0, lastRenderedPointIndexRef.current - 2);
      renderStrokeSegment(
        activeCtx,
        points,
        startIdx,
        currentStroke.brush,
        currentStroke.color,
        currentStroke.size,
        currentStroke.opacity ?? 1,
        currentStroke.customBrushPreset,
        currentStroke.wetMix,
        sourceCtx ?? undefined,
        dpr,
        false
      );
      lastRenderedPointIndexRef.current = points.length;
    }
  }, [currentStroke, clearActiveCanvas, getCompositedSourceCanvas, activeLayerId, effectiveDpr]);

  // Mark composite as dirty when dependencies change
  useEffect(() => {
    compositeDirtyRef.current = true;
  }, [currentStroke, layers, backgroundColor, activeLayerId, layerConfigHash, referenceImages]);

  // RAF-based composite loop - runs at max 60fps instead of 240+/sec
  useEffect(() => {
    const canvas = canvasRef.current;
    const activeCanvas = activeCanvasRef.current;
    if (!canvas || !activeCanvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const compositeLoop = () => {
      if (compositeDirtyRef.current) {
        compositeDirtyRef.current = false;
        
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        // Fill background
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw reference images below layers (use cached images for performance)
        referenceImages.forEach(ref => {
          if (!ref.visible) return;
          
          const cachedImg = referenceImageCacheRef.current.get(ref.id);
          if (!cachedImg?.complete) return; // Skip if not loaded yet
          
          ctx.save();
          ctx.globalAlpha = ref.opacity;
          ctx.translate(ref.transform.x + (ref.originalWidth * ref.transform.scale) / 2, 
                        ref.transform.y + (ref.originalHeight * ref.transform.scale) / 2);
          ctx.rotate(ref.transform.rotation * Math.PI / 180);
          ctx.drawImage(
            cachedImg,
            -(ref.originalWidth * ref.transform.scale) / 2,
            -(ref.originalHeight * ref.transform.scale) / 2,
            ref.originalWidth * ref.transform.scale,
            ref.originalHeight * ref.transform.scale
          );
          ctx.restore();
        });
        
        // Draw each layer in order (index 0 = bottom) with its opacity
        layers.forEach(layer => {
          if (!layer.visible) return;
          
          const layerCanvas = layerCanvasesRef.current.get(layer.id);
          if (!layerCanvas) return;
          
          ctx.globalAlpha = layer.opacity;
          ctx.drawImage(layerCanvas, 0, 0);
          
          // Draw active stroke on top of active layer (only for non-eraser strokes)
          // Eraser strokes are drawn directly to the layer canvas, so no need to composite here
          if (layer.id === activeLayerId && currentStroke && !currentStroke.isEraser) {
            ctx.drawImage(activeCanvas, 0, 0);
          }
        });
        
        // Reset alpha
        ctx.globalAlpha = 1;
        ctx.restore();
      }
      
      compositeRafIdRef.current = requestAnimationFrame(compositeLoop);
    };
    
    compositeRafIdRef.current = requestAnimationFrame(compositeLoop);
    
    return () => {
      if (compositeRafIdRef.current) {
        cancelAnimationFrame(compositeRafIdRef.current);
        compositeRafIdRef.current = null;
      }
    };
  }, [backgroundColor, activeLayerId, layers, referenceImages, currentStroke]);

  // Convert screen coordinates to canvas coordinates (accounting for transform and centered canvas)
  // Uses cached rect and pre-calculated trig values for performance
  const screenToCanvas = useCallback((screenX: number, screenY: number): { x: number; y: number } => {
    const rect = containerRectRef.current;
    if (!rect) return { x: screenX, y: screenY };

    // Container center (viewport center)
    const containerCenterX = rect.width / 2;
    const containerCenterY = rect.height / 2;

    // Get position relative to container
    let x = screenX - rect.left;
    let y = screenY - rect.top;

    // Reverse the transform: first remove offset, then unrotate, then unscale
    x -= transform.offsetX;
    y -= transform.offsetY;

    // Move to center, unrotate, move back (using pre-calculated cos/sin)
    const { cos, sin } = transformMath;
    const dx = x - containerCenterX;
    const dy = y - containerCenterY;
    x = containerCenterX + dx * cos - dy * sin;
    y = containerCenterY + dx * sin + dy * cos;

    // Unscale from center
    x = containerCenterX + (x - containerCenterX) / transform.scale;
    y = containerCenterY + (y - containerCenterY) / transform.scale;

    // Convert from container-centered coordinates to canvas coordinates
    // The canvas is centered in the container, so we need to adjust
    x = x - containerCenterX + canvasSize.width / 2;
    y = y - containerCenterY + canvasSize.height / 2;

    return { x, y };
  }, [transform.offsetX, transform.offsetY, transform.scale, transformMath, canvasSize]);

  const getPointFromEvent = useCallback((e: PointerEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, pressure: 0.5, timestamp: Date.now() };

    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    
    const tiltXRad = (e.tiltX || 0) * Math.PI / 180;
    const tiltYRad = (e.tiltY || 0) * Math.PI / 180;
    const altitude = Math.PI / 2 - Math.acos(Math.cos(tiltXRad) * Math.cos(tiltYRad));
    
    return {
      x,
      y,
      pressure: e.pressure > 0 ? e.pressure : 0.5,
      timestamp: Date.now(),
      tiltX: e.tiltX || 0,
      tiltY: e.tiltY || 0,
      altitude: altitude,
    };
  }, [screenToCanvas]);

  const shouldAllowInput = useCallback((e: React.PointerEvent): boolean => {
    // Don't allow input during gestures
    if (isGesturingRef.current) return false;
    if (inputMode === 'pencil_and_touch') return true;
    return e.pointerType === 'pen';
  }, [inputMode]);

  // Eyedropper color picking - returns hex color at canvas position
  const getColorAtPoint = useCallback((canvasX: number, canvasY: number): string => {
    const canvas = canvasRef.current;
    if (!canvas) return '#000000';
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return '#000000';
    
    const dpr = effectiveDpr;
    const imageData = ctx.getImageData(canvasX * dpr, canvasY * dpr, 1, 1);
    const [r, g, b] = imageData.data;
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }, [effectiveDpr]);

  const pickColorAtPoint = useCallback((x: number, y: number) => {
    if (!onEyedropperPick) return;
    const hex = getColorAtPoint(x, y);
    onEyedropperPick(hex);
  }, [onEyedropperPick, getColorAtPoint]);

  // Cancel long press timer
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
    
    const container = containerRef.current;
    if (!container) return;

    // Cache the container rect at stroke start for consistent coords during stroke
    updateContainerRect();

    // Handle eyedropper mode (click-based) - works for all input types
    if (isEyedropperActive) {
      const { x, y } = screenToCanvas(e.clientX, e.clientY);
      pickColorAtPoint(x, y);
      return;
    }

    // If already long-pressing, ignore additional pointers
    if (isLongPressingRef.current) return;

    // Start long-press detection for finger touch (works even in pencil_only mode)
    // This is a navigation/selection action, not drawing
    if (e.pointerType === 'touch' && onLongPressEyedropperStart) {
      cancelLongPress();
      longPressStartPosRef.current = { x: e.clientX, y: e.clientY };
      longPressPointerIdRef.current = e.pointerId;

      longPressTimerRef.current = window.setTimeout(() => {
        if (!longPressStartPosRef.current) return;
        
        // Activate loupe mode
        isLongPressingRef.current = true;
        
        // Haptic feedback if available
        if (navigator.vibrate) {
          navigator.vibrate(10);
        }
        
        const canvasPos = screenToCanvas(longPressStartPosRef.current.x, longPressStartPosRef.current.y);
        const color = getColorAtPoint(canvasPos.x, canvasPos.y);
        onLongPressEyedropperStart(longPressStartPosRef.current, canvasPos, color);
        
        longPressTimerRef.current = null;
      }, LONG_PRESS_DELAY);

      // In pencil_only mode, don't proceed to drawing - only allow long-press eyedropper
      if (inputMode === 'pencil_only') {
        return;
      }
    }

    // Now check if drawing is allowed (this blocks finger drawing in pencil_only mode)
    if (!shouldAllowInput(e)) return;

    container.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    lastRenderedPointIndexRef.current = 0;

    // Remember which layer this stroke belongs to, so later merges don't confuse the renderer.
    strokeLayerIdRef.current = activeLayerId;
    pendingStrokeMergeRef.current = false;

    const point = getPointFromEvent(e.nativeEvent);
    onStartStroke(point);
  }, [getPointFromEvent, onStartStroke, shouldAllowInput, activeLayerId, updateContainerRect, isEyedropperActive, screenToCanvas, pickColorAtPoint, cancelLongPress, onLongPressEyedropperStart, getColorAtPoint, inputMode]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // Handle long-press eyedropper movement
    if (isLongPressingRef.current && e.pointerId === longPressPointerIdRef.current) {
      const screenPos = { x: e.clientX, y: e.clientY };
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      const color = getColorAtPoint(canvasPos.x, canvasPos.y);
      onLongPressEyedropperMove?.(screenPos, canvasPos, color);
      return;
    }

    // Check if we should cancel long-press (moved too much before timer fired)
    if (longPressStartPosRef.current && e.pointerId === longPressPointerIdRef.current) {
      const dx = e.clientX - longPressStartPosRef.current.x;
      const dy = e.clientY - longPressStartPosRef.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > LONG_PRESS_MOVE_THRESHOLD) {
        cancelLongPress();
      }
    }

    if (isEyedropperActive) return; // Don't draw while eyedropper is active
    if (!isDrawingRef.current) return;
    if (!shouldAllowInput(e)) return;
    e.preventDefault();
    
    // RAF-throttle pointer events for iOS performance (240Hz → 60Hz)
    const point = getPointFromEvent(e.nativeEvent);
    pendingPointRef.current = point;
    
    if (!pointRafIdRef.current) {
      pointRafIdRef.current = requestAnimationFrame(() => {
        if (pendingPointRef.current && isDrawingRef.current) {
          onContinueStroke(pendingPointRef.current);
        }
        pointRafIdRef.current = null;
      });
    }
  }, [getPointFromEvent, onContinueStroke, shouldAllowInput, isEyedropperActive, screenToCanvas, getColorAtPoint, onLongPressEyedropperMove, cancelLongPress]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    // Handle long-press eyedropper end FIRST (before canceling, since cancelLongPress nulls the pointer ID)
    if (isLongPressingRef.current && e.pointerId === longPressPointerIdRef.current) {
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      const color = getColorAtPoint(canvasPos.x, canvasPos.y);
      onLongPressEyedropperEnd?.(color);
      isLongPressingRef.current = false;
      longPressPointerIdRef.current = null;
      
      // Release capture and don't process as stroke end
      const container = containerRef.current;
      if (container) {
        container.releasePointerCapture(e.pointerId);
      }
      isDrawingRef.current = false;
      cancelLongPress();
      return;
    }

    // Cancel any pending long-press timer
    cancelLongPress();

    if (isEyedropperActive) return;
    if (!isDrawingRef.current) return;
    e.preventDefault();

    const container = containerRef.current;
    if (container) {
      container.releasePointerCapture(e.pointerId);
    }

    isDrawingRef.current = false;
    
    // Clean up eraser context state - restore the saved context
    if (eraserContextSetupRef.current) {
      const layerCtx = getLayerCtx(activeLayerId);
      if (layerCtx) {
        layerCtx.restore();
      }
      eraserContextSetupRef.current = false;
    }
    
    // Cancel any pending eraser RAF
    if (eraserRafRef.current) {
      cancelAnimationFrame(eraserRafRef.current);
      eraserRafRef.current = null;
    }
    
    // Cancel any pending pointer RAF and process final point immediately
    if (pointRafIdRef.current) {
      cancelAnimationFrame(pointRafIdRef.current);
      pointRafIdRef.current = null;
    }
    // Process final pending point to avoid dropping end of stroke
    if (pendingPointRef.current) {
      onContinueStroke(pendingPointRef.current);
      pendingPointRef.current = null;
    }

    // Tell the layer-change effect to merge the active buffer instead of re-rendering the stroke.
    pendingStrokeMergeRef.current = lastRenderedPointIndexRef.current >= 2;

    onEndStroke();
  }, [onEndStroke, onContinueStroke, getLayerCtx, activeLayerId, isEyedropperActive, cancelLongPress, screenToCanvas, getColorAtPoint, onLongPressEyedropperEnd]);

  // Drag-and-drop handlers for flood fill
  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Only accept color drag data
    if (e.dataTransfer.types.includes('application/x-color')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only trigger leave if we're actually leaving the container
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const color = e.dataTransfer.getData('application/x-color');
    if (!color || !onFloodFill) return;

    // Update container rect for accurate coordinate conversion
    updateContainerRect();

    // Convert drop position to canvas coordinates
    const { x, y } = screenToCanvas(e.clientX, e.clientY);

    // Check if drop is within canvas bounds
    if (x < 0 || x >= canvasSize.width || y < 0 || y >= canvasSize.height) {
      return;
    }

    // Perform flood fill on the active layer
    const layerCanvas = layerCanvasesRef.current.get(activeLayerId);
    if (layerCanvas) {
      const ctx = layerCanvas.getContext('2d');
      if (ctx) {
        const dpr = effectiveDpr;
        const filled = floodFill(ctx, x, y, color, dpr);
        if (filled) {
          // Mark composite as dirty to show the fill
          compositeDirtyRef.current = true;
          // Notify parent about the fill for history/undo
          onFloodFill(activeLayerId, x, y, color);
        }
      }
    }
  }, [screenToCanvas, canvasSize, activeLayerId, onFloodFill, updateContainerRect]);

  // Calculate CSS transform for the canvas container
  const canvasTransformStyle = useMemo(() => {
    const { scale, offsetX, offsetY, rotation } = transform;
    return {
      transform: `translate(${offsetX}px, ${offsetY}px) rotate(${rotation}deg) scale(${scale})`,
      transformOrigin: 'center center',
    };
  }, [transform]);

  // Canvas wrapper style for centering
  const canvasWrapperStyle = useMemo(() => ({
    width: canvasSize.width,
    height: canvasSize.height,
    position: 'absolute' as const,
    left: '50%',
    top: '50%',
    marginLeft: -canvasSize.width / 2,
    marginTop: -canvasSize.height / 2,
  }), [canvasSize]);

  return (
    <div 
      ref={containerRef} 
      className={`absolute inset-0 canvas-container overflow-hidden touch-none bg-muted/30 ${isEyedropperActive ? 'cursor-crosshair' : ''} ${isDragOver ? 'ring-2 ring-primary ring-inset' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div style={canvasTransformStyle} className="absolute inset-0 pointer-events-none">
        <div style={canvasWrapperStyle} className="shadow-2xl">
          <canvas
            ref={canvasRef}
            className="block"
          />
        </div>
      </div>
    </div>
  );
};