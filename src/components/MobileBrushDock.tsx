import { useState, useCallback } from 'react';
import { Settings2, Pipette, Eraser, Undo2, Redo2 } from 'lucide-react';
import { BrushType, WetMixSettings } from '@/types/drawing';
import { CustomBrushPreset } from '@/types/customBrush';
import { cn } from '@/lib/utils';
import { SideSliders } from './SideSliders';
import { WetMixControls } from './WetMixControls';
import { MobileBrushSheet } from './MobileBrushSheet';
import { MobileColorSheet } from './MobileColorSheet';
import { getIconForBrush } from './BrushPicker';

interface MobileBrushDockProps {
  // Brush state
  activeBrush: BrushType;
  brushSize: number;
  brushOpacity: number;
  color: string;
  onBrushChange: (brush: BrushType) => void;
  onSizeChange: (size: number) => void;
  onOpacityChange: (opacity: number) => void;
  onCustomBrushSelect?: (preset: CustomBrushPreset) => void;
  
  // Eraser state
  isEraser: boolean;
  onEraserToggle: () => void;
  
  // Eyedropper
  isEyedropperActive: boolean;
  onEyedropperToggle: () => void;
  
  // Undo/Redo
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  
  // Wet mix
  wetMix: WetMixSettings;
  onWetMixChange: (wetMix: WetMixSettings) => void;
  showWetMix: boolean;
  
  // Recent colors
  recentColors: string[];
  onColorChange: (color: string) => void;
  onColorUsed?: (color: string) => void;
  
  // Recent/favorite brushes
  recentBrushes: string[];
  favoriteBrushes: string[];
  onToggleFavorite?: (brushId: string) => void;
}

export const MobileBrushDock = ({
  activeBrush,
  brushSize,
  brushOpacity,
  color,
  onBrushChange,
  onSizeChange,
  onOpacityChange,
  onCustomBrushSelect,
  isEraser,
  onEraserToggle,
  isEyedropperActive,
  onEyedropperToggle,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  wetMix,
  onWetMixChange,
  showWetMix,
  recentColors,
  onColorChange,
  onColorUsed,
  favoriteBrushes,
  onToggleFavorite,
}: MobileBrushDockProps) => {
  const [showSettings, setShowSettings] = useState(false);
  const [showBrushSheet, setShowBrushSheet] = useState(false);
  const [showColorSheet, setShowColorSheet] = useState(false);
  
  const ActiveIcon = getIconForBrush(activeBrush);
  const displayLabel = isEraser 
    ? `${activeBrush.replace('_', ' ')} eraser` 
    : activeBrush.replace('_', ' ');

  const handleBrushTap = useCallback(() => {
    setShowBrushSheet(true);
  }, []);

  // Close settings when tapping outside
  const handleBackdropTap = useCallback(() => {
    setShowSettings(false);
  }, []);

  return (
    <>
      {/* Backdrop to dismiss settings panel */}
      {showSettings && (
        <div 
          className="fixed inset-0 z-[5]" 
          onClick={handleBackdropTap}
          onTouchEnd={handleBackdropTap}
        />
      )}
      
      <div className="absolute left-2 right-2 bottom-2 z-10">
        <div className={cn(
          "glass-panel transition-all duration-300 rounded-2xl"
        )}>
          {/* Collapsed State - Always Visible */}
          <div className="flex items-center justify-between p-2 gap-2">
            {/* Left: Color swatch */}
            <button
              onClick={() => setShowColorSheet(true)}
              className="w-10 h-10 rounded-xl border-2 border-border/50 flex-shrink-0 transition-all hover:scale-105 active:scale-95 touch-manipulation shadow-sm"
              style={{ backgroundColor: color }}
              title="Pick Color"
            />

            {/* Center: Main brush button (tap to change brush) */}
            <button
              onClick={handleBrushTap}
              className="flex items-center gap-2 flex-1 min-w-0 px-3 py-2 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors touch-manipulation"
            >
              <ActiveIcon className={cn(
                "w-5 h-5 flex-shrink-0",
                isEraser ? "text-destructive" : "text-foreground"
              )} />
              
              <div className="text-left min-w-0 flex-1">
                <div className={cn(
                  "text-sm font-medium capitalize truncate",
                  isEraser ? "text-destructive" : "text-foreground"
                )}>
                  {displayLabel}
                </div>
                <div className="text-xs text-muted-foreground">
                  {brushSize}px • {Math.round(brushOpacity * 100)}%
                </div>
              </div>
            </button>

            {/* Settings button */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center touch-manipulation transition-all",
                showSettings 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-muted/50 text-foreground hover:bg-muted"
              )}
            >
              <Settings2 className="w-5 h-5" />
            </button>

            {/* Undo/Redo */}
            <div className="flex items-center gap-1">
              <button
                onClick={onUndo}
                disabled={!canUndo}
                className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center touch-manipulation",
                  canUndo ? "text-foreground hover:bg-muted/50" : "text-muted-foreground/30"
                )}
              >
                <Undo2 className="w-5 h-5" />
              </button>
              <button
                onClick={onRedo}
                disabled={!canRedo}
                className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center touch-manipulation",
                  canRedo ? "text-foreground hover:bg-muted/50" : "text-muted-foreground/30"
                )}
              >
                <Redo2 className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="px-3 pb-3 space-y-3 border-t border-border/50 pt-3">
              {/* Size & Opacity Sliders */}
              <SideSliders
                brushSize={brushSize}
                brushOpacity={brushOpacity}
                onSizeChange={onSizeChange}
                onOpacityChange={onOpacityChange}
                color={isEraser ? 'hsl(var(--muted-foreground))' : color}
                isEraser={isEraser}
                horizontal
              />

              {/* Quick Tools Row */}
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={onEyedropperToggle}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl transition-all touch-manipulation",
                    isEyedropperActive 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted/50 text-foreground hover:bg-muted"
                  )}
                >
                  <Pipette className="w-5 h-5" />
                  <span className="text-sm font-medium">Pick Color</span>
                </button>
                
                <button
                  onClick={onEraserToggle}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl transition-all touch-manipulation",
                    isEraser 
                      ? "bg-destructive text-destructive-foreground" 
                      : "bg-muted/50 text-foreground hover:bg-muted"
                  )}
                >
                  <Eraser className="w-5 h-5" />
                  <span className="text-sm font-medium">Eraser</span>
                </button>
              </div>

              {/* Wet Mix Controls */}
              {showWetMix && (
                <WetMixControls
                  wetMix={wetMix}
                  onWetMixChange={onWetMixChange}
                  isActive={true}
                  compact
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Brush Selection Sheet */}
      <MobileBrushSheet
        open={showBrushSheet}
        onOpenChange={setShowBrushSheet}
        activeBrush={activeBrush}
        onBrushChange={onBrushChange}
        onCustomBrushSelect={onCustomBrushSelect}
        currentColor={color}
        favoriteBrushes={favoriteBrushes}
        onToggleFavorite={onToggleFavorite}
      />

      {/* Color Picker Sheet */}
      <MobileColorSheet
        open={showColorSheet}
        onOpenChange={setShowColorSheet}
        color={color}
        onColorChange={onColorChange}
        recentColors={recentColors}
        onColorUsed={onColorUsed}
      />
    </>
  );
};