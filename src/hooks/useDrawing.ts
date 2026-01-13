import { useState, useCallback, useRef } from 'react';
import { BrushType, Point, Stroke, DrawingState, Layer, WetMixSettings, ReferenceImage } from '@/types/drawing';
import { CustomBrushPreset } from '@/types/customBrush';

const MAX_HISTORY = 50;

const generateId = () => Math.random().toString(36).substr(2, 9);

const createDefaultLayer = (): Layer => ({
  id: generateId(),
  name: 'Layer 1',
  visible: true,
  opacity: 1,
  strokes: [],
});

const DEFAULT_WET_MIX: WetMixSettings = {
  dilution: 0,      // Dry by default - no color mixing
  charge: 1.0,      // Full paint load
  pull: 0,          // No smudge
};

export const useDrawing = () => {
  const [state, setState] = useState<DrawingState>(() => {
    const defaultLayer = createDefaultLayer();
    return {
      layers: [defaultLayer],
      activeLayerId: defaultLayer.id,
      currentStroke: null,
      color: '#ffffff',
      brushSize: 8,
      brushOpacity: 1,
      brushType: 'paintbrush',
      backgroundColor: '#0f0f0f',
      pendingLayerMerge: null,
      activeCustomBrush: null,
      wetMix: DEFAULT_WET_MIX,
      referenceImages: [],
    };
  });

  // Eraser mode state (separate from drawing state to avoid unnecessary re-renders)
  const [isEraser, setIsEraser] = useState(false);

  // Track undo/redo availability in state for immediate UI updates
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });

  const historyRef = useRef<Layer[][]>([[...state.layers]]);
  const historyIndexRef = useRef(0);

  const syncHistoryState = useCallback(() => {
    setHistoryState({
      canUndo: historyIndexRef.current > 0,
      canRedo: historyIndexRef.current < historyRef.current.length - 1,
    });
  }, []);

  const saveToHistory = useCallback((layers: Layer[]) => {
    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    newHistory.push(layers.map(l => ({ ...l, strokes: [...l.strokes] })));
    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift();
    }
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
    syncHistoryState();
  }, [syncHistoryState]);

  const getActiveLayer = useCallback(() => {
    return state.layers.find(l => l.id === state.activeLayerId);
  }, [state.layers, state.activeLayerId]);

  // Check if current brush supports wet mixing
  const supportsWetMix = useCallback((brushType: BrushType) => {
    return ['paintbrush', 'oil_paint', 'acrylic', 'watercolor'].includes(brushType);
  }, []);

  const startStroke = useCallback((point: Point) => {
    setState(prev => ({
      ...prev,
      currentStroke: {
        points: [point],
        brush: prev.brushType,
        color: prev.color,
        size: prev.brushSize,
        opacity: prev.brushOpacity,
        customBrushPreset: prev.activeCustomBrush || undefined,
        wetMix: supportsWetMix(prev.brushType) ? prev.wetMix : undefined,
        isEraser: isEraser, // Mark stroke as eraser if in eraser mode
      },
    }));
  }, [supportsWetMix, isEraser]);

  const continueStroke = useCallback((point: Point) => {
    setState(prev => {
      if (!prev.currentStroke) return prev;
      return {
        ...prev,
        currentStroke: {
          ...prev.currentStroke,
          points: [...prev.currentStroke.points, point],
        },
      };
    });
  }, []);

  const endStroke = useCallback(() => {
    setState(prev => {
      if (!prev.currentStroke || prev.currentStroke.points.length < 2) {
        return { ...prev, currentStroke: null };
      }
      
      const newLayers = prev.layers.map(layer => {
        if (layer.id === prev.activeLayerId) {
          return {
            ...layer,
            strokes: [...layer.strokes, prev.currentStroke!],
          };
        }
        return layer;
      });
      
      saveToHistory(newLayers);
      return {
        ...prev,
        layers: newLayers,
        currentStroke: null,
      };
    });
  }, [saveToHistory]);

  // Cancel stroke without saving to history (used when gesture interrupts drawing)
  const cancelStroke = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentStroke: null,
    }));
  }, []);

  const undo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      const restoredLayers = historyRef.current[historyIndexRef.current];
      setState(prev => ({
        ...prev,
        layers: restoredLayers.map(l => ({ ...l, strokes: [...l.strokes] })),
      }));
      syncHistoryState();
    }
  }, [syncHistoryState]);

  const redo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      const restoredLayers = historyRef.current[historyIndexRef.current];
      setState(prev => ({
        ...prev,
        layers: restoredLayers.map(l => ({ ...l, strokes: [...l.strokes] })),
      }));
      syncHistoryState();
    }
  }, [syncHistoryState]);

  const clear = useCallback(() => {
    setState(prev => {
      const newLayers = prev.layers.map(layer => ({
        ...layer,
        strokes: [],
      }));
      saveToHistory(newLayers);
      return {
        ...prev,
        layers: newLayers,
        currentStroke: null,
      };
    });
  }, [saveToHistory]);

  const setColor = useCallback((color: string) => {
    setState(prev => ({ ...prev, color }));
  }, []);

  const setBrushSize = useCallback((size: number) => {
    setState(prev => ({ ...prev, brushSize: size }));
  }, []);

  const setBrushOpacity = useCallback((opacity: number) => {
    setState(prev => ({ ...prev, brushOpacity: Math.max(0, Math.min(1, opacity)) }));
  }, []);

  const setBrushType = useCallback((type: BrushType) => {
    setState(prev => ({ 
      ...prev, 
      brushType: type,
      // Clear custom brush when switching to a built-in type
      activeCustomBrush: type !== 'custom' ? null : prev.activeCustomBrush,
    }));
  }, []);

  const setActiveCustomBrush = useCallback((preset: CustomBrushPreset | null) => {
    setState(prev => ({ 
      ...prev, 
      brushType: preset ? 'custom' : prev.brushType,
      activeCustomBrush: preset,
    }));
  }, []);

  const setBackgroundColor = useCallback((backgroundColor: string) => {
    setState(prev => ({ ...prev, backgroundColor }));
  }, []);

  const setWetMix = useCallback((wetMix: WetMixSettings) => {
    setState(prev => ({ ...prev, wetMix }));
  }, []);

  // Layer management
  const addLayer = useCallback(() => {
    setState(prev => {
      const newLayer: Layer = {
        id: generateId(),
        name: `Layer ${prev.layers.length + 1}`,
        visible: true,
        opacity: 1,
        strokes: [],
      };
      const newLayers = [...prev.layers, newLayer];
      saveToHistory(newLayers);
      return {
        ...prev,
        layers: newLayers,
        activeLayerId: newLayer.id,
      };
    });
  }, [saveToHistory]);

  const deleteLayer = useCallback((layerId: string) => {
    setState(prev => {
      if (prev.layers.length <= 1) return prev;
      
      const newLayers = prev.layers.filter(l => l.id !== layerId);
      const newActiveId = prev.activeLayerId === layerId 
        ? newLayers[newLayers.length - 1].id 
        : prev.activeLayerId;
      
      saveToHistory(newLayers);
      return {
        ...prev,
        layers: newLayers,
        activeLayerId: newActiveId,
      };
    });
  }, [saveToHistory]);

  const toggleLayerVisibility = useCallback((layerId: string) => {
    setState(prev => ({
      ...prev,
      layers: prev.layers.map(layer =>
        layer.id === layerId ? { ...layer, visible: !layer.visible } : layer
      ),
    }));
  }, []);

  const setActiveLayer = useCallback((layerId: string) => {
    setState(prev => ({ ...prev, activeLayerId: layerId }));
  }, []);

  const renameLayer = useCallback((layerId: string, name: string) => {
    setState(prev => ({
      ...prev,
      layers: prev.layers.map(layer =>
        layer.id === layerId ? { ...layer, name } : layer
      ),
    }));
  }, []);

  const setLayerOpacity = useCallback((layerId: string, opacity: number) => {
    setState(prev => ({
      ...prev,
      layers: prev.layers.map(layer =>
        layer.id === layerId ? { ...layer, opacity: Math.max(0, Math.min(1, opacity)) } : layer
      ),
    }));
  }, []);

  const moveLayer = useCallback((layerId: string, direction: 'up' | 'down') => {
    setState(prev => {
      const index = prev.layers.findIndex(l => l.id === layerId);
      if (index === -1) return prev;
      
      // In our array, index 0 is bottom, last index is top
      // "up" means move toward end of array (higher z-index)
      // "down" means move toward start of array (lower z-index)
      const newIndex = direction === 'up' ? index + 1 : index - 1;
      
      if (newIndex < 0 || newIndex >= prev.layers.length) return prev;
      
      const newLayers = [...prev.layers];
      [newLayers[index], newLayers[newIndex]] = [newLayers[newIndex], newLayers[index]];
      
      return {
        ...prev,
        layers: newLayers,
      };
    });
  }, []);

  const reorderLayer = useCallback((layerId: string, newIndex: number) => {
    setState(prev => {
      const currentIndex = prev.layers.findIndex(l => l.id === layerId);
      if (currentIndex === -1 || newIndex < 0 || newIndex >= prev.layers.length) return prev;
      if (currentIndex === newIndex) return prev;
      
      const newLayers = [...prev.layers];
      const [removed] = newLayers.splice(currentIndex, 1);
      newLayers.splice(newIndex, 0, removed);
      
      return {
        ...prev,
        layers: newLayers,
      };
    });
  }, []);

  const mergeLayers = useCallback((sourceLayerId: string, targetLayerId: string) => {
    setState(prev => {
      if (prev.layers.length <= 1) return prev;
      
      const sourceLayer = prev.layers.find(l => l.id === sourceLayerId);
      const targetLayer = prev.layers.find(l => l.id === targetLayerId);
      
      if (!sourceLayer || !targetLayer || sourceLayerId === targetLayerId) return prev;
      
      // Deep copy strokes to avoid reference issues
      const sourceStrokes = sourceLayer.strokes.map(s => ({ ...s, points: [...s.points] }));
      const targetStrokes = targetLayer.strokes.map(s => ({ ...s, points: [...s.points] }));
      
      // Create merged layer with combined strokes (target first, then source on top)
      const newLayers = prev.layers
        .filter(l => l.id !== sourceLayerId)
        .map(l => {
          if (l.id === targetLayerId) {
            return {
              ...l,
              strokes: [...targetStrokes, ...sourceStrokes],
            };
          }
          return l;
        });
      
      const newActiveId = prev.activeLayerId === sourceLayerId 
        ? targetLayerId 
        : prev.activeLayerId;
      
      saveToHistory(newLayers);
      return {
        ...prev,
        layers: newLayers,
        activeLayerId: newActiveId,
        pendingLayerMerge: { sourceLayerId, targetLayerId },
      };
    });
  }, [saveToHistory]);

  const clearPendingMerge = useCallback(() => {
    setState(prev => {
      if (!prev.pendingLayerMerge) return prev;
      return { ...prev, pendingLayerMerge: null };
    });
  }, []);

  // Get all visible strokes for rendering (flattened from all visible layers)
  const getVisibleStrokes = useCallback(() => {
    return state.layers
      .filter(layer => layer.visible)
      .flatMap(layer => layer.strokes);
  }, [state.layers]);

  // Get strokes for the active layer only
  const getActiveLayerStrokes = useCallback(() => {
    const activeLayer = state.layers.find(l => l.id === state.activeLayerId);
    return activeLayer?.strokes || [];
  }, [state.layers, state.activeLayerId]);

  // Eraser toggle
  const toggleEraser = useCallback(() => {
    setIsEraser(prev => !prev);
  }, []);

  // Load full state from imported file
  const loadState = useCallback((
    layers: Layer[],
    activeLayerId: string,
    wetMix?: WetMixSettings,
    referenceImages?: ReferenceImage[]
  ) => {
    // Deep copy layers
    const copiedLayers = layers.map(l => ({
      ...l,
      strokes: l.strokes.map(s => ({ ...s, points: [...s.points] })),
    }));
    
    // Reset history with imported layers as the initial state
    historyRef.current = [copiedLayers.map(l => ({ ...l, strokes: [...l.strokes] }))];
    historyIndexRef.current = 0;
    
    setState(prev => ({
      ...prev,
      layers: copiedLayers,
      activeLayerId,
      currentStroke: null,
      wetMix: wetMix ?? prev.wetMix,
      referenceImages: referenceImages ?? [],
    }));
  }, []);

  // Reference image management
  const addReferenceImage = useCallback((image: ReferenceImage) => {
    setState(prev => ({
      ...prev,
      referenceImages: [...prev.referenceImages, image],
    }));
  }, []);

  const removeReferenceImage = useCallback((imageId: string) => {
    setState(prev => ({
      ...prev,
      referenceImages: prev.referenceImages.filter(img => img.id !== imageId),
    }));
  }, []);

  const updateReferenceImage = useCallback((imageId: string, updates: Partial<ReferenceImage>) => {
    setState(prev => ({
      ...prev,
      referenceImages: prev.referenceImages.map(img =>
        img.id === imageId ? { ...img, ...updates } : img
      ),
    }));
  }, []);

  return {
    state,
    isEraser,
    toggleEraser,
    startStroke,
    continueStroke,
    endStroke,
    cancelStroke,
    undo,
    redo,
    clear,
    setColor,
    setBrushSize,
    setBrushOpacity,
    setBrushType,
    setBackgroundColor,
    setActiveCustomBrush,
    setWetMix,
    supportsWetMix,
    loadState,
    // Layer functions
    addLayer,
    deleteLayer,
    toggleLayerVisibility,
    setActiveLayer,
    renameLayer,
    setLayerOpacity,
    moveLayer,
    reorderLayer,
    mergeLayers,
    clearPendingMerge,
    getVisibleStrokes,
    getActiveLayerStrokes,
    canUndo: historyState.canUndo,
    canRedo: historyState.canRedo,
    // Reference image functions
    addReferenceImage,
    removeReferenceImage,
    updateReferenceImage,
  };
};