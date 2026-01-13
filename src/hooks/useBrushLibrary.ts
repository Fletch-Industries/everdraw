import { useState, useEffect, useCallback } from 'react';
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

export const useBrushLibrary = () => {
  const [customBrushes, setCustomBrushes] = useState<CustomBrushPreset[]>([]);
  const [favoriteBrushes, setFavoriteBrushes] = useState<string[]>([]);
  const [recentBrushes, setRecentBrushes] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load brushes from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as CustomBrushPreset[];
        setCustomBrushes(parsed);
      }
      
      const storedFavorites = localStorage.getItem(FAVORITES_KEY);
      if (storedFavorites) {
        setFavoriteBrushes(JSON.parse(storedFavorites));
      }
      
      const storedRecent = localStorage.getItem(RECENT_KEY);
      if (storedRecent) {
        setRecentBrushes(JSON.parse(storedRecent));
      }
    } catch (error) {
      console.error('Failed to load brush library:', error);
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage whenever customBrushes changes
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(customBrushes));
      } catch (error) {
        console.error('Failed to save brush library:', error);
      }
    }
  }, [customBrushes, isLoaded]);

  // Save favorites to localStorage
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteBrushes));
      } catch (error) {
        console.error('Failed to save favorites:', error);
      }
    }
  }, [favoriteBrushes, isLoaded]);

  // Save recent brushes to localStorage
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(recentBrushes));
      } catch (error) {
        console.error('Failed to save recent brushes:', error);
      }
    }
  }, [recentBrushes, isLoaded]);

  const saveBrush = useCallback((preset: CustomBrushPreset) => {
    setCustomBrushes(prev => {
      const existing = prev.findIndex(b => b.id === preset.id);
      const updated = { ...preset, updatedAt: Date.now() };
      if (existing >= 0) {
        const newBrushes = [...prev];
        newBrushes[existing] = updated;
        return newBrushes;
      }
      return [...prev, updated];
    });
  }, []);

  const deleteBrush = useCallback((id: string) => {
    setCustomBrushes(prev => prev.filter(b => b.id !== id));
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
    setCustomBrushes(prev => [...prev, duplicate]);
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
      setCustomBrushes(prev => [...prev, imported]);
      return imported;
    } catch (error) {
      console.error('Failed to import brush:', error);
      return null;
    }
  }, []);

  const getAllBrushes = useCallback((): CustomBrushPreset[] => {
    return [...BUILT_IN_PRESETS, ...customBrushes];
  }, [customBrushes]);

  const getBrushById = useCallback((id: string): CustomBrushPreset | undefined => {
    return BUILT_IN_PRESETS.find(b => b.id === id) || customBrushes.find(b => b.id === id);
  }, [customBrushes]);

  // Favorites management
  const toggleFavorite = useCallback((brushId: string) => {
    setFavoriteBrushes(prev => {
      if (prev.includes(brushId)) {
        return prev.filter(id => id !== brushId);
      }
      return [...prev, brushId];
    });
  }, []);

  const isFavorite = useCallback((brushId: string): boolean => {
    return favoriteBrushes.includes(brushId);
  }, [favoriteBrushes]);

  // Recent brushes management
  const addToRecent = useCallback((brushId: string) => {
    setRecentBrushes(prev => {
      const filtered = prev.filter(id => id !== brushId);
      return [brushId, ...filtered].slice(0, MAX_RECENT);
    });
  }, []);

  return {
    customBrushes,
    builtInBrushes: BUILT_IN_PRESETS,
    allBrushes: getAllBrushes(),
    isLoaded,
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
