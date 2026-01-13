/**
 * WebGLCanvas - GPU-accelerated canvas component
 * 
 * Uses WebGL2 for brush stamp rendering and layer compositing.
 * Implements imperative rendering for instant visual feedback on Apple Pencil.
 */

import { useRef, useEffect, useCallback, useMemo } from 'react';
import { Point, Stroke, Layer, BrushType, WetMixSettings, ReferenceImage } from '@/types/drawing';
import { CustomBrushPreset } from '@/types/customBrush';
import { CanvasSize } from '@/types/canvasSize';
import { CanvasTransform } from '@/types/canvasTransform';
import { InputMode } from '@/types/drawing';
import { StrokeSession, StrokeSessionConfig } from '@/utils/strokeSession';
import { WebGLLayerManager } from '@/utils/webglLayerManager';
import { WebGLBrushEngine } from '@/utils/webglBrushEngine';
import { renderLayerStrokes } from '@/utils/webglStrokeRenderer';
import { useMultiTouchGestures } from '@/hooks/useMultiTouchGestures';

interface WebGLCanvasProps {
  layers: Layer[];
  currentStroke: Stroke | null;
  onStartStroke: (point: Point) => void;
  onContinueStroke: (point: Point) => void;
  onEndStroke: () => void;
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
  
  // Brush properties for imperative rendering
  currentColor: string;
  currentBrushSize: number;
  currentBrushOpacity: number;
  currentBrushType: BrushType;
  currentIsEraser: boolean;
  currentCustomBrush?: CustomBrushPreset;
  currentWetMix?: WetMixSettings;
  
  // Reference images
  referenceImages?: ReferenceImage[];
}

// Check for WebGL2 support
export function checkWebGL2Support(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    return gl !== null;
  } catch (e) {
    return false;
  }
}

