import { Plus, Minus, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CanvasTransform } from '@/types/canvasTransform';

interface ZoomControlsProps {
  transform: CanvasTransform;
  onTransformChange: (scale: number, offsetX: number, offsetY: number, rotation: number) => void;
  onReset: () => void;
  fitTransform?: CanvasTransform; // The "fit to screen" transform to compare against
}

export const ZoomControls = ({ transform, onTransformChange, onReset, fitTransform }: ZoomControlsProps) => {
  const handleZoomIn = () => {
    const newScale = Math.min(5, transform.scale * 1.25);
    onTransformChange(newScale, transform.offsetX, transform.offsetY, transform.rotation);
  };

  const handleZoomOut = () => {
    const newScale = Math.max(0.25, transform.scale / 1.25);
    onTransformChange(newScale, transform.offsetX, transform.offsetY, transform.rotation);
  };

  const handleFitToScreen = () => {
    onReset();
  };

  // Compare against fitTransform (default) to determine if we're at "fit" state
  const compareTransform = fitTransform ?? { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 };
  const isAtFit = Math.abs(transform.scale - compareTransform.scale) < 0.01 && 
                  Math.abs(transform.offsetX - compareTransform.offsetX) < 1 && 
                  Math.abs(transform.offsetY - compareTransform.offsetY) < 1 &&
                  Math.abs(transform.rotation - compareTransform.rotation) < 0.1;

  return (
    <div className="glass-panel p-1 sm:p-1.5 flex flex-col gap-0.5 sm:gap-1 animate-fade-in">
      <button
        onClick={handleZoomIn}
        className="p-1.5 sm:p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--tool-hover))] transition-all active:scale-95 touch-manipulation"
        title="Zoom In"
      >
        <Plus className="w-4 h-4" />
      </button>
      
      <button
        onClick={handleZoomOut}
        className="p-1.5 sm:p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--tool-hover))] transition-all active:scale-95 touch-manipulation"
        title="Zoom Out"
      >
        <Minus className="w-4 h-4" />
      </button>
      
      <div className="h-px bg-border my-0.5" />
      
      <button
        onClick={handleFitToScreen}
        disabled={isAtFit}
        className={cn(
          'p-1.5 sm:p-2 rounded-lg transition-all active:scale-95 touch-manipulation',
          isAtFit
            ? 'text-muted-foreground/40 cursor-not-allowed'
            : 'text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--tool-hover))]'
        )}
        title="Fit to Screen"
      >
        <RotateCcw className="w-4 h-4" />
      </button>

      {/* Zoom Percentage - always show for clarity */}
      <div className="text-[10px] text-muted-foreground text-center font-mono py-0.5 sm:py-1">
        {Math.round(transform.scale * 100)}%
      </div>
    </div>
  );
};
