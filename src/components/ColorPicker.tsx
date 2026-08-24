import { useRef } from 'react';
import { HexColorPicker } from 'react-colorful';
import { DraggableColorSwatch } from './DraggableColorSwatch';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  recentColors?: string[];
  onColorUsed?: (color: string) => void;
}

const presetColors = [
  '#ffffff', '#e2e2e2', '#a3a3a3', '#525252', '#171717',
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#78716c',
];

export const ColorPicker = ({ color, onChange, recentColors = [], onColorUsed }: ColorPickerProps) => {
  // Latest picked color, tracked through a ref so the pointer-up commit sees
  // the final drag value even before the parent re-renders.
  const latestColorRef = useRef(color);

  // Deliberate selections (preset/recent swatches) commit immediately.
  const handleColorChange = (newColor: string) => {
    latestColorRef.current = newColor;
    onChange(newColor);
    onColorUsed?.(newColor);
  };

  return (
    <div className="glass-panel p-3 animate-fade-in">
      {/* Color Wheel — record to "recent" only on pointer-up, not per drag
          frame, so one drag doesn't flood all 10 recent-color slots. */}
      <div
        className="mb-3"
        onPointerUp={() => onColorUsed?.(latestColorRef.current)}
      >
        <HexColorPicker
          color={color}
          onChange={(c) => {
            latestColorRef.current = c;
            onChange(c);
          }}
        />
      </div>

      {/* Current Color Display - also draggable */}
      <div className="mb-3">
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/x-color', color);
            e.dataTransfer.effectAllowed = 'copy';
          }}
          className="w-full h-8 rounded-lg border border-border shadow-inner cursor-grab active:cursor-grabbing"
          style={{ backgroundColor: color }}
          title={`${color} - Drag to fill an area`}
        />
        <div className="text-xs text-muted-foreground text-center mt-1">{color.toUpperCase()}</div>
      </div>

      {/* Preset Colors */}
      <div className="grid grid-cols-5 gap-1.5 mb-3">
        {presetColors.map((presetColor) => (
          <DraggableColorSwatch
            key={presetColor}
            color={presetColor}
            isActive={color === presetColor}
            onClick={() => handleColorChange(presetColor)}
          />
        ))}
      </div>

      {/* Recent Colors */}
      {recentColors.length > 0 && (
        <>
          <div className="text-xs text-muted-foreground mb-1.5">Recent</div>
          <div className="flex gap-1.5">
            {recentColors.map((recentColor, index) => (
              <DraggableColorSwatch
                key={`${recentColor}-${index}`}
                color={recentColor}
                isActive={color === recentColor}
                onClick={() => handleColorChange(recentColor)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
