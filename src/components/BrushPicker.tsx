import { useState } from 'react';
import { Pencil, PencilLine, Pen, PenTool, Paintbrush, Feather, Droplets, Palette, Brush, Highlighter, Settings2, SprayCan, Sparkles, Edit3, Type } from 'lucide-react';
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

export type BrushCategory = 'sketching' | 'inking' | 'painting' | 'airbrushing';

const brushes: { type: BrushType; icon: typeof Pencil; label: string; category: BrushCategory }[] = [
  // Sketching
  { type: 'pencil', icon: Pencil, label: 'Pencil (HB)', category: 'sketching' },
  { type: 'pencil_6b', icon: PencilLine, label: 'Soft Pencil (6B)', category: 'sketching' },
  { type: 'charcoal', icon: Brush, label: 'Charcoal', category: 'sketching' },
  { type: 'chalk', icon: Edit3, label: 'Chalk', category: 'sketching' },
  { type: 'crayon', icon: Edit3, label: 'Crayon', category: 'sketching' },
  { type: 'soft_pastel', icon: Palette, label: 'Soft Pastel', category: 'sketching' },
  // Inking
  { type: 'pen', icon: Pen, label: 'Studio Pen', category: 'inking' },
  { type: 'technical_pen', icon: PenTool, label: 'Technical Pen', category: 'inking' },
  { type: 'gel_pen', icon: Pen, label: 'Gel Pen', category: 'inking' },
  { type: 'ink_brush', icon: Feather, label: 'Ink Brush', category: 'inking' },
  { type: 'fountain_pen', icon: Feather, label: 'Fountain Pen', category: 'inking' },
  { type: 'calligraphy', icon: Type, label: 'Calligraphy', category: 'inking' },
  // Painting
  { type: 'paintbrush', icon: Paintbrush, label: 'Round Brush', category: 'painting' },
  { type: 'acrylic', icon: Palette, label: 'Acrylic', category: 'painting' },
  { type: 'oil_paint', icon: Droplets, label: 'Oil Paint', category: 'painting' },
  { type: 'watercolor', icon: Droplets, label: 'Watercolor', category: 'painting' },
  // Airbrushing & FX
  { type: 'airbrush_soft', icon: SprayCan, label: 'Soft Airbrush', category: 'airbrushing' },
  { type: 'airbrush_hard', icon: SprayCan, label: 'Hard Airbrush', category: 'airbrushing' },
  { type: 'spray_paint', icon: SprayCan, label: 'Spray Paint', category: 'airbrushing' },
  { type: 'splatter', icon: Droplets, label: 'Splatter', category: 'airbrushing' },
  { type: 'marker', icon: Highlighter, label: 'Flat Marker', category: 'airbrushing' },
  { type: 'glow', icon: Sparkles, label: 'Glow', category: 'airbrushing' },
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

  const groups: { label: string; category: BrushCategory }[] = [
    { label: 'Sketching', category: 'sketching' },
    { label: 'Inking', category: 'inking' },
    { label: 'Painting', category: 'painting' },
    { label: 'Airbrushing & FX', category: 'airbrushing' },
  ];
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
            {groups.map(group => (
              <div key={group.category}>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2 px-1">
                  {group.label}
                </div>
                <div className="grid grid-cols-6 gap-1">
                  {brushes.filter(b => b.category === group.category).map(({ type, icon: Icon, label }) => (
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
            ))}

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