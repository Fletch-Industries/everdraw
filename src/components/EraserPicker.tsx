import { useState } from 'react';
import { Eraser, Pencil, Pen, Paintbrush, Feather, Droplets, Palette, Brush, Highlighter } from 'lucide-react';
import { BrushType } from '@/types/drawing';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface EraserPickerProps {
  isActive: boolean;
  eraserBrush: BrushType;
  onActivate: () => void;
  onBrushChange: (brush: BrushType) => void;
}

const brushes: { type: BrushType; icon: typeof Pencil; label: string }[] = [
  { type: 'pencil', icon: Pencil, label: 'Pencil' },
  { type: 'pen', icon: Pen, label: 'Pen' },
  { type: 'fountain_pen', icon: Feather, label: 'Fountain Pen' },
  { type: 'marker', icon: Highlighter, label: 'Marker' },
  { type: 'charcoal', icon: Brush, label: 'Charcoal' },
  { type: 'paintbrush', icon: Paintbrush, label: 'Brush' },
  { type: 'acrylic', icon: Palette, label: 'Acrylic' },
  { type: 'oil_paint', icon: Droplets, label: 'Oil Paint' },
  { type: 'watercolor', icon: Droplets, label: 'Watercolor' },
];

export const EraserPicker = ({ isActive, eraserBrush, onActivate, onBrushChange }: EraserPickerProps) => {
  const [open, setOpen] = useState(false);

  const handleSelect = (brush: BrushType) => {
    onBrushChange(brush);
    // Activate only if not already erasing — onActivate is a toggle, and
    // calling it unconditionally switched the eraser OFF when picking a
    // style mid-erase.
    if (!isActive) {
      onActivate();
    }
    setOpen(false);
  };

  const handleClick = () => {
    if (!isActive) {
      onActivate();
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleClick}
        className={cn(
          'tool-button',
          isActive && 'tool-button-active ring-2 ring-primary/50'
        )}
        title="Eraser"
      >
        <Eraser className="w-5 h-5" />
      </button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              'w-5 h-5 rounded flex items-center justify-center',
              'text-muted-foreground hover:text-foreground transition-colors',
              'hover:bg-accent/50'
            )}
            title="Eraser brush style"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </PopoverTrigger>
        <PopoverContent 
          side="right" 
          align="start"
          className="w-56 p-3 bg-popover border border-border shadow-xl z-50"
          sideOffset={12}
        >
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2 px-1">
              Eraser Brush Style
            </div>
            <div className="grid grid-cols-5 gap-1">
              {brushes.map(({ type, icon: Icon, label }) => (
                <button
                  key={type}
                  onClick={() => handleSelect(type)}
                  className={cn(
                    'p-2 rounded-lg transition-all duration-150 hover:bg-accent',
                    'flex items-center justify-center',
                    eraserBrush === type && 'bg-destructive/20 text-destructive hover:bg-destructive/30'
                  )}
                  title={label}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>

            {/* Current Eraser Brush Label */}
            <div className="pt-2 border-t border-border">
              <div className="text-sm text-foreground font-medium text-center">
                {brushes.find(b => b.type === eraserBrush)?.label} Eraser
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};