import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { CustomBrushPreset, createDefaultPreset, PRESSURE_CURVE_PRESETS } from '@/types/customBrush';

const STORAGE_KEY = 'brush-library';
const FAVORITES_KEY = 'brush-favorites';
const RECENT_KEY = 'brush-recent';
const MAX_RECENT = 10;

// Built-in presets that ship with the app
const BUILT_IN_PRESETS: CustomBrushPreset[] = [
  createDefaultPreset({
    id: 'builtin-round-soft',
    name: 'Soft Round',
    icon: 'Circle',
    category: 'painting',
    isBuiltIn: true,
    shape: { baseType: 'round', aspectRatio: 1, angle: 0, roundness: 1 },
    dynamics: { 
      pressureSensitivity: 0.9, 
      pressureAffects: ['size', 'opacity'], 
      pressureCurve: { ...PRESSURE_CURVE_PRESETS.linear },
      velocitySensitivity: 0.2, 
      velocityAffects: ['opacity'],
      tiltSensitivity: 0.5,
      tiltAffects: ['size'],
    },
    texture: { grain: 0, noiseScale: 1, edgeBleed: 0.2, bristleCount: 0, bristleVariation: 0 },
  }),
  createDefaultPreset({
    id: 'builtin-flat-brush',
    name: 'Flat Brush',
    icon: 'Minus',
    category: 'painting',
    isBuiltIn: true,
    shape: { baseType: 'flat', aspectRatio: 3, angle: 0, roundness: 0.3 },
    dynamics: { 
      pressureSensitivity: 0.7, 
      pressureAffects: ['size', 'opacity'], 
      pressureCurve: { ...PRESSURE_CURVE_PRESETS.linear },
      velocitySensitivity: 0.4, 
      velocityAffects: ['size'],
      tiltSensitivity: 0.8,
      tiltAffects: ['angle'],
    },
    texture: { grain: 0.1, noiseScale: 1, edgeBleed: 0.1, bristleCount: 12, bristleVariation: 0.4 },
  }),
  createDefaultPreset({
    id: 'builtin-bristle',
    name: 'Bristle Brush',
    icon: 'Paintbrush',
    category: 'painting',
    isBuiltIn: true,
    shape: { baseType: 'bristle', aspectRatio: 1.2, angle: 0, roundness: 0.6 },
    dynamics: { 
      pressureSensitivity: 0.85, 
      pressureAffects: ['size', 'opacity', 'flow'], 
      pressureCurve: { ...PRESSURE_CURVE_PRESETS.sCurve },
      velocitySensitivity: 0.5, 
      velocityAffects: ['opacity'],
      tiltSensitivity: 0.6,
      tiltAffects: ['size', 'angle'],
    },
    texture: { grain: 0.3, noiseScale: 1.5, edgeBleed: 0.15, bristleCount: 20, bristleVariation: 0.6 },
  }),
  createDefaultPreset({
    id: 'builtin-scatter',
    name: 'Scatter Brush',
    icon: 'Sparkles',
    category: 'custom',
    isBuiltIn: true,
    shape: { baseType: 'scatter', aspectRatio: 1, angle: 0, roundness: 1 },
    dynamics: { 
      pressureSensitivity: 0.6, 
      pressureAffects: ['size'], 
      pressureCurve: { ...PRESSURE_CURVE_PRESETS.lightTouch },
      velocitySensitivity: 0.3, 
      velocityAffects: ['opacity'],
      tiltSensitivity: 0.2,
      tiltAffects: [],
    },
    stroke: { 
      spacing: 75, 
      spacingJitter: 0.2,
      jitterLateral: 0.3,
      jitterLinear: 0.1,
      fallOff: 'none',
      stabilization: 0.3, 
      streamline: 0.2, 
      taper: { startSize: 0, endSize: 0, startOpacity: 1, endOpacity: 1, tipLength: 10 },
      jitter: { position: 0.8, size: 0.4, rotation: 1, opacity: 0.3 } 
    },
    texture: { grain: 0, noiseScale: 2, edgeBleed: 0, bristleCount: 0, bristleVariation: 0 },
  }),
];

/**
 * Module-level store shared by every useBrushLibrary() consumer. Previously
 * each call site (BrushPicker, BrushStudio, DrawingApp, mobile sheet) held
 * its own copy hydrated once from localStorage, so brushes saved in Brush
 * Studio never appeared in the pickers until a full reload.
 */
