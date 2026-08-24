import { useRef, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

interface SideSlidersProps {
  brushSize: number;
  brushOpacity: number;
  onSizeChange: (size: number) => void;
  onOpacityChange: (opacity: number) => void;
  color: string;
  isEraser: boolean;
  horizontal?: boolean;
}

// Custom vertical slider using pointer events for smooth touch handling
interface VerticalSliderProps {
  value: number; // 0-100
  onChange: (value: number) => void;
  trackColor?: string;
  thumbColor: string;
  showGradient?: boolean;
  gradientColor?: string;
}

const VerticalSlider = ({
  value,
  onChange,
  trackColor,
  thumbColor,
  showGradient = false,
  gradientColor,
}: VerticalSliderProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const calculateValue = useCallback((clientY: number) => {
    if (!containerRef.current) return value;
    const rect = containerRef.current.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    const percentage = 1 - (relativeY / rect.height);
    return Math.max(0, Math.min(100, percentage * 100));
  }, [value]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const newValue = calculateValue(e.clientY);
    onChange(newValue);
  }, [calculateValue, onChange]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const newValue = calculateValue(e.clientY);
    onChange(newValue);
  }, [calculateValue, onChange]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    isDragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-[100px] w-8 flex items-center justify-center cursor-pointer select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Track Background */}
      {showGradient ? (
        <div 
          className="absolute h-full w-1.5 rounded-full"
          style={{
            background: `linear-gradient(to top, transparent, ${gradientColor})`,
          }}
        />
      ) : (
        <>
          <div className="absolute h-full w-1.5 bg-muted rounded-full" />
          {/* Fill */}
          <div 
            className="absolute bottom-0 w-1.5 rounded-full"
            style={{ 
              height: `${value}%`,
              backgroundColor: trackColor,
            }}
          />
        </>
      )}
      
      {/* Thumb - no transition for immediate feedback */}
      <div 
        className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
        style={{ 
          bottom: `calc(${value}% - 10px)`,
        }}
      >
        <div 
          className="w-5 h-5 rounded-full border-2 border-foreground shadow-lg active:scale-110"
          style={{ 
            backgroundColor: thumbColor,
          }}
        />
      </div>
    </div>
  );
};

