import { WetMixSettings } from '@/types/drawing';
import { Droplets, Paintbrush, Hand } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WetMixControlsProps {
  wetMix: WetMixSettings;
  onWetMixChange: (wetMix: WetMixSettings) => void;
  isActive: boolean;
  compact?: boolean;
}

export const WetMixControls = ({ wetMix, onWetMixChange, isActive, compact = false }: WetMixControlsProps) => {
  if (!isActive) return null;

  const handleDilutionChange = (value: number) => {
    onWetMixChange({ ...wetMix, dilution: value });
  };

  const handleChargeChange = (value: number) => {
    onWetMixChange({ ...wetMix, charge: value });
  };

  const handlePullChange = (value: number) => {
    onWetMixChange({ ...wetMix, pull: value });
  };

  const sliderClasses = `w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer touch-manipulation
    [&::-webkit-slider-thumb]:appearance-none 
    [&::-webkit-slider-thumb]:w-4 
    [&::-webkit-slider-thumb]:h-4 
    [&::-webkit-slider-thumb]:bg-foreground 
    [&::-webkit-slider-thumb]:rounded-full 
    [&::-webkit-slider-thumb]:shadow-lg 
    [&::-webkit-slider-thumb]:cursor-pointer
    [&::-webkit-slider-thumb]:transition-transform
    [&::-webkit-slider-thumb]:active:scale-110
    [&::-moz-range-thumb]:w-4
    [&::-moz-range-thumb]:h-4
    [&::-moz-range-thumb]:bg-foreground
    [&::-moz-range-thumb]:rounded-full
    [&::-moz-range-thumb]:shadow-lg
    [&::-moz-range-thumb]:border-0`;

  if (compact) {
    return (
      <div className="space-y-3 border-t border-border/50 pt-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Droplets className="w-3 h-3" />
          <span>Wet Mixing</span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Dilution */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-muted-foreground">Pickup</span>
              <span className="font-mono text-muted-foreground">{Math.round(wetMix.dilution * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={wetMix.dilution * 100}
              onChange={(e) => handleDilutionChange(Number(e.target.value) / 100)}
              className={sliderClasses}
            />
          </div>

          {/* Charge */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-muted-foreground">Load</span>
              <span className="font-mono text-muted-foreground">{Math.round(wetMix.charge * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={wetMix.charge * 100}
              onChange={(e) => handleChargeChange(Number(e.target.value) / 100)}
              className={sliderClasses}
            />
          </div>

          {/* Pull */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-muted-foreground">Smudge</span>
              <span className="font-mono text-muted-foreground">{Math.round(wetMix.pull * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={wetMix.pull * 100}
              onChange={(e) => handlePullChange(Number(e.target.value) / 100)}
              className={sliderClasses}
            />
          </div>
        </div>

        {/* Compact Presets */}
        <div className="flex gap-2">
          <button
            onClick={() => onWetMixChange({ dilution: 0, charge: 1, pull: 0 })}
            className={cn(
              'flex-1 py-1.5 text-xs rounded-lg transition-colors touch-manipulation',
              wetMix.dilution === 0 && wetMix.pull === 0
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground bg-muted/50 active:bg-muted'
            )}
          >
            Dry
          </button>
          <button
            onClick={() => onWetMixChange({ dilution: 0.2, charge: 0.8, pull: 0.1 })}
            className="flex-1 py-1.5 text-xs rounded-lg text-muted-foreground bg-muted/50 active:bg-muted transition-colors touch-manipulation"
          >
            Normal
          </button>
          <button
            onClick={() => onWetMixChange({ dilution: 0.5, charge: 0.3, pull: 0.4 })}
            className="flex-1 py-1.5 text-xs rounded-lg text-muted-foreground bg-muted/50 active:bg-muted transition-colors touch-manipulation"
          >
            Wet
          </button>
          <button
            onClick={() => onWetMixChange({ dilution: 0.8, charge: 0.1, pull: 0.7 })}
            className="flex-1 py-1.5 text-xs rounded-lg text-muted-foreground bg-muted/50 active:bg-muted transition-colors touch-manipulation"
          >
            Blend
          </button>
        </div>
      </div>
    );
  }

  // Desktop layout (original)
  return (
    <div className="glass-panel p-3 animate-fade-in w-[180px]">
      <div className="text-xs text-muted-foreground mb-3 flex items-center gap-1.5">
        <Droplets className="w-3 h-3" />
        <span>Wet Mixing</span>
      </div>

      {/* Dilution / Color Pickup */}
      <div className="space-y-1.5 mb-3">
        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Droplets className="w-3 h-3" />
            <span>Color Pickup</span>
          </div>
          <span className="font-mono text-muted-foreground">{Math.round(wetMix.dilution * 100)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={wetMix.dilution * 100}
          onChange={(e) => handleDilutionChange(Number(e.target.value) / 100)}
          className={sliderClasses}
        />
      </div>

      {/* Charge / Paint Load */}
      <div className="space-y-1.5 mb-3">
        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Paintbrush className="w-3 h-3" />
            <span>Paint Load</span>
          </div>
          <span className="font-mono text-muted-foreground">{Math.round(wetMix.charge * 100)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={wetMix.charge * 100}
          onChange={(e) => handleChargeChange(Number(e.target.value) / 100)}
          className={sliderClasses}
        />
      </div>

      {/* Pull / Smudge */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Hand className="w-3 h-3" />
            <span>Smudge</span>
          </div>
          <span className="font-mono text-muted-foreground">{Math.round(wetMix.pull * 100)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={wetMix.pull * 100}
          onChange={(e) => handlePullChange(Number(e.target.value) / 100)}
          className={sliderClasses}
        />
      </div>

      {/* Quick presets */}
      <div className="flex justify-between mt-3 gap-1">
        <button
          onClick={() => onWetMixChange({ dilution: 0, charge: 1, pull: 0 })}
          className={cn(
            'flex-1 py-1 text-xs rounded transition-colors',
            wetMix.dilution === 0 && wetMix.pull === 0
              ? 'bg-primary/20 text-primary'
              : 'text-muted-foreground hover:bg-muted'
          )}
        >
          Dry
        </button>
        <button
          onClick={() => onWetMixChange({ dilution: 0.2, charge: 0.8, pull: 0.1 })}
          className={cn(
            'flex-1 py-1 text-xs rounded transition-colors text-muted-foreground hover:bg-muted'
          )}
        >
          Normal
        </button>
        <button
          onClick={() => onWetMixChange({ dilution: 0.5, charge: 0.3, pull: 0.4 })}
          className={cn(
            'flex-1 py-1 text-xs rounded transition-colors text-muted-foreground hover:bg-muted'
          )}
        >
          Wet
        </button>
        <button
          onClick={() => onWetMixChange({ dilution: 0.8, charge: 0.1, pull: 0.7 })}
          className={cn(
            'flex-1 py-1 text-xs rounded transition-colors text-muted-foreground hover:bg-muted'
          )}
        >
          Blend
        </button>
      </div>
    </div>
  );
};
