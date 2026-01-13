import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { BrushColor } from '@/types/customBrush';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

interface ColorSettingsProps {
  colorSettings: BrushColor;
  onChange: (color: BrushColor) => void;
}

export const ColorSettings = ({ colorSettings, onChange }: ColorSettingsProps) => {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex justify-between">
          <Label className="text-xs text-muted-foreground">Base Opacity</Label>
          <span className="text-xs text-muted-foreground">{Math.round(colorSettings.baseOpacity * 100)}%</span>
        </div>
        <Slider
          value={[colorSettings.baseOpacity]}
          onValueChange={([value]) => onChange({ ...colorSettings, baseOpacity: value })}
          min={0}
          max={1}
          step={0.01}
        />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between">
          <Label className="text-xs text-muted-foreground">Flow Rate</Label>
          <span className="text-xs text-muted-foreground">{Math.round(colorSettings.flowRate * 100)}%</span>
        </div>
        <Slider
          value={[colorSettings.flowRate]}
          onValueChange={([value]) => onChange({ ...colorSettings, flowRate: value })}
          min={0}
          max={1}
          step={0.01}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Blend Mode</Label>
        <ToggleGroup 
          type="single" 
          value={colorSettings.blendMode}
          onValueChange={(value) => value && onChange({ ...colorSettings, blendMode: value as BrushColor['blendMode'] })}
          className="justify-start flex-wrap"
        >
          <ToggleGroupItem value="normal" className="text-xs px-2">Normal</ToggleGroupItem>
          <ToggleGroupItem value="multiply" className="text-xs px-2">Multiply</ToggleGroupItem>
          <ToggleGroupItem value="screen" className="text-xs px-2">Screen</ToggleGroupItem>
          <ToggleGroupItem value="overlay" className="text-xs px-2">Overlay</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between">
          <Label className="text-xs text-muted-foreground">Color Variation</Label>
          <span className="text-xs text-muted-foreground">{Math.round(colorSettings.colorVariation * 100)}%</span>
        </div>
        <Slider
          value={[colorSettings.colorVariation]}
          onValueChange={([value]) => onChange({ ...colorSettings, colorVariation: value })}
          min={0}
          max={1}
          step={0.01}
        />
      </div>
    </div>
  );
};