interface BrushLibraryState {
  customBrushes: CustomBrushPreset[];
  favoriteBrushes: string[];
  recentBrushes: string[];
}

// Each key parses independently: one corrupt entry must not wipe the others.
const loadKey = <T,>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch (error) {
    console.error(`Failed to load ${key}:`, error);
    return fallback;
  }
};

const persistKey = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Failed to save ${key}:`, error);
  }
};

let libraryState: BrushLibraryState = {
  customBrushes: loadKey<CustomBrushPreset[]>(STORAGE_KEY, []),
  favoriteBrushes: loadKey<string[]>(FAVORITES_KEY, []),
  recentBrushes: loadKey<string[]>(RECENT_KEY, []),
};

const listeners = new Set<() => void>();

const updateLibrary = (partial: Partial<BrushLibraryState>): void => {
  libraryState = { ...libraryState, ...partial };
  if (partial.customBrushes) persistKey(STORAGE_KEY, libraryState.customBrushes);
  if (partial.favoriteBrushes) persistKey(FAVORITES_KEY, libraryState.favoriteBrushes);
  if (partial.recentBrushes) persistKey(RECENT_KEY, libraryState.recentBrushes);
  listeners.forEach(listener => listener());
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = (): BrushLibraryState => libraryState;

export const useBrushLibrary = () => {
  const { customBrushes, favoriteBrushes, recentBrushes } = useSyncExternalStore(subscribe, getSnapshot);

  const saveBrush = useCallback((preset: CustomBrushPreset) => {
    const updated = { ...preset, updatedAt: Date.now() };
    const existing = libraryState.customBrushes.findIndex(b => b.id === preset.id);
    const next = existing >= 0
      ? libraryState.customBrushes.map((b, i) => (i === existing ? updated : b))
      : [...libraryState.customBrushes, updated];
    updateLibrary({ customBrushes: next });
  }, []);

  const deleteBrush = useCallback((id: string) => {
    updateLibrary({ customBrushes: libraryState.customBrushes.filter(b => b.id !== id) });
  }, []);

  const duplicateBrush = useCallback((preset: CustomBrushPreset): CustomBrushPreset => {
    const duplicate = createDefaultPreset({
      ...preset,
      id: crypto.randomUUID(),
      name: `${preset.name} Copy`,
      isBuiltIn: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    updateLibrary({ customBrushes: [...libraryState.customBrushes, duplicate] });
    return duplicate;
  }, []);

  const exportBrush = useCallback((preset: CustomBrushPreset): string => {
    return JSON.stringify(preset, null, 2);
  }, []);

  const importBrush = useCallback((json: string): CustomBrushPreset | null => {
    try {
      const parsed = JSON.parse(json) as CustomBrushPreset;
      const imported = createDefaultPreset({
        ...parsed,
        id: crypto.randomUUID(),
        isBuiltIn: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      updateLibrary({ customBrushes: [...libraryState.customBrushes, imported] });
      return imported;
    } catch (error) {
      console.error('Failed to import brush:', error);
      return null;
    }
  }, []);

  const allBrushes = useMemo(
    () => [...BUILT_IN_PRESETS, ...customBrushes],
    [customBrushes]
  );

  const getBrushById = useCallback((id: string): CustomBrushPreset | undefined => {
    return BUILT_IN_PRESETS.find(b => b.id === id) || libraryState.customBrushes.find(b => b.id === id);
  }, []);

  const toggleFavorite = useCallback((brushId: string) => {
    const prev = libraryState.favoriteBrushes;
    updateLibrary({
      favoriteBrushes: prev.includes(brushId)
        ? prev.filter(id => id !== brushId)
        : [...prev, brushId],
    });
  }, []);

  const isFavorite = useCallback((brushId: string): boolean => {
    return libraryState.favoriteBrushes.includes(brushId);
  }, []);

  const addToRecent = useCallback((brushId: string) => {
    const filtered = libraryState.recentBrushes.filter(id => id !== brushId);
    updateLibrary({ recentBrushes: [brushId, ...filtered].slice(0, MAX_RECENT) });
  }, []);

  return {
    customBrushes,
    builtInBrushes: BUILT_IN_PRESETS,
    allBrushes,
    isLoaded: true,
    saveBrush,
    deleteBrush,
    duplicateBrush,
    exportBrush,
    importBrush,
    getBrushById,
    // Favorites
    favoriteBrushes,
    toggleFavorite,
    isFavorite,
    // Recent
    recentBrushes,
    addToRecent,
  };
};
