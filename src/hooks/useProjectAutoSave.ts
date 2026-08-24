import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layer, WetMixSettings, ReferenceImage } from '@/types/drawing';
import { CanvasSize } from '@/types/canvasSize';
import { CustomBrushPreset } from '@/types/customBrush';
import { Project } from '@/types/project';
import { saveProject, generateId } from '@/utils/projectStorage';
import { generateThumbnail, generateThumbnailFromCanvas } from '@/utils/thumbnailGenerator';

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
  /** Live drawing canvas; when present thumbnails are exact renders. */
  sourceCanvas?: HTMLCanvasElement | null;
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
  sourceCanvas,
}: UseProjectAutoSaveOptions) => {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(projectId);
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);
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

  // Change signature covering everything worth autosaving — previously only
  // the stroke count triggered a save, so layer renames/reorders/visibility,
  // background color, canvas size, wet mix, and reference-image edits were
  // silently lost unless the user saved manually.
  const changeSignature = useMemo(() => JSON.stringify({
    strokes: totalStrokes,
    layers: layers.map(l => [l.id, l.name, l.visible, l.opacity]),
    backgroundColor,
    canvasSize,
    wetMix,
    projectName,
    refs: referenceImages.map(r => [r.id, r.opacity, r.visible, r.locked, r.transform]),
  }), [totalStrokes, layers, backgroundColor, canvasSize, wetMix, projectName, referenceImages]);

  // Manual save function
  const saveNow = useCallback(async (): Promise<string | null> => {
    if (!currentProjectId) return null;
    
    setIsSaving(true);
    try {
      // Prefer an exact render of the live canvas; fall back to the vector
      // approximation when no canvas is available.
      const thumbnail =
        (sourceCanvas ? generateThumbnailFromCanvas(sourceCanvas, backgroundColor) : '') ||
        (await generateThumbnail(layers, canvasSize.width, canvasSize.height, backgroundColor));

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
    sourceCanvas,
  ]);

  // Auto-save when anything meaningful changes. saveNow is read through a
  // ref so unrelated re-renders can't reset the debounce timer. The saved
  // signature is only recorded after a save SUCCEEDS, so failed writes
  // (quota, private-mode IndexedDB) retry on the next change.
  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;
  const lastSavedSignatureRef = useRef<string | null>(null);
  const currentSignatureRef = useRef(changeSignature);
  currentSignatureRef.current = changeSignature;

  const runSave = useCallback(async () => {
    const sig = currentSignatureRef.current;
    const ok = await saveNowRef.current();
    if (ok) {
      lastSavedSignatureRef.current = sig;
    }
    return ok;
  }, []);

  useEffect(() => {
    if (!isInitializedRef.current || !currentProjectId) return;

    // First run establishes the baseline without writing.
    if (lastSavedSignatureRef.current === null) {
      lastSavedSignatureRef.current = changeSignature;
      return;
    }
    if (changeSignature === lastSavedSignatureRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      runSave();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [changeSignature, currentProjectId, runSave]);

  // Flush pending work when the page is hidden/closed or the editor
  // unmounts — a plain debounce silently dropped up to 5s of changes on
  // tab close, browser Back, or iOS backgrounding.
  useEffect(() => {
    const flushIfDirty = () => {
      if (
        lastSavedSignatureRef.current !== null &&
        currentSignatureRef.current !== lastSavedSignatureRef.current
      ) {
        runSave();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushIfDirty();
    };
    window.addEventListener('pagehide', flushIfDirty);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flushIfDirty);
      document.removeEventListener('visibilitychange', onVisibility);
      flushIfDirty(); // unmount (in-app navigation)
    };
  }, [runSave]);

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
