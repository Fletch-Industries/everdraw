import { Undo2, Redo2, Layers, Menu, Pipette, Home, Save } from 'lucide-react';
import { BrushType } from '@/types/drawing';
import { CustomBrushPreset } from '@/types/customBrush';
import { cn } from '@/lib/utils';
import { BrushPicker } from './BrushPicker';
import { EraserPicker } from './EraserPicker';
import { ColorPicker } from './ColorPicker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface TopToolbarProps {
  // Brush state
  activeBrush: BrushType;
  onBrushChange: (brush: BrushType) => void;
  currentColor: string;
  onColorChange: (color: string) => void;
  recentColors?: string[];
  onColorUsed?: (color: string) => void;
  onCustomBrushSelect?: (preset: CustomBrushPreset) => void;
  
  // Eraser state
  isEraser: boolean;
  eraserBrush: BrushType;
  onEraserToggle: () => void;
  onEraserBrushChange: (brush: BrushType) => void;
  
  // Eyedropper
  isEyedropperActive?: boolean;
  onEyedropperToggle?: () => void;
  
  // Actions
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  
  // Layer panel
  layerPanelContent: React.ReactNode;
  
  // Settings menu
  settingsContent: React.ReactNode;
  
  // Mobile mode
  isMobile?: boolean;
  
  // Project actions
  projectName?: string;
  onGoToGallery?: () => void;
  onSave?: () => void;
  isSaving?: boolean;
}

export const TopToolbar = ({
  activeBrush,
  onBrushChange,
  currentColor,
  onColorChange,
  recentColors = [],
  onColorUsed,
  onCustomBrushSelect,
  isEraser,
  eraserBrush,
  onEraserToggle,
  onEraserBrushChange,
  isEyedropperActive = false,
  onEyedropperToggle,
  onUndo,
  onRedo,
  onClear,
  canUndo,
  canRedo,
  layerPanelContent,
  settingsContent,
  isMobile = false,
  projectName,
  onGoToGallery,
  onSave,
  isSaving = false,
}: TopToolbarProps) => {
  return (
    <div className="glass-panel px-1.5 sm:px-2 py-1 sm:py-1.5 flex items-center justify-between gap-1 sm:gap-2 animate-fade-in">
      {/* Left side - Gallery + Menu/Settings */}
      <div className="flex items-center gap-1">
        {onGoToGallery && (
          <button
            onClick={onGoToGallery}
            className="tool-button p-2 sm:p-2.5 touch-manipulation"
            title="Back to Gallery"
          >
            <Home className="w-5 h-5" />
          </button>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="tool-button p-2 sm:p-2.5 touch-manipulation"
              title="Settings"
            >
              <Menu className="w-5 h-5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            {settingsContent}
          </PopoverContent>
        </Popover>
        {onSave && (
          <button
            onClick={onSave}
            disabled={isSaving}
            className={cn(
              "tool-button p-2 sm:p-2.5 touch-manipulation",
              isSaving && "opacity-50"
            )}
            title="Save"
          >
            <Save className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Right side - Tools */}
      <div className="flex items-center gap-0.5 sm:gap-1">
        {/* Desktop only: Brush Picker, Eraser, Eyedropper */}
        {!isMobile && (
          <>
            <div className={cn(!isEraser && 'opacity-100', isEraser && 'opacity-60')}>
              <BrushPicker
                activeBrush={activeBrush}
                onBrushChange={onBrushChange}
                currentColor={currentColor}
                onCustomBrushSelect={onCustomBrushSelect}
              />
            </div>

            <EraserPicker
              isActive={isEraser}
              eraserBrush={eraserBrush}
              onActivate={onEraserToggle}
              onBrushChange={onEraserBrushChange}
            />

            <button
              onClick={onEyedropperToggle}
              className={cn(
                'tool-button p-2 sm:p-2.5 touch-manipulation',
                isEyedropperActive && 'bg-primary text-primary-foreground'
              )}
              title="Eyedropper (I)"
            >
              <Pipette className="w-5 h-5" />
            </button>

            <div className="w-px h-6 sm:h-8 bg-border mx-0.5 sm:mx-1" />
          </>
        )}

        {/* Layers Popover - always visible */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="tool-button p-2 sm:p-2.5 touch-manipulation"
              title="Layers"
            >
              <Layers className="w-5 h-5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0 bg-transparent border-0">
            {layerPanelContent}
          </PopoverContent>
        </Popover>

        {/* Desktop only: Undo/Redo and Color Picker */}
        {!isMobile && (
          <>
            <div className="w-px h-6 sm:h-8 bg-border mx-0.5 sm:mx-1" />

            <button
              onClick={onUndo}
              disabled={!canUndo}
              className={cn(
                'tool-button p-2 sm:p-2.5 touch-manipulation',
                !canUndo && 'opacity-30 cursor-not-allowed'
              )}
              title="Undo (Cmd+Z)"
            >
              <Undo2 className="w-5 h-5" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className={cn(
                'tool-button p-2 sm:p-2.5 touch-manipulation',
                !canRedo && 'opacity-30 cursor-not-allowed'
              )}
              title="Redo (Cmd+Shift+Z)"
            >
              <Redo2 className="w-5 h-5" />
            </button>

            <div className="w-px h-6 sm:h-8 bg-border mx-0.5 sm:mx-1" />

            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl border-2 border-border hover:scale-105 active:scale-95 transition-transform shadow-inner touch-manipulation"
                  style={{ backgroundColor: currentColor }}
                  title="Color"
                />
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0 bg-transparent border-0">
                <ColorPicker 
                  color={currentColor} 
                  onChange={onColorChange} 
                  recentColors={recentColors}
                  onColorUsed={onColorUsed}
                />
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>
    </div>
  );
};