import { useCallback, useEffect, useRef, useState } from 'react';
import { Layer, WetMixSettings, ReferenceImage } from '@/types/drawing';
import { CanvasSize } from '@/types/canvasSize';
import { saveDrawing, loadDrawing, clearDrawing, AutoSaveState } from '@/utils/indexedDBStorage';

const AUTOSAVE_DEBOUNCE_MS = 3000;
const AUTOSAVE_ENABLED = false; // Temporarily disabled for performance testing

interface UseAutoSaveOptions {
  layers: Layer[];
  canvasSize: CanvasSize;
  backgroundColor: string;
  activeLayerId: string;
  wetMix: WetMixSettings;
  referenceImages: ReferenceImage[];
  onRecover: (state: AutoSaveState) => void;
}

export const useAutoSave = ({
  layers,
  canvasSize,
  backgroundColor,
  activeLayerId,
  wetMix,
  referenceImages,
  onRecover,
}: UseAutoSaveOptions) => {
  const [recoveryState, setRecoveryState] = useState<AutoSaveState | null>(null);
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);
  const strokeCountRef = useRef(0);

  // Count total strokes for change detection
  const totalStrokes = layers.reduce((sum, layer) => sum + layer.strokes.length, 0);

  // Check for recovery state on mount
  useEffect(() => {
    const checkRecovery = async () => {
      try {
        const savedState = await loadDrawing();
        if (savedState && savedState.layers.some(l => l.strokes.length > 0)) {
          setRecoveryState(savedState);
          setShowRecoveryDialog(true);
        }
        isInitializedRef.current = true;
        strokeCountRef.current = totalStrokes;
      } catch (error) {
        console.error('Failed to check recovery state:', error);
        isInitializedRef.current = true;
      }
    };

    checkRecovery();
  }, []);

  // Auto-save when strokes change
  useEffect(() => {
    if (!isInitializedRef.current || !AUTOSAVE_ENABLED) return;

    // Detect if strokes changed
    if (totalStrokes !== strokeCountRef.current) {
      strokeCountRef.current = totalStrokes;
      setHasUnsavedChanges(true);

      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Debounce save
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await saveDrawing({
            layers,
            canvasSize,
            backgroundColor,
            activeLayerId,
            wetMix,
            referenceImages,
            timestamp: Date.now(),
          });
          setLastSaved(Date.now());
          setHasUnsavedChanges(false);
        } catch (error) {
          console.error('Auto-save failed:', error);
        }
      }, AUTOSAVE_DEBOUNCE_MS);
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [layers, canvasSize, backgroundColor, activeLayerId, wetMix, referenceImages, totalStrokes]);

  // Save before page unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
        
        // Synchronous save attempt
        try {
          saveDrawing({
            layers,
            canvasSize,
            backgroundColor,
            activeLayerId,
            wetMix,
            referenceImages,
            timestamp: Date.now(),
          });
        } catch (error) {
          console.error('Emergency save failed:', error);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, layers, canvasSize, backgroundColor, activeLayerId, wetMix, referenceImages]);

  const handleRecover = useCallback(() => {
    if (recoveryState) {
      onRecover(recoveryState);
      setShowRecoveryDialog(false);
      setRecoveryState(null);
    }
  }, [recoveryState, onRecover]);

  const handleDiscardRecovery = useCallback(async () => {
    try {
      await clearDrawing();
      setShowRecoveryDialog(false);
      setRecoveryState(null);
    } catch (error) {
      console.error('Failed to clear recovery state:', error);
    }
  }, []);

  const markAsSaved = useCallback(async () => {
    try {
      await clearDrawing();
      setHasUnsavedChanges(false);
      setLastSaved(Date.now());
    } catch (error) {
      console.error('Failed to clear auto-save after export:', error);
    }
  }, []);

  return {
    showRecoveryDialog,
    recoveryState,
    handleRecover,
    handleDiscardRecovery,
    hasUnsavedChanges,
    lastSaved,
    markAsSaved,
  };
};
