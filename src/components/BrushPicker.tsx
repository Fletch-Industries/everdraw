import { useState } from 'react';
import { Pencil, Pen, Paintbrush, Feather, Droplets, Palette, Brush, Highlighter, Settings2 } from 'lucide-react';
import { BrushType } from '@/types/drawing';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { BrushStudio } from '@/components/BrushStudio';
import { useBrushLibrary } from '@/hooks/useBrushLibrary';
import { CustomBrushPreset } from '@/types/customBrush';

interface BrushPickerProps {
  activeBrush: BrushType;
  onBrushChange: (brush: BrushType) => void;
  currentColor: string;
  onCustomBrushSelect?: (preset: CustomBrushPreset) => void;
}

const brushes: { type: BrushType; icon: typeof Pencil; label: string; category: 'drawing' | 'painting' }[] = [
  { type: 'pencil', icon: Pencil, label: 'Pencil', category: 'drawing' },
  { type: 'pen', icon: Pen, label: 'Ballpoint Pen', category: 'drawing' },
  { type: 'fountain_pen', icon: Feather, label: 'Fountain Pen', category: 'drawing' },
  { type: 'marker', icon: Highlighter, label: 'Marker', category: 'drawing' },
  { type: 'charcoal', icon: Brush, label: 'Charcoal', category: 'drawing' },
  { type: 'paintbrush', icon: Paintbrush, label: 'Brush', category: 'painting' },
  { type: 'acrylic', icon: Palette, label: 'Acrylic', category: 'painting' },
  { type: 'oil_paint', icon: Droplets, label: 'Oil Paint', category: 'painting' },
  { type: 'watercolor', icon: Droplets, label: 'Watercolor', category: 'painting' },
];

const getIconForBrush = (brushType: BrushType) => {
  const brush = brushes.find(b => b.type === brushType);
  return brush?.icon || Paintbrush;
};

export const BrushPicker = ({ activeBrush, onBrushChange, currentColor, onCustomBrushSelect }: BrushPickerProps) => {
  const [open, setOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const { allBrushes } = useBrushLibrary();
  const ActiveIcon = getIconForBrush(activeBrush);

  const drawingBrushes = brushes.filter(b => b.category === 'drawing');
  const paintingBrushes = brushes.filter(b => b.category === 'painting');
  const customBrushes = allBrushes.filter(b => b.category === 'custom' || !b.isBuiltIn);

  const handleSelect = (brush: BrushType) => {
    onBrushChange(brush);
    setOpen(false);
  };

  const handleCustomBrushSelect = (preset: CustomBrushPreset) => {
    onCustomBrushSelect?.(preset);
    setOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              'tool-button tool-button-active relative',
              'ring-2 ring-primary/50'
            )}
            title={brushes.find(b => b.type === activeBrush)?.label}
          >
            <ActiveIcon className="w-5 h-5" />
          </button>
        </PopoverTrigger>
        <PopoverContent 
          side="right" 
          align="start"
          className="w-64 p-3 bg-popover border border-border shadow-xl z-50"
          sideOffset={12}
        >
          <div className="space-y-3">
            {/* Drawing Tools */}
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2 px-1">
                Drawing
              </div>
              <div className="grid grid-cols-5 gap-1">
                {drawingBrushes.map(({ type, icon: Icon, label }) => (
                  <button
                    key={type}
                    onClick={() => handleSelect(type)}
                    className={cn(
                      'p-2 rounded-lg transition-all duration-150 hover:bg-accent',
                      'flex items-center justify-center',
                      activeBrush === type && 'bg-primary text-primary-foreground hover:bg-primary'
                    )}
                    title={label}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>

            {/* Painting Tools */}
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2 px-1">
                Painting
              </div>
              <div className="grid grid-cols-5 gap-1">
                {paintingBrushes.map(({ type, icon: Icon, label }) => (
                  <button
                    key={type}
                    onClick={() => handleSelect(type)}
                    className={cn(
                      'p-2 rounded-lg transition-all duration-150 hover:bg-accent',
                      'flex items-center justify-center',
                      activeBrush === type && 'bg-primary text-primary-foreground hover:bg-primary'
                    )}
                    title={label}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Brushes */}
            {customBrushes.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2 px-1">
                  Custom
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {customBrushes.slice(0, 10).map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => handleCustomBrushSelect(preset)}
                      className={cn(
                        'p-2 rounded-lg transition-all duration-150 hover:bg-accent',
                        'flex items-center justify-center'
                      )}
                      title={preset.name}
                    >
                      <Brush className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Current Brush Label */}
            <div className="pt-2 border-t border-border">
              <div className="text-sm text-foreground font-medium text-center">
                {brushes.find(b => b.type === activeBrush)?.label}
              </div>
            </div>

            {/* Brush Studio Button */}
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full"
              onClick={() => {
                setOpen(false);
                setStudioOpen(true);
              }}
            >
              <Settings2 className="w-4 h-4 mr-2" />
              Open Brush Studio
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <BrushStudio
        open={studioOpen}
        onOpenChange={setStudioOpen}
        currentColor={currentColor}
        onSelectBrush={onCustomBrushSelect}
      />
    </>
  );
};

export { brushes, getIconForBrush };