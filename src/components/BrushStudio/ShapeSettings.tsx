import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { BrushShape } from '@/types/customBrush';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Circle, Minus, Brush, Sparkles } from 'lucide-react';

interface ShapeSettingsProps {
  shape: BrushShape;
  onChange: (shape: BrushShape) => void;
}

export const ShapeSettings = ({ shape, onChange }: ShapeSettingsProps) => {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Shape Type</Label>
        <ToggleGroup 
          type="single" 
          value={shape.baseType}
          onValueChange={(value) => value && onChange({ ...shape, baseType: value as BrushShape['baseType'] })}
          className="justify-start"
        >
          <ToggleGroupItem value="round" aria-label="Round" className="px-3">
            <Circle className="w-4 h-4 mr-1" />
            Round
          </ToggleGroupItem>
          <ToggleGroupItem value="flat" aria-label="Flat" className="px-3">
            <Minus className="w-4 h-4 mr-1" />
            Flat
          </ToggleGroupItem>
          <ToggleGroupItem value="bristle" aria-label="Bristle" className="px-3">
            <Brush className="w-4 h-4 mr-1" />
            Bristle
          </ToggleGroupItem>
          <ToggleGroupItem value="scatter" aria-label="Scatter" className="px-3">
            <Sparkles className="w-4 h-4 mr-1" />
            Scatter
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between">
          <Label className="text-xs text-muted-foreground">Aspect Ratio</Label>
          <span className="text-xs text-muted-foreground">{shape.aspectRatio.toFixed(1)}</span>
        </div>
        <Slider
          value={[shape.aspectRatio]}
          onValueChange={([value]) => onChange({ ...shape, aspectRatio: value })}
          min={0.2}
          max={5}
          step={0.1}
        />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between">
          <Label className="text-xs text-muted-foreground">Angle</Label>
          <span className="text-xs text-muted-foreground">{Math.round(shape.angle * 180 / Math.PI)}°</span>
        </div>
        <Slider
          value={[shape.angle]}
          onValueChange={([value]) => onChange({ ...shape, angle: value })}
          min={0}
          max={Math.PI}
          step={0.05}
        />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between">
          <Label className="text-xs text-muted-foreground">Roundness</Label>
          <span className="text-xs text-muted-foreground">{Math.round(shape.roundness * 100)}%</span>
        </div>
        <Slider
          value={[shape.roundness]}
          onValueChange={([value]) => onChange({ ...shape, roundness: value })}
          min={0}
          max={1}
          step={0.01}
        />
      </div>
    </div>
  );
};
