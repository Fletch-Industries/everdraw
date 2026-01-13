import { useState, useMemo } from 'react';
import { HexColorPicker } from 'react-colorful';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface BrushPanelProps {
  color: string;
  size: number;
  opacity: number;
  onColorChange: (color: string) => void;
  onSizeChange: (size: number) => void;
  onOpacityChange: (opacity: number) => void;
}

const presetColors = [
  '#ffffff', '#e2e2e2', '#a3a3a3', '#525252', '#171717',
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#78716c',
];

export const BrushPanel = ({ color, size, opacity, onColorChange, onSizeChange, onOpacityChange }: BrushPanelProps) => {
  const [isColorOpen, setIsColorOpen] = useState(false);
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const displaySize = useMemo(() => Math.round(size), [size]);
  const displayOpacity = useMemo(() => Math.round(opacity * 100), [opacity]);

  const handleColorChange = (newColor: string) => {
    onColorChange(newColor);
    setRecentColors(prev => {
      const filtered = prev.filter(c => c !== newColor);
      return [newColor, ...filtered].slice(0, 5);
    });
  };

  return (
    <div className="glass-panel p-3 animate-fade-in w-[180px]">
      {/* Brush Preview - shows current color and size */}
      <div className="flex items-center gap-3 mb-3">
        {/* Color Button */}
        <Popover open={isColorOpen} onOpenChange={setIsColorOpen}>
          <PopoverTrigger asChild>
            <button
              className="w-10 h-10 rounded-lg border-2 border-border shadow-inner hover:scale-105 transition-transform flex-shrink-0"
              style={{ backgroundColor: color }}
              title="Pick Color"
            />
          </PopoverTrigger>
          <PopoverContent 
            className="w-auto p-3 bg-popover border-border z-50" 
            side="left" 
            align="start"
            sideOffset={8}
          >
            <div className="space-y-3">
              <HexColorPicker color={color} onChange={handleColorChange} />
              
              {/* Preset Colors */}
              <div className="grid grid-cols-5 gap-1.5">
                {presetColors.map((presetColor) => (
                  <button
                    key={presetColor}
                    onClick={() => handleColorChange(presetColor)}
                    className={cn(
                      'w-6 h-6 rounded-md border transition-all hover:scale-110',
                      color === presetColor 
                        ? 'border-primary ring-2 ring-primary/30' 
                        : 'border-border/50'
                    )}
                    style={{ backgroundColor: presetColor }}
                  />
                ))}
              </div>

              {/* Recent Colors */}
              {recentColors.length > 0 && (
                <>
                  <div className="text-xs text-muted-foreground">Recent</div>
                  <div className="flex gap-1.5">
                    {recentColors.map((recentColor, index) => (
                      <button
                        key={`${recentColor}-${index}`}
                        onClick={() => handleColorChange(recentColor)}
                        className={cn(
                          'w-6 h-6 rounded-md border transition-all hover:scale-110',
                          color === recentColor 
                            ? 'border-primary ring-2 ring-primary/30' 
                            : 'border-border/50'
                        )}
                        style={{ backgroundColor: recentColor }}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Size Preview Circle */}
        <div className="flex-1 flex items-center justify-center h-10">
          <div
            className="rounded-full transition-all duration-150"
            style={{
              width: Math.min(Math.max(4, size), 40),
              height: Math.min(Math.max(4, size), 40),
              backgroundColor: color,
              boxShadow: `0 0 ${Math.min(size, 20) / 2}px ${color}40`,
            }}
          />
        </div>

        {/* Size Value */}
        <div className="text-xs text-muted-foreground font-mono w-8 text-right">
          {displaySize}
        </div>
      </div>

      {/* Size Slider */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Size</span>
          <span className="font-mono">{displaySize}</span>
        </div>
        <input
          type="range"
          min="2"
          max="100"
          value={size}
          onChange={(e) => onSizeChange(Number(e.target.value))}
          className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer 
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

      {/* Opacity Slider */}
      <div className="space-y-1 mt-3">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Opacity</span>
          <span className="font-mono">{displayOpacity}%</span>
        </div>
        <input
          type="range"
          min="5"
          max="100"
          value={opacity * 100}
          onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
          className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer 
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

      {/* Quick Size Presets */}
      <div className="flex justify-between mt-3 gap-1">
        {[4, 12, 24, 48, 80].map((preset) => (
          <button
            key={preset}
            onClick={() => onSizeChange(preset)}
            className={cn(
              'flex-1 py-1 text-xs rounded transition-colors',
              size === preset 
                ? 'bg-primary/20 text-primary' 
                : 'text-muted-foreground hover:bg-muted'
            )}
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
};