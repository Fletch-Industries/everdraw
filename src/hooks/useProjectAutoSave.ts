import { useCallback, useEffect, useRef, useState } from 'react';
import { Layer, WetMixSettings, ReferenceImage } from '@/types/drawing';
import { CanvasSize } from '@/types/canvasSize';
import { CustomBrushPreset } from '@/types/customBrush';
import { Project } from '@/types/project';
import { saveProject, loadProject, generateId } from '@/utils/projectStorage';
import { generateThumbnail } from '@/utils/thumbnailGenerator';

const AUTOSAVE_DEBOUNCE_MS = 5000;

interface UseProjectAutoSaveOptions {
  projectId: string | null;
  projectName: string;
  layers: Layer[];
  canvasSize: CanvasSize;
  backgroundColor: string;
  activeLayerId: string;
  wetMix: WetMixSettings;
  referenceImages: ReferenceImage[];
  customBrushes: CustomBrushPreset[];
}

export const useProjectAutoSave = ({
  projectId,
  projectName,
  layers,
  canvasSize,
  backgroundColor,
  activeLayerId,
  wetMix,
  referenceImages,
  customBrushes,
}: UseProjectAutoSaveOptions) => {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(projectId);
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);
  const strokeCountRef = useRef(0);
  const createdAtRef = useRef<number>(Date.now());

  // Initialize project ID
  useEffect(() => {
    if (projectId) {
      setCurrentProjectId(projectId);
    } else {
      // New project - generate ID
      setCurrentProjectId(generateId());
      createdAtRef.current = Date.now();
    }
    isInitializedRef.current = true;
  }, [projectId]);

  // Count total strokes for change detection
  const totalStrokes = layers.reduce((sum, layer) => sum + layer.strokes.length, 0);

  // Manual save function
  const saveNow = useCallback(async (): Promise<string | null> => {
    if (!currentProjectId) return null;
    
    setIsSaving(true);
    try {
      const thumbnail = await generateThumbnail(
        layers,
        canvasSize.width,
        canvasSize.height,
        backgroundColor
      );

      const project: Project = {
        id: currentProjectId,
        name: projectName,
        thumbnail,
        created: createdAtRef.current,
        modified: Date.now(),
        canvas: {
          width: canvasSize.width,
          height: canvasSize.height,
          dpi: canvasSize.dpi,
          backgroundColor,
        },
        layers,
        customBrushes,
        activeLayerId,
        wetMix,
        referenceImages,
      };

      await saveProject(project);
      setLastSaved(Date.now());
      strokeCountRef.current = totalStrokes;
      return currentProjectId;
    } catch (error) {
      console.error('Save failed:', error);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [
    currentProjectId,
    projectName,
    layers,
    canvasSize,
    backgroundColor,
    activeLayerId,
    wetMix,
    referenceImages,
    customBrushes,
    totalStrokes,
  ]);

  // Auto-save when strokes change
  useEffect(() => {
    if (!isInitializedRef.current || !currentProjectId) return;

    // Detect if strokes changed
    if (totalStrokes !== strokeCountRef.current) {
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Debounce save
      saveTimeoutRef.current = setTimeout(() => {
        saveNow();
      }, AUTOSAVE_DEBOUNCE_MS);
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [totalStrokes, currentProjectId, saveNow]);

  // Update created timestamp when loading existing project
  const setCreatedAt = useCallback((timestamp: number) => {
    createdAtRef.current = timestamp;
  }, []);

  return {
    projectId: currentProjectId,
    isSaving,
    lastSaved,
    saveNow,
    setCreatedAt,
  };
};