export const SideSliders = ({
  brushSize,
  brushOpacity,
  onSizeChange,
  onOpacityChange,
  color,
  isEraser,
  horizontal = false,
}: SideSlidersProps) => {
  // Convert to 0-100 range for display
  const sizePercent = Math.max(0, Math.min(100, ((brushSize - 2) / 98) * 100));
  const opacityPercent = brushOpacity * 100;

  const handleSizeChange = (percent: number) => {
    const size = 2 + (percent / 100) * 98;
    onSizeChange(Math.round(size));
  };

  const handleOpacityChange = (percent: number) => {
    onOpacityChange(percent / 100);
  };

  const handleSizeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleSizeChange(parseFloat(e.target.value));
  };

  const handleOpacityInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleOpacityChange(parseFloat(e.target.value));
  };

  // Calculate preview size (scaled down for display, max 32px)
  const previewSize = Math.min(Math.max(6, brushSize * 0.4), 32);
  const activeColor = isEraser ? 'hsl(var(--muted-foreground))' : color;

  if (horizontal) {
    return (
      <div className="space-y-3">
        {/* Size Slider - Horizontal */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider w-14">Size</span>
          <div className="flex-1 relative h-8 flex items-center">
            {/* Track Background */}
            <div className="absolute w-full h-1.5 bg-muted rounded-full" />
            
            {/* Fill */}
            <div 
              className="absolute h-1.5 rounded-full"
              style={{ 
                width: `${sizePercent}%`,
                backgroundColor: activeColor,
              }}
            />
            
            {/* Input */}
            <input
              type="range"
              min="0"
              max="100"
              value={sizePercent}
              onChange={handleSizeInputChange}
              className="absolute w-full h-8 appearance-none bg-transparent cursor-pointer touch-manipulation
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-5
                [&::-webkit-slider-thumb]:h-5
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:border-2
                [&::-webkit-slider-thumb]:border-foreground
                [&::-webkit-slider-thumb]:shadow-lg
                [&::-webkit-slider-thumb]:cursor-pointer
                [&::-moz-range-thumb]:w-5
                [&::-moz-range-thumb]:h-5
                [&::-moz-range-thumb]:rounded-full
                [&::-moz-range-thumb]:border-2
                [&::-moz-range-thumb]:border-foreground
                [&::-moz-range-thumb]:shadow-lg"
              style={{
                '--thumb-bg': activeColor,
              } as CSSProperties}
            />
          </div>
          <span className="text-xs text-muted-foreground font-mono w-8 text-right">{brushSize}</span>
        </div>

        {/* Opacity Slider - Horizontal */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider w-14">Opacity</span>
          <div className="flex-1 relative h-8 flex items-center">
            {/* Track Background with gradient */}
            <div 
              className="absolute w-full h-1.5 rounded-full"
              style={{
                background: `linear-gradient(to right, transparent, ${activeColor})`,
              }}
            />
            
            {/* Input */}
            <input
              type="range"
              min="0"
              max="100"
              value={opacityPercent}
              onChange={handleOpacityInputChange}
              className="absolute w-full h-8 appearance-none bg-transparent cursor-pointer touch-manipulation
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-5
                [&::-webkit-slider-thumb]:h-5
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:border-2
                [&::-webkit-slider-thumb]:border-foreground
                [&::-webkit-slider-thumb]:bg-foreground
                [&::-webkit-slider-thumb]:shadow-lg
                [&::-webkit-slider-thumb]:cursor-pointer
                [&::-moz-range-thumb]:w-5
                [&::-moz-range-thumb]:h-5
                [&::-moz-range-thumb]:rounded-full
                [&::-moz-range-thumb]:border-2
                [&::-moz-range-thumb]:border-foreground
                [&::-moz-range-thumb]:bg-foreground
                [&::-moz-range-thumb]:shadow-lg"
            />
          </div>
          <span className="text-xs text-muted-foreground font-mono w-8 text-right">{Math.round(opacityPercent)}%</span>
        </div>
      </div>
    );
  }

  // Vertical layout with custom pointer-event sliders
  return (
    <div className="flex flex-col gap-3 items-center">
      {/* Live Brush Preview */}
      <div className="relative w-10 h-10 flex items-center justify-center rounded-lg overflow-hidden border border-border/50">
        {/* Dark checkerboard background for opacity visibility */}
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(45deg, #1a1a1a 25%, #2a2a2a 25%),
              linear-gradient(-45deg, #1a1a1a 25%, #2a2a2a 25%),
              linear-gradient(45deg, #2a2a2a 75%, #1a1a1a 75%),
              linear-gradient(-45deg, #2a2a2a 75%, #1a1a1a 75%)
            `,
            backgroundSize: '8px 8px',
            backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
          }}
        />
        {/* Preview dot with border for visibility on any background */}
        <div
          className="rounded-full transition-all duration-100 ease-out relative z-10"
          style={{
            width: previewSize,
            height: previewSize,
            backgroundColor: activeColor,
            opacity: brushOpacity,
            border: '1px solid rgba(255,255,255,0.2)',
            boxShadow: `0 0 ${previewSize / 3}px rgba(0,0,0,0.5)`,
          }}
        />
      </div>

      {/* Size Slider */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Size</span>
        <VerticalSlider
          value={sizePercent}
          onChange={handleSizeChange}
          trackColor={activeColor}
          thumbColor={activeColor}
        />
        <span className="text-xs text-muted-foreground font-mono">{brushSize}</span>
      </div>

      {/* Opacity Slider */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Opacity</span>
        <VerticalSlider
          value={opacityPercent}
          onChange={handleOpacityChange}
          thumbColor="hsl(var(--foreground))"
          showGradient
          gradientColor={activeColor}
        />
        <span className="text-xs text-muted-foreground font-mono">{Math.round(opacityPercent)}%</span>
      </div>
    </div>
  );
};
