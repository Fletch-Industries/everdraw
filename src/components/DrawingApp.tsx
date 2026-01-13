import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDrawing } from '@/hooks/useDrawing';
import { useProjectAutoSave } from '@/hooks/useProjectAutoSave';
import { useIsMobile } from '@/hooks/use-mobile';
import { useBrushLibrary } from '@/hooks/useBrushLibrary';
import { loadProject } from '@/utils/projectStorage';
import { Canvas } from './Canvas';
import { WebGLCanvas } from './WebGLCanvas';
import { TopToolbar } from './TopToolbar';
import { SideSliders } from './SideSliders';
import { LayerPanelContent } from './LayerPanelContent';
import { SettingsMenu } from './SettingsMenu';
import { ZoomControls } from './ZoomControls';
import { GestureGuide } from './GestureGuide';
import { WetMixControls } from './WetMixControls';
import { CanvasSizeDialog } from './CanvasSizeDialog';
import { ExportDialog } from './ExportDialog';
import { ImportDialog } from './ImportDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { ReferenceImageDialog } from './ReferenceImageDialog';
import { EyedropperLoupe } from './EyedropperLoupe';
import { MobileBrushDock } from './MobileBrushDock';
import { QuickSizeSlider } from './QuickSizeSlider';
import { InputMode, BrushType, Layer, ReferenceImage } from '@/types/drawing';
import { CustomBrushPreset } from '@/types/customBrush';
import { CanvasTransform, DEFAULT_TRANSFORM } from '@/types/canvasTransform';
import { CanvasSize, DEFAULT_CANVAS_SIZE } from '@/types/canvasSize';
import { EverdrawFile } from '@/types/everdrawFile';
import { ChevronUp, ChevronDown, Pipette, Droplets, Home, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';

// Feature flag for WebGL renderer - enabled with texture-based brushes
const USE_WEBGL_RENDERER = true;

interface DrawingAppProps {
  projectId?: string;
}

export const DrawingApp = ({ projectId }: DrawingAppProps) => {
  const navigate = useNavigate();
  const {
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
    canUndo,
    canRedo,
    setWetMix,
    supportsWetMix,
    loadState,
    addReferenceImage,
    removeReferenceImage,
    updateReferenceImage,
  } = useDrawing();

  const isMobile = useIsMobile();
  const { recentBrushes, favoriteBrushes, toggleFavorite, addToRecent } = useBrushLibrary();

  // Detect iOS/iPadOS for default pencil-only mode
  const isIOS = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );

  // Default to finger+touch on all mobile devices for better accessibility
  const [inputMode, setInputMode] = useState<InputMode>(isMobile ? 'pencil_and_touch' : 'pencil_and_touch');
  const [eraserBrush, setEraserBrush] = useState<BrushType>('paintbrush');
  // Use mobile-friendly canvas size: design resolution (1080px base) scaled to screen aspect ratio
  const getMobileCanvasSize = (): CanvasSize => {
    if (typeof window === 'undefined') return DEFAULT_CANVAS_SIZE;
    // Use CSS viewport dimensions (not device pixels) with a 1080px base width
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const aspectRatio = viewportHeight / viewportWidth;
    // 1080px width base with height matching screen aspect ratio
    const width = 1080;
    const height = Math.round(1080 * aspectRatio);
    return { width, height, dpi: 144 };
  };

  const [canvasSize, setCanvasSize] = useState<CanvasSize>(
    isMobile ? getMobileCanvasSize() : DEFAULT_CANVAS_SIZE
  );
  const [showGestureGuide, setShowGestureGuide] = useState(false);
  const [showCanvasSizeDialog, setShowCanvasSizeDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showReferenceDialog, setShowReferenceDialog] = useState(false);
  const [exportCanvas, setExportCanvas] = useState<HTMLCanvasElement | null>(null);

  // Eyedropper state
  const [isEyedropperActive, setIsEyedropperActive] = useState(false);

  // Eyedropper loupe state (for long-press)
  const [showEyedropperLoupe, setShowEyedropperLoupe] = useState(false);
  const [loupePosition, setLoupePosition] = useState({ x: 0, y: 0 });
  const [loupeCanvasPosition, setLoupeCanvasPosition] = useState({ x: 0, y: 0 });
  const [sampledColor, setSampledColor] = useState('#000000');

  // Recent colors history
  const [recentColors, setRecentColors] = useState<string[]>([]);

  const handleColorUsed = useCallback((color: string) => {
    setRecentColors(prev => {
      const filtered = prev.filter(c => c.toLowerCase() !== color.toLowerCase());
      return [color, ...filtered].slice(0, 10);
    });
  }, []);

  // Confirmation dialogs
  const [pendingClear, setPendingClear] = useState(false);
  const [pendingDeleteLayerId, setPendingDeleteLayerId] = useState<string | null>(null);

  // Project name state
  const [projectName, setProjectName] = useState('Untitled');
  const [isProjectLoaded, setIsProjectLoaded] = useState(false);

  // Load project on mount
  useEffect(() => {
    const loadProjectData = async () => {
      if (projectId) {
        const project = await loadProject(projectId);
        if (project) {
          setProjectName(project.name);
          setCanvasSize({
            width: project.canvas.width,
            height: project.canvas.height,
            dpi: project.canvas.dpi,
          });
          setBackgroundColor(project.canvas.backgroundColor);
          loadState(project.layers, project.activeLayerId, project.wetMix, project.referenceImages);
          setCreatedAt(project.created);
        }
      }
      setIsProjectLoaded(true);
    };

    loadProjectData();
  }, [projectId]);

  // Project auto-save
  const {
    projectId: currentProjectId,
    isSaving,
    saveNow,
    setCreatedAt,
  } = useProjectAutoSave({
    projectId: projectId || null,
    projectName,
    layers: state.layers,
    canvasSize,
    backgroundColor: state.backgroundColor,
    activeLayerId: state.activeLayerId,
    wetMix: state.wetMix,
    referenceImages: state.referenceImages,
    customBrushes: [],
  });

  const handleSave = useCallback(async () => {
    const saved = await saveNow();
    if (saved) {
      toast.success('Saved!');
      // Update URL if this was a new project
      if (!projectId && saved) {
        navigate(`/draw/${saved}`, { replace: true });
      }
    } else {
      toast.error('Failed to save');
    }
  }, [saveNow, projectId, navigate]);

  const handleGoToGallery = useCallback(async () => {
    // Save before leaving
    await saveNow();
    navigate('/');
  }, [saveNow, navigate]);

  // Calculate initial transform to fit canvas in viewport
  const getInitialTransform = useCallback((): CanvasTransform => {
    // Use full viewport on mobile, with desktop padding otherwise
    const viewportWidth = isMobile
      ? (window.visualViewport?.width ?? window.innerWidth)
      : window.innerWidth - 200;
    const viewportHeight = isMobile
      ? (window.visualViewport?.height ?? window.innerHeight)
      : window.innerHeight - 150;
    const scaleX = viewportWidth / canvasSize.width;
    const scaleY = viewportHeight / canvasSize.height;
    // On mobile, fit exactly (no 0.9 margin); on desktop keep the margin
    const fitScale = isMobile
      ? Math.min(scaleX, scaleY, 1)
      : Math.min(scaleX, scaleY, 1) * 0.9;
    return { ...DEFAULT_TRANSFORM, scale: fitScale };
  }, [canvasSize, isMobile]);

  const [canvasTransform, setCanvasTransform] = useState<CanvasTransform>(() => ({
    ...DEFAULT_TRANSFORM,
    scale: 0.4,
  }));

  // Reset transform when canvas size changes
  useEffect(() => {
    setCanvasTransform(getInitialTransform());
  }, [canvasSize, getInitialTransform]);

  const handleTransformChange = useCallback((scale: number, offsetX: number, offsetY: number, rotation: number) => {
    setCanvasTransform({ scale, offsetX, offsetY, rotation });
  }, []);

  // Reset now means "fit to screen", not scale=1
  const handleResetTransform = useCallback(() => {
    setCanvasTransform(getInitialTransform());
  }, [getInitialTransform]);

  const handleEraserToggle = useCallback(() => {
    toggleEraser();
  }, [toggleEraser]);

  const handleEraserBrushChange = useCallback((brush: BrushType) => {
    setEraserBrush(brush);
    if (isEraser) {
      setBrushType(brush);
    }
  }, [isEraser, setBrushType]);

  const handleBrushChange = useCallback((brush: BrushType) => {
    if (isEraser) {
      toggleEraser();
    }
    setBrushType(brush);
    addToRecent(brush);
  }, [isEraser, toggleEraser, setBrushType, addToRecent]);

  const handleCustomBrushSelect = useCallback((preset: CustomBrushPreset) => {
    if (isEraser) {
      toggleEraser();
    }
    setActiveCustomBrush(preset);
    addToRecent(preset.id);
  }, [isEraser, toggleEraser, setActiveCustomBrush, addToRecent]);

  const handleColorChange = useCallback((color: string) => {
    if (isEraser) {
      toggleEraser();
    }
    setColor(color);
    setIsEyedropperActive(false);
  }, [isEraser, toggleEraser, setColor]);

  // Eyedropper color pick from canvas (click-based)
  const handleEyedropperPick = useCallback((color: string) => {
    handleColorChange(color);
    setIsEyedropperActive(false);
  }, [handleColorChange]);

  // Long-press eyedropper handlers
  const handleLongPressEyedropperStart = useCallback((
    screenPos: { x: number; y: number },
    canvasPos: { x: number; y: number },
    color: string
  ) => {
    setLoupePosition(screenPos);
    setLoupeCanvasPosition(canvasPos);
    setSampledColor(color);
    setShowEyedropperLoupe(true);
  }, []);

  const handleLongPressEyedropperMove = useCallback((
    screenPos: { x: number; y: number },
    canvasPos: { x: number; y: number },
    color: string
  ) => {
    setLoupePosition(screenPos);
    setLoupeCanvasPosition(canvasPos);
    setSampledColor(color);
  }, []);

  const handleLongPressEyedropperEnd = useCallback((color: string) => {
    setShowEyedropperLoupe(false);
    handleColorChange(color);
  }, [handleColorChange]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
        }
      }
      if (e.key === 'e' || e.key === 'E') {
        handleEraserToggle();
      }
      if (e.key === 'i' || e.key === 'I') {
        setIsEyedropperActive(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, handleEraserToggle]);

  const displayBrush = isEraser ? eraserBrush : state.brushType;
  const displayLabel = isEraser ? `${eraserBrush.replace('_', ' ')} eraser` : state.brushType.replace('_', ' ');
  const showWetMix = !isEraser && supportsWetMix(state.brushType);

  // Handle importing an everdraw file
  const handleImport = useCallback((file: EverdrawFile) => {
    setCanvasSize({
      width: file.canvas.width,
      height: file.canvas.height,
      dpi: file.canvas.dpi,
    });
    setBackgroundColor(file.canvas.backgroundColor);
    loadState(file.layers, file.activeLayerId, file.wetMix, file.referenceImages);
  }, [setBackgroundColor, loadState]);

  // Confirmation handlers
  const handleClearRequest = useCallback(() => {
    setPendingClear(true);
  }, []);

  const handleConfirmClear = useCallback(() => {
    clear();
    setPendingClear(false);
  }, [clear]);

  const handleDeleteLayerRequest = useCallback((layerId: string) => {
    const layer = state.layers.find(l => l.id === layerId);
    if (layer && layer.strokes.length > 0) {
      setPendingDeleteLayerId(layerId);
    } else {
      deleteLayer(layerId);
    }
  }, [state.layers, deleteLayer]);

  const handleConfirmDeleteLayer = useCallback(() => {
    if (pendingDeleteLayerId) {
      deleteLayer(pendingDeleteLayerId);
      setPendingDeleteLayerId(null);
    }
  }, [pendingDeleteLayerId, deleteLayer]);

  // Reference image handlers
  const handleAddReferenceImage = useCallback((ref: ReferenceImage) => {
    addReferenceImage(ref);
  }, [addReferenceImage]);

  const handleToggleReferenceVisibility = useCallback((id: string) => {
    const ref = state.referenceImages.find(r => r.id === id);
    if (ref) {
      updateReferenceImage(id, { visible: !ref.visible });
    }
  }, [state.referenceImages, updateReferenceImage]);

  const handleSetReferenceOpacity = useCallback((id: string, opacity: number) => {
    updateReferenceImage(id, { opacity });
  }, [updateReferenceImage]);

  const handleToggleReferenceLock = useCallback((id: string) => {
    const ref = state.referenceImages.find(r => r.id === id);
    if (ref) {
      updateReferenceImage(id, { locked: !ref.locked });
    }
  }, [state.referenceImages, updateReferenceImage]);

  // Flood fill handler - the fill is applied in the Canvas component
  const handleFloodFill = useCallback((_layerId: string, _x: number, _y: number, _color: string) => {
    // Fill operations are handled directly in the Canvas component
    // Future: Track fill operations as special stroke type for undo support
  }, []);



  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
      {/* Canvas - WebGL or Canvas 2D fallback */}
      {USE_WEBGL_RENDERER ? (
        <WebGLCanvas
          layers={state.layers}
          currentStroke={state.currentStroke}
          onStartStroke={startStroke}
          onContinueStroke={continueStroke}
          onEndStroke={endStroke}
          onCancelStroke={cancelStroke}
          inputMode={inputMode}
          backgroundColor={state.backgroundColor}
          activeLayerId={state.activeLayerId}
          transform={canvasTransform}
          onTransformChange={handleTransformChange}
          onUndo={undo}
          onRedo={redo}
          canvasSize={canvasSize}
          onCanvasReady={setExportCanvas}
          currentColor={state.color}
          currentBrushSize={state.brushSize}
          currentBrushOpacity={state.brushOpacity}
          currentBrushType={state.brushType}
          currentIsEraser={isEraser}
          currentCustomBrush={state.activeCustomBrush ?? undefined}
          currentWetMix={supportsWetMix(state.brushType) ? state.wetMix : undefined}
          referenceImages={state.referenceImages}
        />
      ) : (
        <Canvas
          layers={state.layers}
          currentStroke={state.currentStroke}
          onStartStroke={startStroke}
          onContinueStroke={continueStroke}
          onEndStroke={endStroke}
          inputMode={inputMode}
          backgroundColor={state.backgroundColor}
          activeLayerId={state.activeLayerId}
          pendingLayerMerge={state.pendingLayerMerge}
          onClearPendingMerge={clearPendingMerge}
          transform={canvasTransform}
          onTransformChange={handleTransformChange}
          onUndo={undo}
          onRedo={redo}
          canvasSize={canvasSize}
          onCanvasReady={setExportCanvas}
          isEyedropperActive={isEyedropperActive}
          onEyedropperPick={handleEyedropperPick}
          onLongPressEyedropperStart={handleLongPressEyedropperStart}
          onLongPressEyedropperMove={handleLongPressEyedropperMove}
          onLongPressEyedropperEnd={handleLongPressEyedropperEnd}
          referenceImages={state.referenceImages}
          onFloodFill={handleFloodFill}
        />
      )}

      {/* Top Toolbar */}
      <div className="absolute top-2 sm:top-4 left-2 sm:left-4 right-2 sm:right-4 z-10">
        <TopToolbar
          activeBrush={state.brushType}
          onBrushChange={handleBrushChange}
          currentColor={state.color}
          onColorChange={handleColorChange}
          recentColors={recentColors}
          onColorUsed={handleColorUsed}
          onCustomBrushSelect={handleCustomBrushSelect}
          isEraser={isEraser}
          eraserBrush={eraserBrush}
          onEraserToggle={handleEraserToggle}
          onEraserBrushChange={handleEraserBrushChange}
          onUndo={undo}
          onRedo={redo}
          onClear={handleClearRequest}
          canUndo={canUndo}
          canRedo={canRedo}
          isEyedropperActive={isEyedropperActive}
          onEyedropperToggle={() => setIsEyedropperActive(prev => !prev)}
          isMobile={isMobile}
          projectName={projectName}
          onGoToGallery={handleGoToGallery}
          onSave={handleSave}
          isSaving={isSaving}
          layerPanelContent={
            <LayerPanelContent
              layers={state.layers}
              activeLayerId={state.activeLayerId}
              onAddLayer={addLayer}
              onDeleteLayer={deleteLayer}
              onToggleVisibility={toggleLayerVisibility}
              onSelectLayer={setActiveLayer}
              onSetOpacity={setLayerOpacity}
              onMoveLayer={moveLayer}
              onReorderLayer={reorderLayer}
              onMergeLayers={mergeLayers}
              onRenameLayer={renameLayer}
              onRequestDeleteLayer={handleDeleteLayerRequest}
              referenceImages={state.referenceImages}
              onToggleReferenceVisibility={handleToggleReferenceVisibility}
              onSetReferenceOpacity={handleSetReferenceOpacity}
              onDeleteReference={removeReferenceImage}
              onToggleReferenceLock={handleToggleReferenceLock}
            />
          }
          settingsContent={
            <SettingsMenu
              backgroundColor={state.backgroundColor}
              onBackgroundColorChange={setBackgroundColor}
              inputMode={inputMode}
              onInputModeChange={setInputMode}
              onShowGestureGuide={() => setShowGestureGuide(true)}
              onShowCanvasSize={() => setShowCanvasSizeDialog(true)}
              canvasSize={canvasSize}
              onClear={handleClearRequest}
              onExport={() => setShowExportDialog(true)}
              onImport={() => setShowImportDialog(true)}
              onImportReference={() => setShowReferenceDialog(true)}
            />
          }
        />
      </div>

      {/* Desktop: Left Side - Vertical Sliders */}
      {!isMobile && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-2">
          <div className="glass-panel p-2">
            <SideSliders
              brushSize={state.brushSize}
              brushOpacity={state.brushOpacity}
              onSizeChange={setBrushSize}
              onOpacityChange={setBrushOpacity}
              color={isEraser ? 'hsl(var(--muted-foreground))' : state.color}
              isEraser={isEraser}
            />
          </div>

          {/* Wet Mix Toggle Button */}
          {showWetMix && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="glass-panel p-2 flex items-center justify-center hover:bg-muted/50 transition-colors"
                  title="Wet Mixing"
                >
                  <Droplets className="w-4 h-4 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="right" align="start" className="w-auto p-0">
                <WetMixControls
                  wetMix={state.wetMix}
                  onWetMixChange={setWetMix}
                  isActive={true}
                />
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}

      {/* Mobile: Bottom Brush Dock */}
      {isMobile && (
        <MobileBrushDock
          activeBrush={state.brushType}
          brushSize={state.brushSize}
          brushOpacity={state.brushOpacity}
          color={state.color}
          onBrushChange={handleBrushChange}
          onSizeChange={setBrushSize}
          onOpacityChange={setBrushOpacity}
          onCustomBrushSelect={handleCustomBrushSelect}
          isEraser={isEraser}
          onEraserToggle={handleEraserToggle}
          isEyedropperActive={isEyedropperActive}
          onEyedropperToggle={() => setIsEyedropperActive(prev => !prev)}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          wetMix={state.wetMix}
          onWetMixChange={setWetMix}
          showWetMix={showWetMix}
          recentColors={recentColors}
          onColorChange={handleColorChange}
          onColorUsed={handleColorUsed}
          recentBrushes={recentBrushes}
          favoriteBrushes={favoriteBrushes}
          onToggleFavorite={toggleFavorite}
        />
      )}

      {/* Zoom Controls */}
      <div className={cn(
        "absolute z-10",
        isMobile ? "right-2 top-20" : "right-4 bottom-4"
      )}>
        <ZoomControls
          transform={canvasTransform}
          onTransformChange={handleTransformChange}
          onReset={handleResetTransform}
        />

        {/* Quick Size Slider - Mobile only, below zoom controls */}
        {isMobile && (
          <div className="mt-2">
            <QuickSizeSlider
              size={state.brushSize}
              onSizeChange={setBrushSize}
              color={isEraser ? 'hsl(var(--muted-foreground))' : state.color}
            />
          </div>
        )}
      </div>

      {/* Desktop: Bottom Center - Current Tool Indicator */}
      {!isMobile && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
          <div className={cn(
            "glass-panel px-4 py-2 text-sm capitalize",
            isEraser ? 'text-destructive' : isEyedropperActive ? 'text-primary' : 'text-muted-foreground'
          )}>
            {isEyedropperActive ? 'Eyedropper (click canvas to pick color)' : `${displayLabel} • ${state.brushSize}px • ${Math.round(state.brushOpacity * 100)}%`}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <GestureGuide
        open={showGestureGuide}
        onOpenChange={setShowGestureGuide}
      />

      <CanvasSizeDialog
        open={showCanvasSizeDialog}
        onOpenChange={setShowCanvasSizeDialog}
        currentSize={canvasSize}
        onSizeChange={setCanvasSize}
      />

      <ExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        layers={state.layers}
        canvasSize={canvasSize}
        backgroundColor={state.backgroundColor}
        activeLayerId={state.activeLayerId}
        wetMix={state.wetMix}
        referenceImages={state.referenceImages}
        sourceCanvas={exportCanvas}
        projectId={currentProjectId || undefined}
        onExportComplete={handleSave}
      />

      <ImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImport={handleImport}
      />

      <ReferenceImageDialog
        open={showReferenceDialog}
        onOpenChange={setShowReferenceDialog}
        onImport={handleAddReferenceImage}
        canvasWidth={canvasSize.width}
        canvasHeight={canvasSize.height}
      />


      <ConfirmDialog
        open={pendingClear}
        onOpenChange={setPendingClear}
        title="Clear Canvas?"
        description="This will remove all strokes from all layers. This action cannot be undone."
        confirmText="Clear All"
        onConfirm={handleConfirmClear}
        variant="destructive"
      />

      <ConfirmDialog
        open={pendingDeleteLayerId !== null}
        onOpenChange={(open) => !open && setPendingDeleteLayerId(null)}
        title="Delete Layer?"
        description="This layer has strokes. Are you sure you want to delete it? This action cannot be undone."
        confirmText="Delete"
        onConfirm={handleConfirmDeleteLayer}
        variant="destructive"
      />

      {/* Eyedropper Loupe (long-press) */}
      <EyedropperLoupe
        position={loupePosition}
        canvasPosition={loupeCanvasPosition}
        canvasRef={exportCanvas}
        sampledColor={sampledColor}
        visible={showEyedropperLoupe}
      />
    </div>
  );
};
