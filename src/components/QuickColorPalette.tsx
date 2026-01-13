import { DraggableColorSwatch } from './DraggableColorSwatch';

interface QuickColorPaletteProps {
  currentColor: string;
  recentColors: string[];
  onColorSelect: (color: string) => void;
}

const quickColors = [
  '#ffffff', '#171717', '#ef4444', '#f97316', '#eab308', 
  '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899',
];

export const QuickColorPalette = ({ 
  currentColor, 
  recentColors, 
  onColorSelect 
}: QuickColorPaletteProps) => {
  const displayColors = recentColors.length > 0 
    ? [...new Set([...recentColors, ...quickColors])].slice(0, 9)
    : quickColors;

  return (
    <div className="glass-panel p-2 animate-fade-in">
      <div className="flex gap-1.5">
        {displayColors.map((color, index) => (
          <DraggableColorSwatch
            key={`${color}-${index}`}
            color={color}
            isActive={currentColor.toLowerCase() === color.toLowerCase()}
            onClick={() => onColorSelect(color)}
            size="md"
          />
        ))}
      </div>
    </div>
  );
};
