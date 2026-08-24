import { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CanvasSize, CANVAS_PRESETS } from '@/types/canvasSize';
import { Maximize2, Lock, Unlock } from 'lucide-react';

interface CanvasSizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSize: CanvasSize;
  onSizeChange: (size: CanvasSize) => void;
}

export const CanvasSizeDialog = ({
  open,
  onOpenChange,
  currentSize,
  onSizeChange,
}: CanvasSizeDialogProps) => {
  const [width, setWidth] = useState(currentSize.width);
  const [height, setHeight] = useState(currentSize.height);
  const [dpi, setDpi] = useState(currentSize.dpi);
  const [aspectLocked, setAspectLocked] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(currentSize.width / currentSize.height);

  // Sync fields to the ACTUAL canvas size each time the dialog opens — the
  // component mounts once, so state initializers alone showed (and applied!)
  // the size from app-mount time, not the loaded project's size.
  useEffect(() => {
    if (open) {
      setWidth(currentSize.width);
      setHeight(currentSize.height);
      setDpi(currentSize.dpi);
      setAspectRatio(currentSize.width / currentSize.height);
    }
  }, [open, currentSize]);

  // Calculate physical size in inches
  const physicalSize = useMemo(() => ({
    width: (width / dpi).toFixed(2),
    height: (height / dpi).toFixed(2),
  }), [width, height, dpi]);

  // Estimate max layers (rough approximation like Procreate)
  const maxLayers = useMemo(() => {
    const pixels = width * height;
    // Approximate: 2GB memory / (pixels * 4 bytes per pixel * safety factor)
    const estimated = Math.floor(2000000000 / (pixels * 4 * 2));
    return Math.max(1, Math.min(estimated, 999));
  }, [width, height]);

  const handleWidthChange = (newWidth: number) => {
    setWidth(newWidth);
    if (aspectLocked && newWidth > 0) {
      setHeight(Math.round(newWidth / aspectRatio));
    }
  };

  const handleHeightChange = (newHeight: number) => {
    setHeight(newHeight);
    if (aspectLocked && newHeight > 0) {
      setWidth(Math.round(newHeight * aspectRatio));
    }
  };

  const handleLockToggle = () => {
    if (!aspectLocked) {
      setAspectRatio(width / height);
    }
    setAspectLocked(!aspectLocked);
  };

  const handlePresetSelect = (preset: typeof CANVAS_PRESETS[number]) => {
    setWidth(preset.width);
    setHeight(preset.height);
    setDpi(preset.dpi);
    setAspectRatio(preset.width / preset.height);
  };

  const handleApply = () => {
    // Clamp: an emptied field parses to 0 and would create a 0-px canvas.
    const clamp = (v: number, lo: number, hi: number) =>
      Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : lo;
    onSizeChange({
      width: clamp(width, 1, 16384),
      height: clamp(height, 1, 16384),
      dpi: clamp(dpi, 1, 1200),
    });
    onOpenChange(false);
  };

  const handleSwapDimensions = () => {
    const tempWidth = width;
    setWidth(height);
    setHeight(tempWidth);
    setAspectRatio(height / width);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Maximize2 className="w-5 h-5" />
            Canvas Size
          </DialogTitle>
          <DialogDescription>
            Set your canvas dimensions and resolution
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Presets */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Presets</Label>
            <div className="flex flex-wrap gap-1.5">
              {CANVAS_PRESETS.map((preset) => (
                <Button
                  key={preset.name}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 px-2"
                  onClick={() => handlePresetSelect(preset)}
                >
                  {preset.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Dimensions */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="width" className="text-xs">Width (px)</Label>
              <Input
                id="width"
                type="number"
                min={1}
                max={16384}
                value={width}
                onChange={(e) => handleWidthChange(Number(e.target.value))}
                className="h-9"
              />
            </div>

            <div className="flex flex-col items-center gap-1 pb-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleLockToggle}
                title={aspectLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
              >
                {aspectLocked ? (
                  <Lock className="w-3.5 h-3.5" />
                ) : (
                  <Unlock className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-xs"
                onClick={handleSwapDimensions}
                title="Swap width and height"
              >
                ⇄
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="height" className="text-xs">Height (px)</Label>
              <Input
                id="height"
                type="number"
                min={1}
                max={16384}
                value={height}
                onChange={(e) => handleHeightChange(Number(e.target.value))}
                className="h-9"
              />
            </div>
          </div>

          {/* DPI */}
          <div className="space-y-1.5">
            <Label htmlFor="dpi" className="text-xs">DPI (Resolution)</Label>
            <div className="flex gap-2">
              <Input
                id="dpi"
                type="number"
                min={1}
                max={1200}
                value={dpi}
                onChange={(e) => setDpi(Number(e.target.value))}
                className="h-9 w-24"
              />
              <div className="flex gap-1">
                {[72, 150, 300].map((d) => (
                  <Button
                    key={d}
                    variant={dpi === d ? 'secondary' : 'outline'}
                    size="sm"
                    className="h-9 px-2 text-xs"
                    onClick={() => setDpi(d)}
                  >
                    {d}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Physical Size</span>
              <span>{physicalSize.width}" × {physicalSize.height}"</span>
            </div>
            <div className="flex justify-between">
              <span>Megapixels</span>
              <span>{((width * height) / 1000000).toFixed(1)} MP</span>
            </div>
            <div className="flex justify-between">
              <span>Est. Max Layers</span>
              <span>{maxLayers}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
