import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { BrushTexture } from '@/types/customBrush';

interface TextureSettingsProps {
  texture: BrushTexture;
  onChange: (texture: BrushTexture) => void;
}

export const TextureSettings = ({ texture, onChange }: TextureSettingsProps) => {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex justify-between">
          <Label className="text-xs text-muted-foreground">Grain</Label>
          <span className="text-xs text-muted-foreground">{Math.round(texture.grain * 100)}%</span>
        </div>
        <Slider
          value={[texture.grain]}
          onValueChange={([value]) => onChange({ ...texture, grain: value })}
          min={0}
          max={1}
          step={0.01}
        />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between">
          <Label className="text-xs text-muted-foreground">Noise Scale</Label>
          <span className="text-xs text-muted-foreground">{texture.noiseScale.toFixed(1)}</span>
        </div>
        <Slider
          value={[texture.noiseScale]}
          onValueChange={([value]) => onChange({ ...texture, noiseScale: value })}
          min={0.1}
          max={10}
          step={0.1}
        />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between">
          <Label className="text-xs text-muted-foreground">Edge Bleed</Label>
          <span className="text-xs text-muted-foreground">{Math.round(texture.edgeBleed * 100)}%</span>
        </div>
        <Slider
          value={[texture.edgeBleed]}
          onValueChange={([value]) => onChange({ ...texture, edgeBleed: value })}
          min={0}
          max={1}
          step={0.01}
        />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between">
          <Label className="text-xs text-muted-foreground">Bristle Count</Label>
          <span className="text-xs text-muted-foreground">{texture.bristleCount}</span>
        </div>
        <Slider
          value={[texture.bristleCount]}
          onValueChange={([value]) => onChange({ ...texture, bristleCount: value })}
          min={0}
          max={50}
          step={1}
        />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between">
          <Label className="text-xs text-muted-foreground">Bristle Variation</Label>
          <span className="text-xs text-muted-foreground">{Math.round(texture.bristleVariation * 100)}%</span>
        </div>
        <Slider
          value={[texture.bristleVariation]}
          onValueChange={([value]) => onChange({ ...texture, bristleVariation: value })}
          min={0}
          max={1}
          step={0.01}
        />
      </div>
    </div>
  );
};
