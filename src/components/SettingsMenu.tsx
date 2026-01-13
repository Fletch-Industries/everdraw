import { HelpCircle, Palette, Hand, Trash2, Maximize2, Download, Upload, ImagePlus } from 'lucide-react';
import { InputMode } from '@/types/drawing';
import { CanvasSize } from '@/types/canvasSize';
import { cn } from '@/lib/utils';

interface SettingsMenuProps {
  backgroundColor: string;
  onBackgroundColorChange: (color: string) => void;
  inputMode: InputMode;
  onInputModeChange: (mode: InputMode) => void;
  onShowGestureGuide: () => void;
  onShowCanvasSize: () => void;
  canvasSize: CanvasSize;
  onClear: () => void;
  onExport: () => void;
  onImport: () => void;
  onImportReference: () => void;
}

const backgroundColors = [
  '#0f0f0f', '#1a1a1a', '#262626', '#404040', '#737373',
  '#ffffff', '#fef3c7', '#e0f2fe', '#dcfce7', '#fce7f3',
];

export const SettingsMenu = ({
  backgroundColor,
  onBackgroundColorChange,
  inputMode,
  onInputModeChange,
  onShowGestureGuide,
  onShowCanvasSize,
  canvasSize,
  onClear,
  onExport,
  onImport,
  onImportReference,
}: SettingsMenuProps) => {
  return (
    <div className="glass-panel p-3 w-[200px] space-y-4">
      {/* Background Color */}
      <div>
        <div className="text-xs text-muted-foreground mb-2 font-medium">Canvas Background</div>
        <div className="grid grid-cols-5 gap-1.5">
          {backgroundColors.map((color) => (
            <button
              key={color}
              onClick={() => onBackgroundColorChange(color)}
              className={cn(
                'w-6 h-6 rounded-md border transition-all hover:scale-110',
                backgroundColor.toLowerCase() === color.toLowerCase()
                  ? 'border-primary ring-2 ring-primary/30' 
                  : 'border-border/50'
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Input Mode */}
      <div>
        <div className="text-xs text-muted-foreground mb-2 font-medium">Input Mode</div>
        <div className="flex gap-2">
          <button
            onClick={() => onInputModeChange('pencil_only')}
            className={cn(
              'flex-1 px-3 py-2 rounded-lg text-xs transition-all',
              inputMode === 'pencil_only'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            Pencil Only
          </button>
          <button
            onClick={() => onInputModeChange('pencil_and_touch')}
            className={cn(
              'flex-1 px-3 py-2 rounded-lg text-xs transition-all',
              inputMode === 'pencil_and_touch'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            Touch + Pencil
          </button>
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Canvas Size */}
      <div>
        <div className="text-xs text-muted-foreground mb-2 font-medium">Canvas Size</div>
        <button
          onClick={onShowCanvasSize}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
        >
          <div className="flex items-center gap-2">
            <Maximize2 className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs">{canvasSize.width} × {canvasSize.height}</span>
          </div>
          <span className="text-xs text-muted-foreground">{canvasSize.dpi} DPI</span>
        </button>
      </div>

      <div className="h-px bg-border" />

      {/* Actions */}
      <div className="space-y-1">
        <button
          onClick={onExport}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export Canvas
        </button>
        <button
          onClick={onImport}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <Upload className="w-4 h-4" />
          Import Canvas
        </button>
        <button
          onClick={onImportReference}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <ImagePlus className="w-4 h-4" />
          Import Reference Image
        </button>
        <button
          onClick={onShowGestureGuide}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <HelpCircle className="w-4 h-4" />
          Gesture Guide
        </button>
        <button
          onClick={onClear}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Clear Canvas
        </button>
      </div>
    </div>
  );
};