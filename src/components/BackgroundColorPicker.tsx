import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HexColorPicker } from 'react-colorful';
import { cn } from '@/lib/utils';

interface BackgroundColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

const backgroundPresets = [
  '#0f0f0f', '#1a1a1a', '#262626', '#404040', '#525252',
  '#0f172a', '#1e1b4b', '#1e3a5f', '#0f2027', '#1a1a2e',
  '#1c1917', '#292524', '#3f3f46', '#27272a', '#18181b',
];

export const BackgroundColorPicker = ({ color, onChange }: BackgroundColorPickerProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className="glass-panel p-2 flex items-center gap-2 hover:bg-white/10 transition-colors"
          title="Background Color"
        >
          <div
            className="w-5 h-5 rounded border border-border"
            style={{ backgroundColor: color }}
          />
          <span className="text-xs text-muted-foreground">BG</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3 glass-panel border-border" align="start">
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground mb-2">Background Color</div>
          
          {/* Color wheel */}
          <HexColorPicker color={color} onChange={onChange} />
          
          {/* Preset backgrounds */}
          <div className="grid grid-cols-5 gap-1.5 mt-3">
            {backgroundPresets.map((presetColor) => (
              <button
                key={presetColor}
                onClick={() => onChange(presetColor)}
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
        </div>
      </PopoverContent>
    </Popover>
  );
};