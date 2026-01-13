import { useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';

interface QuickSizeSliderProps {
  size: number;
  onSizeChange: (size: number) => void;
  color: string;
  minSize?: number;
  maxSize?: number;
}

export const QuickSizeSlider = ({
  size,
  onSizeChange,
  color,
  minSize = 1,
  maxSize = 100,
}: QuickSizeSliderProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);

  const calculateSize = useCallback((clientY: number) => {
    if (!sliderRef.current) return size;
    const rect = sliderRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    const height = rect.height;
    // Invert: top = max, bottom = min
    const percent = 1 - Math.max(0, Math.min(1, y / height));
    return Math.round(minSize + percent * (maxSize - minSize));
  }, [minSize, maxSize, size]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    
    // Capture pointer on the slider element itself
    sliderRef.current?.setPointerCapture(e.pointerId);
    
    const newSize = calculateSize(e.clientY);
    onSizeChange(newSize);
  }, [calculateSize, onSizeChange]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    
    const newSize = calculateSize(e.clientY);
    onSizeChange(newSize);
  }, [isDragging, calculateSize, onSizeChange]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      sliderRef.current?.releasePointerCapture(e.pointerId);
    }
    setIsDragging(false);
  }, [isDragging]);

  const fillPercent = ((size - minSize) / (maxSize - minSize)) * 100;

  return (
    <div className="glass-panel p-1.5 flex flex-col items-center gap-1 animate-fade-in">
      {/* Size indicator */}
      <div className="text-[10px] text-muted-foreground font-mono">
        {size}
      </div>
      
      {/* Vertical slider track */}
      <div
        ref={sliderRef}
        className={cn(
          "relative w-8 h-28 rounded-full bg-muted/50 cursor-pointer select-none",
          isDragging && "ring-2 ring-primary/50"
        )}
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Fill */}
        <div
          className="absolute bottom-0 left-0 right-0 rounded-full pointer-events-none"
          style={{
            height: `${fillPercent}%`,
            backgroundColor: color,
            opacity: 0.6,
          }}
        />
        
        {/* Thumb indicator */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-6 h-6 rounded-full border-2 border-background shadow-md pointer-events-none"
          style={{
            bottom: `calc(${fillPercent}% - 12px)`,
            backgroundColor: color,
          }}
        />
      </div>
      
      {/* Preview dot */}
      <div
        className="rounded-full border border-border/50 pointer-events-none"
        style={{
          width: Math.min(Math.max(6, size * 0.2), 20),
          height: Math.min(Math.max(6, size * 0.2), 20),
          backgroundColor: color,
        }}
      />
    </div>
  );
};
