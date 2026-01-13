import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { BrushDynamics, PressureCurve, PRESSURE_CURVE_PRESETS } from '@/types/customBrush';
import { PressureCurveEditor } from './PressureCurveEditor';

interface DynamicsSettingsProps {
  dynamics: BrushDynamics;
  onChange: (dynamics: BrushDynamics) => void;
}

type DynamicAffect = 'size' | 'opacity' | 'flow' | 'angle';

export const DynamicsSettings = ({ dynamics, onChange }: DynamicsSettingsProps) => {
  const toggleAffect = (
    key: 'pressureAffects' | 'velocityAffects' | 'tiltAffects',
    value: DynamicAffect
  ) => {
    const current = dynamics[key] as DynamicAffect[];
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    onChange({ ...dynamics, [key]: updated });
  };

  const handlePressureCurveChange = (curve: PressureCurve) => {
    onChange({ ...dynamics, pressureCurve: curve });
  };

  // Ensure pressureCurve exists (for backwards compatibility)
  const pressureCurve = dynamics.pressureCurve || PRESSURE_CURVE_PRESETS.linear;

  return (
    <div className="space-y-6">
      {/* Pressure Curve Editor */}
      <PressureCurveEditor
        curve={pressureCurve}
        onChange={handlePressureCurveChange}
        label="Pressure Curve"
      />

      {/* Pressure */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <Label className="text-sm font-medium">Pressure Sensitivity</Label>
          <span className="text-xs text-muted-foreground">{Math.round(dynamics.pressureSensitivity * 100)}%</span>
        </div>
        <Slider
          value={[dynamics.pressureSensitivity]}
          onValueChange={([value]) => onChange({ ...dynamics, pressureSensitivity: value })}
          min={0}
          max={1}
          step={0.01}
        />
        <div className="flex gap-4 flex-wrap">
          {(['size', 'opacity', 'flow'] as const).map(affect => (
            <div key={affect} className="flex items-center gap-2">
              <Checkbox
                id={`pressure-${affect}`}
                checked={dynamics.pressureAffects.includes(affect)}
                onCheckedChange={() => toggleAffect('pressureAffects', affect)}
              />
              <Label htmlFor={`pressure-${affect}`} className="text-xs capitalize">{affect}</Label>
            </div>
          ))}
        </div>
      </div>

      {/* Velocity */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <Label className="text-sm font-medium">Velocity Sensitivity</Label>
          <span className="text-xs text-muted-foreground">{Math.round(dynamics.velocitySensitivity * 100)}%</span>
        </div>
        <Slider
          value={[dynamics.velocitySensitivity]}
          onValueChange={([value]) => onChange({ ...dynamics, velocitySensitivity: value })}
          min={0}
          max={1}
          step={0.01}
        />
        <div className="flex gap-4 flex-wrap">
          {(['size', 'opacity', 'flow'] as const).map(affect => (
            <div key={affect} className="flex items-center gap-2">
              <Checkbox
                id={`velocity-${affect}`}
                checked={dynamics.velocityAffects.includes(affect)}
                onCheckedChange={() => toggleAffect('velocityAffects', affect)}
              />
              <Label htmlFor={`velocity-${affect}`} className="text-xs capitalize">{affect}</Label>
            </div>
          ))}
        </div>
      </div>

      {/* Tilt */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <Label className="text-sm font-medium">Tilt Sensitivity</Label>
          <span className="text-xs text-muted-foreground">{Math.round(dynamics.tiltSensitivity * 100)}%</span>
        </div>
        <Slider
          value={[dynamics.tiltSensitivity]}
          onValueChange={([value]) => onChange({ ...dynamics, tiltSensitivity: value })}
          min={0}
          max={1}
          step={0.01}
        />
        <div className="flex gap-4 flex-wrap">
          {(['size', 'opacity', 'angle'] as const).map(affect => (
            <div key={affect} className="flex items-center gap-2">
              <Checkbox
                id={`tilt-${affect}`}
                checked={dynamics.tiltAffects.includes(affect)}
                onCheckedChange={() => toggleAffect('tiltAffects', affect)}
              />
              <Label htmlFor={`tilt-${affect}`} className="text-xs capitalize">{affect}</Label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