export const WebGLCanvas = ({
  layers,
  currentStroke,
  onStartStroke,
  onContinueStroke,
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
  currentColor,
  currentBrushSize,
  currentBrushOpacity,
  currentBrushType,
  currentIsEraser,
  currentCustomBrush,
  currentWetMix,
  referenceImages = [],
}: WebGLCanvasProps) => {
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const layerManagerRef = useRef<WebGLLayerManager | null>(null);
  const brushEngineRef = useRef<WebGLBrushEngine | null>(null);
  
  // Sampling canvas for wet mixing (2D canvas snapshot at stroke start)
  const samplingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const samplingCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  
  // Drawing state refs
  const isDrawingRef = useRef(false);
  const strokeSessionRef = useRef<StrokeSession | null>(null);
  const pendingPointsRef = useRef<Point[]>([]);
  const containerRectRef = useRef<DOMRect | null>(null);
  const isGesturingRef = useRef(false);
  
  // Skip re-render after merge flag
  const justMergedStrokeRef = useRef(false);
  
  // RAF-throttled stamp processing refs (decouple input capture from stamp generation)
  const pendingRenderPointsRef = useRef<Point[]>([]);
  const renderRafRef = useRef<number | null>(null);
  const isRenderingRef = useRef(false);
  
  // Layer stroke counts for change detection
  const lastLayerStrokeCountsRef = useRef<Map<string, number>>(new Map());
  
  // Composite loop refs
  const compositeDirtyRef = useRef(true);
  const compositeRafRef = useRef<number | null>(null);

  // Compute effective DPR (capped on mobile)
  const effectiveDpr = useMemo(() => {
    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    return isMobileDevice ? Math.min(window.devicePixelRatio || 1, 1.5) : (window.devicePixelRatio || 1);
  }, []);

  // Pre-calculate transform math
  const transformMath = useMemo(() => {
    const radians = -transform.rotation * Math.PI / 180;
    return {
      cos: Math.cos(radians),
      sin: Math.sin(radians),
    };
  }, [transform.rotation]);

  // Multi-touch gesture handling - cancel any active stroke without saving
  const handleGestureStart = useCallback(() => {
    isGesturingRef.current = true;
    if (isDrawingRef.current) {
      // Cancel any pending render RAF
      if (renderRafRef.current) {
        cancelAnimationFrame(renderRafRef.current);
        renderRafRef.current = null;
      }
      
      // Clear pending points and state
      pendingRenderPointsRef.current = [];
      pendingPointsRef.current = [];
      isRenderingRef.current = false;
      isDrawingRef.current = false;
      strokeSessionRef.current = null;
      
      // Clear the active stroke FBO (discard the partial stroke)
      layerManagerRef.current?.clearActiveStrokeFBO();
      compositeDirtyRef.current = true;
      
      // Cancel the React state stroke without saving to history
      onCancelStroke();
    }
  }, [onCancelStroke]);

  const handleGestureEnd = useCallback(() => {
    isGesturingRef.current = false;
  }, []);

  // Called immediately when 2+ fingers are detected (before gesture/tap is determined)
  const handleMultiTouchStart = useCallback(() => {
    if (isDrawingRef.current) {
      // Cancel any pending render RAF
      if (renderRafRef.current) {
        cancelAnimationFrame(renderRafRef.current);
        renderRafRef.current = null;
      }
      
      // Clear pending points and state
      pendingRenderPointsRef.current = [];
      pendingPointsRef.current = [];
      isRenderingRef.current = false;
      isDrawingRef.current = false;
      strokeSessionRef.current = null;
      
      // Clear the active stroke FBO (discard the partial stroke)
      layerManagerRef.current?.clearActiveStrokeFBO();
      compositeDirtyRef.current = true;
      
      // Cancel the React state stroke without saving to history
      onCancelStroke();
    }
  }, [onCancelStroke]);

  const gestureCallbacks = useMemo(() => ({
    onUndo,
    onRedo,
    onTransformChange,
    onGestureStart: handleGestureStart,
    onGestureEnd: handleGestureEnd,
    onMultiTouchStart: handleMultiTouchStart,
  }), [onUndo, onRedo, onTransformChange, handleGestureStart, handleGestureEnd, handleMultiTouchStart]);

  useMultiTouchGestures(containerRef, gestureCallbacks, transform);

  // Initialize WebGL context and resources
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    });

    if (!gl) {
      console.error('WebGL2 not supported');
      return;
    }

    glRef.current = gl;

    // Set canvas size
    const dpr = effectiveDpr;
    canvas.width = canvasSize.width * dpr;
    canvas.height = canvasSize.height * dpr;
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;

    // Initialize layer manager
    const layerManager = new WebGLLayerManager(gl);
    layerManager.initialize(canvas.width, canvas.height);
    layerManagerRef.current = layerManager;

    // Initialize brush engine
    const brushEngine = new WebGLBrushEngine(gl, layerManager);
    brushEngineRef.current = brushEngine;

    // Sync layer FBOs
    layerManager.syncWithLayers(layers);
    
    // Initialize sampling canvas for wet mixing (hidden 2D canvas for color sampling)
    const samplingCanvas = document.createElement('canvas');
    samplingCanvas.width = canvas.width;
    samplingCanvas.height = canvas.height;
    const samplingCtx = samplingCanvas.getContext('2d', { willReadFrequently: true });
    samplingCanvasRef.current = samplingCanvas;
    samplingCtxRef.current = samplingCtx;

    // Notify parent
    if (onCanvasReady) {
      onCanvasReady(canvas);
    }

    return () => {
      brushEngine.dispose();
      layerManager.dispose();
      glRef.current = null;
      layerManagerRef.current = null;
      brushEngineRef.current = null;
      samplingCanvasRef.current = null;
      samplingCtxRef.current = null;
      
      if (onCanvasReady) {
        onCanvasReady(null);
      }
    };
  }, [canvasSize, effectiveDpr]);

  // Update container rect
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

  // Screen to canvas coordinate conversion
  const screenToCanvas = useCallback((screenX: number, screenY: number): { x: number; y: number } => {
    const rect = containerRectRef.current;
    if (!rect) return { x: screenX, y: screenY };

    const containerCenterX = rect.width / 2;
    const containerCenterY = rect.height / 2;

    let x = screenX - rect.left;
    let y = screenY - rect.top;

    x -= transform.offsetX;
    y -= transform.offsetY;

    const { cos, sin } = transformMath;
    const dx = x - containerCenterX;
    const dy = y - containerCenterY;
    x = containerCenterX + dx * cos - dy * sin;
    y = containerCenterY + dx * sin + dy * cos;

    x = containerCenterX + (x - containerCenterX) / transform.scale;
    y = containerCenterY + (y - containerCenterY) / transform.scale;

    x = x - containerCenterX + canvasSize.width / 2;
    y = y - containerCenterY + canvasSize.height / 2;

    return { x, y };
  }, [transform.offsetX, transform.offsetY, transform.scale, transformMath, canvasSize]);

  // Get point from pointer event
  const getPointFromEvent = useCallback((e: PointerEvent): Point => {
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
      altitude,
    };
  }, [screenToCanvas]);

  // Check if input should be allowed
  const shouldAllowInput = useCallback((e: React.PointerEvent): boolean => {
    if (isGesturingRef.current) return false;
    if (inputMode === 'pencil_and_touch') return true;
    return e.pointerType === 'pen';
  }, [inputMode]);

  // Process all pending points each frame - performance controlled by velocity-based stamp decimation
  
  // RAF-throttled stamp processing loop
  const processRenderQueue = useCallback(() => {
    if (!isDrawingRef.current && pendingRenderPointsRef.current.length === 0) {
      isRenderingRef.current = false;
      return;
    }
    
    const session = strokeSessionRef.current;
    const brushEngine = brushEngineRef.current;
    
    if (session && brushEngine && pendingRenderPointsRef.current.length > 0) {
      // Process ALL pending points immediately - no artificial cap
      const pointsToProcess = pendingRenderPointsRef.current.splice(0);
      const stamps = pointsToProcess.flatMap(p => session.processPoint(p));
      
      if (stamps.length > 0) {
        const config = session.getConfig();
        brushEngine.renderStamps(
          stamps,
          config.brushType,
          config.customBrush,
          config.isEraser,
          effectiveDpr,
          config.wetMix,
          activeLayerId
        );
        compositeDirtyRef.current = true;
      }
    }
    
    // Continue loop if still drawing
    if (isDrawingRef.current) {
      renderRafRef.current = requestAnimationFrame(processRenderQueue);
    } else {
      isRenderingRef.current = false;
    }
  }, [effectiveDpr, activeLayerId]);
  
  // Schedule point for RAF-throttled rendering
  const schedulePointsForRender = useCallback((points: Point[]) => {
    pendingRenderPointsRef.current.push(...points);
    
    // Start RAF loop if not already running
    if (!isRenderingRef.current) {
      isRenderingRef.current = true;
      renderRafRef.current = requestAnimationFrame(processRenderQueue);
    }
  }, [processRenderQueue]);
  
  // Immediate rendering for first point (instant feedback)
  const renderPointsImmediate = useCallback((points: Point[]) => {
    const session = strokeSessionRef.current;
    const brushEngine = brushEngineRef.current;
    if (!session || !brushEngine) return;

    // Process points through stroke session (deterministic - same output for live and replay)
    const stamps = points.flatMap(p => session.processPoint(p));
    
    if (stamps.length > 0) {
      const config = session.getConfig();
      brushEngine.renderStamps(
        stamps,
        config.brushType,
        config.customBrush,
        config.isEraser,
        effectiveDpr,
        config.wetMix,
        activeLayerId
      );
      compositeDirtyRef.current = true;
    }
  }, [effectiveDpr, activeLayerId]);

  // Snapshot WebGL canvas to 2D sampling canvas for wet mixing
  const snapshotCanvasForWetMix = useCallback(() => {
    const glCanvas = canvasRef.current;
    const samplingCtx = samplingCtxRef.current;
    if (!glCanvas || !samplingCtx) return;
    
    // Draw the WebGL canvas onto the 2D sampling canvas
    samplingCtx.clearRect(0, 0, glCanvas.width, glCanvas.height);
    samplingCtx.drawImage(glCanvas, 0, 0);
  }, []);

  // Pointer event handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!shouldAllowInput(e)) return;
    
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateContainerRect();
    
    const point = getPointFromEvent(e.nativeEvent);
    
    // Initialize stroke session for imperative rendering
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
    
    // Snapshot canvas for wet mixing color sampling (once per stroke)
    if (currentWetMix && (currentWetMix.dilution > 0 || currentWetMix.pull > 0) && !currentIsEraser) {
      snapshotCanvasForWetMix();
      session.setSamplingContext(samplingCtxRef.current, effectiveDpr);
    }
    
    strokeSessionRef.current = session;
    pendingPointsRef.current = [point];
    isDrawingRef.current = true;
    
    // Clear active stroke FBO
    layerManagerRef.current?.clearActiveStrokeFBO();
    
    // Render first stamp immediately
    renderPointsImmediate([point]);
    
    // Trigger React state update
    onStartStroke(point);
  }, [
    shouldAllowInput,
    updateContainerRect,
    getPointFromEvent,
    currentBrushType,
    currentColor,
    currentBrushSize,
    currentBrushOpacity,
    currentCustomBrush,
    currentWetMix,
    currentIsEraser,
    renderPointsImmediate,
    onStartStroke,
    snapshotCanvasForWetMix,
    effectiveDpr,
  ]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDrawingRef.current) return;
    
    e.preventDefault();
    
    // Get coalesced events for full input precision
    const coalesced = e.nativeEvent.getCoalescedEvents?.() || [e.nativeEvent];
    const points = coalesced.map(ce => getPointFromEvent(ce));
    
    // PERFORMANCE: Schedule points for RAF-throttled rendering (60fps instead of 240Hz)
    // This decouples high-frequency input capture from stamp generation
    schedulePointsForRender(points);
    
    // Accumulate points for React state
    pendingPointsRef.current.push(...points);
    
    // Batch update React state (last point only for performance)
    onContinueStroke(points[points.length - 1]);
  }, [getPointFromEvent, schedulePointsForRender, onContinueStroke]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDrawingRef.current) return;
    
    e.preventDefault();
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    
    const point = getPointFromEvent(e.nativeEvent);
    
    // Cancel any pending RAF
    if (renderRafRef.current) {
      cancelAnimationFrame(renderRafRef.current);
      renderRafRef.current = null;
    }
    
    // Process any remaining pending points + final point immediately
    const session = strokeSessionRef.current;
    const brushEngine = brushEngineRef.current;
    if (session && brushEngine) {
      const remainingPoints = [...pendingRenderPointsRef.current, point];
      pendingRenderPointsRef.current = [];
      
      const stamps = remainingPoints.flatMap(p => session.processPoint(p));
      if (stamps.length > 0) {
        const config = session.getConfig();
        brushEngine.renderStamps(
          stamps,
          config.brushType,
          config.customBrush,
          config.isEraser,
          effectiveDpr,
          config.wetMix,
          activeLayerId
        );
        compositeDirtyRef.current = true;
      }
      
      // Merge active stroke to layer FBO
      const config = session.getConfig();
      brushEngine.mergeActiveStrokeToLayer(activeLayerId, config.isEraser);
      justMergedStrokeRef.current = true;
    }
    
    isDrawingRef.current = false;
    isRenderingRef.current = false;
    strokeSessionRef.current = null;
    pendingPointsRef.current = [];
    
    // Trigger React state update
    onEndStroke();
  }, [getPointFromEvent, effectiveDpr, activeLayerId, onEndStroke]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    if (isDrawingRef.current) {
      // Cancel RAF loop
      if (renderRafRef.current) {
        cancelAnimationFrame(renderRafRef.current);
        renderRafRef.current = null;
      }
      isDrawingRef.current = false;
      isRenderingRef.current = false;
      strokeSessionRef.current = null;
      pendingPointsRef.current = [];
      pendingRenderPointsRef.current = [];
      layerManagerRef.current?.clearActiveStrokeFBO();
      onEndStroke();
    }
  }, [onEndStroke]);

  // Sync layer FBOs when layers change
  useEffect(() => {
    const layerManager = layerManagerRef.current;
    const brushEngine = brushEngineRef.current;
    if (!layerManager || !brushEngine) return;
    
    layerManager.syncWithLayers(layers);
    
    // Check for layer changes that need re-rendering
    layers.forEach(layer => {
      const lastCount = lastLayerStrokeCountsRef.current.get(layer.id) ?? -1;
      const currentCount = layer.strokes.length;
      
      // Skip re-render if we just merged imperatively
      if (justMergedStrokeRef.current && layer.id === activeLayerId && currentCount === lastCount + 1) {
        justMergedStrokeRef.current = false;
        lastLayerStrokeCountsRef.current.set(layer.id, currentCount);
        return;
      }
      
      if (currentCount !== lastCount) {
        // Layer changed - re-render from stroke history (for undo/redo)
        renderLayerStrokes(layer.id, layer.strokes, brushEngine, layerManager, effectiveDpr);
        lastLayerStrokeCountsRef.current.set(layer.id, currentCount);
        compositeDirtyRef.current = true;
      }
    });
  }, [layers, activeLayerId]);

  // Parse background color
  const parseColor = useCallback((hex: string): [number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
      parseInt(result[1], 16) / 255,
      parseInt(result[2], 16) / 255,
      parseInt(result[3], 16) / 255,
    ] : [0, 0, 0];
  }, []);

  // Composite loop - renders all layers to screen
  useEffect(() => {
    const gl = glRef.current;
    const canvas = canvasRef.current;
    const layerManager = layerManagerRef.current;
    const brushEngine = brushEngineRef.current;
    
    if (!gl || !canvas || !layerManager || !brushEngine) return;
    
    const compositeLoop = () => {
      if (compositeDirtyRef.current) {
        compositeDirtyRef.current = false;
        
        // Bind screen framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        
        // Clear with background color
        const [r, g, b] = parseColor(backgroundColor);
        gl.clearColor(r, g, b, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        // Enable premultiplied alpha blending
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        
        // Draw each layer
        const orderedFBOs = layerManager.getOrderedLayerFBOs(layers);
        orderedFBOs.forEach(({ fbo, layer }) => {
          if (!layer.visible) return;
          
          // Render layer FBO to screen
          brushEngine.renderFBOToTarget(fbo, null, layer.opacity);
          
          // If this is the active layer and we're drawing, also render active stroke
          if (layer.id === activeLayerId && isDrawingRef.current) {
            const activeFBO = layerManager.getActiveStrokeFBO();
            if (activeFBO) {
              const session = strokeSessionRef.current;
              const isEraser = session?.getConfig().isEraser ?? false;
              brushEngine.renderFBOToTarget(activeFBO, null, 1, isEraser);
            }
          }
        });
      }
      
      compositeRafRef.current = requestAnimationFrame(compositeLoop);
    };
    
    compositeRafRef.current = requestAnimationFrame(compositeLoop);
    
    return () => {
      if (compositeRafRef.current) {
        cancelAnimationFrame(compositeRafRef.current);
        compositeRafRef.current = null;
      }
    };
  }, [backgroundColor, layers, activeLayerId, parseColor]);

  // Mark dirty when dependencies change
  useEffect(() => {
    compositeDirtyRef.current = true;
  }, [layers, backgroundColor, activeLayerId, referenceImages]);

  // Calculate canvas transform style
  const canvasStyle = useMemo(() => {
    return {
      transform: `translate(${transform.offsetX}px, ${transform.offsetY}px) scale(${transform.scale}) rotate(${transform.rotation}deg)`,
      transformOrigin: 'center center',
    };
  }, [transform]);

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 overflow-hidden flex items-center justify-center"
      style={{ touchAction: 'none' }}
    >
      <canvas
        ref={canvasRef}
        className="block"
        style={canvasStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerCancel}
      />
    </div>
  );
};
