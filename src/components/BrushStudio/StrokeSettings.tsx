import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BrushStroke } from '@/types/customBrush';

interface StrokeSettingsProps {
  stroke: BrushStroke;
  onChange: (stroke: BrushStroke) => void;
}

export const StrokeSettings = ({ stroke, onChange }: StrokeSettingsProps) => {
  const formatValue = (val: number) => val === 0 ? 'None' : `${Math.round(val * 100)}%`;

  return (
    <div className="space-y-4">
      {/* Stroke Path */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Stroke Path</Label>
        
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className="text-xs text-muted-foreground">Spacing</Label>
            <span className="text-xs text-muted-foreground">{stroke.spacing}%</span>
          </div>
          <Slider
            value={[stroke.spacing]}
            onValueChange={([value]) => onChange({ ...stroke, spacing: value })}
            min={1}
            max={200}
            step={1}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className="text-xs text-muted-foreground">Spacing Jitter</Label>
            <span className="text-xs text-muted-foreground">{formatValue(stroke.spacingJitter)}</span>
          </div>
          <Slider
            value={[stroke.spacingJitter]}
            onValueChange={([value]) => onChange({ ...stroke, spacingJitter: value })}
            min={0}
            max={1}
            step={0.01}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className="text-xs text-muted-foreground">Jitter Lateral</Label>
            <span className="text-xs text-muted-foreground">{formatValue(stroke.jitterLateral)}</span>
          </div>
          <Slider
            value={[stroke.jitterLateral]}
            onValueChange={([value]) => onChange({ ...stroke, jitterLateral: value })}
            min={0}
            max={1}
            step={0.01}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className="text-xs text-muted-foreground">Jitter Linear</Label>
            <span className="text-xs text-muted-foreground">{formatValue(stroke.jitterLinear)}</span>
          </div>
          <Slider
            value={[stroke.jitterLinear]}
            onValueChange={([value]) => onChange({ ...stroke, jitterLinear: value })}
            min={0}
            max={1}
            step={0.01}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className="text-xs text-muted-foreground">Fall Off</Label>
          </div>
          <Select
            value={stroke.fallOff}
            onValueChange={(value: 'none' | 'linear' | 'parabolic' | 'exponential') => 
              onChange({ ...stroke, fallOff: value })
            }
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="linear">Linear</SelectItem>
              <SelectItem value="parabolic">Parabolic</SelectItem>
              <SelectItem value="exponential">Exponential</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stabilization */}
      <div className="pt-2 border-t border-border space-y-3">
        <Label className="text-sm font-medium">Stabilization</Label>
        
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className="text-xs text-muted-foreground">Amount</Label>
            <span className="text-xs text-muted-foreground">{formatValue(stroke.stabilization)}</span>
          </div>
          <Slider
            value={[stroke.stabilization]}
            onValueChange={([value]) => onChange({ ...stroke, stabilization: value })}
            min={0}
            max={1}
            step={0.01}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className="text-xs text-muted-foreground">Streamline</Label>
            <span className="text-xs text-muted-foreground">{formatValue(stroke.streamline)}</span>
          </div>
          <Slider
            value={[stroke.streamline]}
            onValueChange={([value]) => onChange({ ...stroke, streamline: value })}
            min={0}
            max={1}
            step={0.01}
          />
        </div>
      </div>

      {/* Taper */}
      <div className="pt-2 border-t border-border space-y-3">
        <Label className="text-sm font-medium">Taper</Label>
        
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className="text-xs text-muted-foreground">Start Size</Label>
            <span className="text-xs text-muted-foreground">{formatValue(stroke.taper.startSize)}</span>
          </div>
          <Slider
            value={[stroke.taper.startSize]}
            onValueChange={([value]) => onChange({ 
              ...stroke, 
              taper: { ...stroke.taper, startSize: value } 
            })}
            min={0}
            max={1}
            step={0.01}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className="text-xs text-muted-foreground">End Size</Label>
            <span className="text-xs text-muted-foreground">{formatValue(stroke.taper.endSize)}</span>
          </div>
          <Slider
            value={[stroke.taper.endSize]}
            onValueChange={([value]) => onChange({ 
              ...stroke, 
              taper: { ...stroke.taper, endSize: value } 
            })}
            min={0}
            max={1}
            step={0.01}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className="text-xs text-muted-foreground">Tip Length</Label>
            <span className="text-xs text-muted-foreground">{stroke.taper.tipLength}%</span>
          </div>
          <Slider
            value={[stroke.taper.tipLength]}
            onValueChange={([value]) => onChange({ 
              ...stroke, 
              taper: { ...stroke.taper, tipLength: value } 
            })}
            min={1}
            max={50}
            step={1}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className="text-xs text-muted-foreground">Start Opacity</Label>
            <span className="text-xs text-muted-foreground">{formatValue(stroke.taper.startOpacity)}</span>
          </div>
          <Slider
            value={[stroke.taper.startOpacity]}
            onValueChange={([value]) => onChange({ 
              ...stroke, 
              taper: { ...stroke.taper, startOpacity: value } 
            })}
            min={0}
            max={1}
            step={0.01}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className="text-xs text-muted-foreground">End Opacity</Label>
            <span className="text-xs text-muted-foreground">{formatValue(stroke.taper.endOpacity)}</span>
          </div>
          <Slider
            value={[stroke.taper.endOpacity]}
            onValueChange={([value]) => onChange({ 
              ...stroke, 
              taper: { ...stroke.taper, endOpacity: value } 
            })}
            min={0}
            max={1}
            step={0.01}
          />
        </div>
      </div>

      {/* Stamp Jitter */}
      <div className="pt-2 border-t border-border space-y-3">
        <Label className="text-sm font-medium">Stamp Jitter</Label>
        
        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className="text-xs text-muted-foreground">Position</Label>
            <span className="text-xs text-muted-foreground">{formatValue(stroke.jitter.position)}</span>
          </div>
          <Slider
            value={[stroke.jitter.position]}
            onValueChange={([value]) => onChange({ 
              ...stroke, 
              jitter: { ...stroke.jitter, position: value } 
            })}
            min={0}
            max={1}
            step={0.01}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className="text-xs text-muted-foreground">Size</Label>
            <span className="text-xs text-muted-foreground">{formatValue(stroke.jitter.size)}</span>
          </div>
          <Slider
            value={[stroke.jitter.size]}
            onValueChange={([value]) => onChange({ 
              ...stroke, 
              jitter: { ...stroke.jitter, size: value } 
            })}
            min={0}
            max={1}
            step={0.01}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className="text-xs text-muted-foreground">Rotation</Label>
            <span className="text-xs text-muted-foreground">{formatValue(stroke.jitter.rotation)}</span>
          </div>
          <Slider
            value={[stroke.jitter.rotation]}
            onValueChange={([value]) => onChange({ 
              ...stroke, 
              jitter: { ...stroke.jitter, rotation: value } 
            })}
            min={0}
            max={1}
            step={0.01}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Label className="text-xs text-muted-foreground">Opacity</Label>
            <span className="text-xs text-muted-foreground">{formatValue(stroke.jitter.opacity)}</span>
          </div>
          <Slider
            value={[stroke.jitter.opacity]}
            onValueChange={([value]) => onChange({ 
              ...stroke, 
              jitter: { ...stroke.jitter, opacity: value } 
            })}
            min={0}
            max={1}
            step={0.01}
          />
        </div>
      </div>
    </div>
  );
};
