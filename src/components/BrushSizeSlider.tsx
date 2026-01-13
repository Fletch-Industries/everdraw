import { useMemo, useCallback } from 'react';

interface BrushSizeSliderProps {
  size: number;
  onChange: (size: number) => void;
  color: string;
}

const MIN_SIZE = 2;
const MAX_SIZE = 20000;

// Convert slider position (0-100) to brush size using logarithmic scale
const sliderToSize = (sliderValue: number): number => {
  const normalized = sliderValue / 100;
  return MIN_SIZE * Math.pow(MAX_SIZE / MIN_SIZE, normalized);
};

// Convert brush size to slider position (0-100)
const sizeToSlider = (size: number): number => {
  return 100 * Math.log(size / MIN_SIZE) / Math.log(MAX_SIZE / MIN_SIZE);
};

export const BrushSizeSlider = ({ size, onChange, color }: BrushSizeSliderProps) => {
  const displaySize = useMemo(() => Math.round(size), [size]);
  const sliderValue = useMemo(() => sizeToSlider(Math.max(MIN_SIZE, Math.min(MAX_SIZE, size))), [size]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = sliderToSize(Number(e.target.value));
    onChange(Math.round(newSize));
  }, [onChange]);

  return (
    <div className="glass-panel p-3 animate-fade-in">
      {/* Size Preview */}
      <div className="flex items-center justify-center mb-3 h-16">
        <div
          className="rounded-full transition-all duration-150"
          style={{
            width: Math.max(4, Math.min(size, 64)),
            height: Math.max(4, Math.min(size, 64)),
            backgroundColor: color,
            boxShadow: `0 0 ${Math.min(size, 64) / 2}px ${color}40`,
          }}
        />
      </div>

      {/* Slider */}
      <div className="relative">
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={sliderValue}
          onChange={handleSliderChange}
          className="w-full h-1 bg-muted rounded-full appearance-none cursor-pointer 
            [&::-webkit-slider-thumb]:appearance-none 
            [&::-webkit-slider-thumb]:w-4 
            [&::-webkit-slider-thumb]:h-4 
            [&::-webkit-slider-thumb]:bg-foreground 
            [&::-webkit-slider-thumb]:rounded-full 
            [&::-webkit-slider-thumb]:shadow-lg 
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:hover:scale-110"
        />
      </div>

      {/* Size Label */}
      <div className="text-center mt-2 text-xs text-muted-foreground">
        {displaySize}px
      </div>
    </div>
  );
};
