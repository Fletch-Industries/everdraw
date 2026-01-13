import { useState, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { ImagePlus, Upload } from 'lucide-react';
import { ReferenceImage } from '@/types/drawing';

interface ReferenceImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (referenceImage: ReferenceImage) => void;
  canvasWidth: number;
  canvasHeight: number;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

export const ReferenceImageDialog = ({
  open,
  onOpenChange,
  onImport,
  canvasWidth,
  canvasHeight,
}: ReferenceImageDialogProps) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(50);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      
      // Get image dimensions
      const img = new Image();
      img.onload = () => {
        setImageSize({ width: img.width, height: img.height });
      };
      img.src = dataUrl;
      
      setPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleImport = useCallback(() => {
    if (!preview || !imageSize) return;

    // Calculate scale to fit in canvas
    const scaleX = canvasWidth / imageSize.width;
    const scaleY = canvasHeight / imageSize.height;
    const fitScale = Math.min(scaleX, scaleY, 1) * 0.8;

    const referenceImage: ReferenceImage = {
      id: generateId(),
      name: 'Reference',
      imageData: preview,
      opacity: opacity / 100,
      visible: true,
      locked: false,
      transform: {
        x: (canvasWidth - imageSize.width * fitScale) / 2,
        y: (canvasHeight - imageSize.height * fitScale) / 2,
        scale: fitScale,
        rotation: 0,
      },
      originalWidth: imageSize.width,
      originalHeight: imageSize.height,
    };

    onImport(referenceImage);
    handleClose();
  }, [preview, imageSize, opacity, canvasWidth, canvasHeight, onImport]);

  const handleClose = useCallback(() => {
    setPreview(null);
    setImageSize(null);
    setOpacity(50);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onOpenChange(false);
  }, [onOpenChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const img = new Image();
        img.onload = () => {
          setImageSize({ width: img.width, height: img.height });
        };
        img.src = dataUrl;
        setPreview(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImagePlus className="w-5 h-5" />
            Import Reference Image
          </DialogTitle>
          <DialogDescription>
            Import an image to use as a reference while drawing. The image will appear below your drawing layers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Input / Preview */}
          {!preview ? (
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Click to select or drag & drop an image
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                PNG, JPG, WebP supported
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Preview */}
              <div className="relative rounded-lg overflow-hidden bg-muted/30 aspect-video flex items-center justify-center">
                <img
                  src={preview}
                  alt="Preview"
                  className="max-w-full max-h-full object-contain"
                  style={{ opacity: opacity / 100 }}
                />
              </div>

              {/* Opacity Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Opacity</Label>
                  <span className="text-sm text-muted-foreground">{opacity}%</span>
                </div>
                <Slider
                  value={[opacity]}
                  min={10}
                  max={100}
                  step={5}
                  onValueChange={([value]) => setOpacity(value)}
                />
              </div>

              {/* Image Info */}
              {imageSize && (
                <p className="text-xs text-muted-foreground">
                  {imageSize.width} × {imageSize.height} pixels
                </p>
              )}

              {/* Change Image */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPreview(null);
                  setImageSize(null);
                }}
              >
                Choose Different Image
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!preview}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
