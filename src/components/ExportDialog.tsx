import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, FileArchive, Image as ImageIcon, Signature, Globe } from 'lucide-react';
import { Layer, WetMixSettings, ReferenceImage } from '@/types/drawing';
import { CanvasSize } from '@/types/canvasSize';
import { ImageExportFormat } from '@/types/everdrawFile';
import { exportEverdrawFile, exportAsImage, estimateEverdrawFileSize, formatBytes } from '@/utils/fileExport';
import { saveSignedProof } from '@/utils/projectStorage';
import { SignArtworkDialog } from '@/components/SignArtworkDialog';
import { PublishToGalleryDialog } from '@/components/PublishToGalleryDialog';
import { toast } from 'sonner';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layers: Layer[];
  canvasSize: CanvasSize;
  backgroundColor: string;
  activeLayerId: string;
  wetMix: WetMixSettings;
  referenceImages: ReferenceImage[];
  sourceCanvas: HTMLCanvasElement | null;
  projectId?: string;
  onExportComplete?: () => void;
}

export const ExportDialog = ({
  open,
  onOpenChange,
  layers,
  canvasSize,
  backgroundColor,
  activeLayerId,
  wetMix,
  referenceImages,
  sourceCanvas,
  projectId,
  onExportComplete,
}: ExportDialogProps) => {
  const [fileName, setFileName] = useState('My Artwork');
  const [imageFormat, setImageFormat] = useState<ImageExportFormat>('png');
  const [includeBackground, setIncludeBackground] = useState(true);
  const [quality, setQuality] = useState(0.9);
  const [scale, setScale] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [exportedFileName, setExportedFileName] = useState<string>('');
  
  // Calculate estimated file size for everdraw
  const everdrawSize = estimateEverdrawFileSize(layers, canvasSize, backgroundColor, activeLayerId, wetMix, referenceImages);
  
  // Calculate stroke count
  const strokeCount = layers.reduce((acc, layer) => acc + layer.strokes.length, 0);
  
  const handleExportEverdraw = () => {
    try {
      exportEverdrawFile(layers, canvasSize, backgroundColor, activeLayerId, wetMix, referenceImages, fileName);
      toast.success('Everdraw file exported successfully');
      // Clear any previous export for signing (everdraw files not signable yet)
      setExportedBlob(null);
      setExportedFileName('');
      onOpenChange(false);
      onExportComplete?.();
    } catch (error) {
      toast.error('Failed to export file');
      console.error(error);
    }
  };
  
  const handleExportImage = async () => {
    if (!sourceCanvas) {
      toast.error('Canvas not available');
      return;
    }
    
    setIsExporting(true);
    try {
      const result = await exportAsImage(
        sourceCanvas,
        { format: imageFormat, includeBackground, quality, scale },
        canvasSize,
        backgroundColor,
        fileName
      );
      
      // Store the exported blob for optional signing
      setExportedBlob(result.blob);
      setExportedFileName(result.filename);
      
      toast.success('Image exported! You can now sign it for blockchain proof.');
    } catch (error) {
      toast.error('Failed to export image');
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  };
  
  const handleSignExported = () => {
    if (exportedBlob) {
      setShowSignDialog(true);
    }
  };
  
  const handleSignComplete = async (txid: string, contentHash: string) => {
    if (projectId) {
      try {
        await saveSignedProof(projectId, {
          txid,
          contentHash,
          signedAt: Date.now(),
        });
      } catch (error) {
        console.error('Failed to save signed proof:', error);
      }
    }
  };
  
  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      // Reset export state when closing
      setExportedBlob(null);
      setExportedFileName('');
    }
    onOpenChange(isOpen);
  };
  
  const outputWidth = Math.floor(canvasSize.width * scale);
  const outputHeight = Math.floor(canvasSize.height * scale);
  
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Canvas</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* File Name */}
          <div className="space-y-2">
            <Label htmlFor="fileName">File Name</Label>
            <Input
              id="fileName"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="Enter file name"
            />
          </div>
          
          <Tabs defaultValue="everdraw" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="everdraw" className="gap-2">
                <FileArchive className="w-4 h-4" />
                Everdraw
              </TabsTrigger>
              <TabsTrigger value="image" className="gap-2">
                <ImageIcon className="w-4 h-4" />
                Image
              </TabsTrigger>
            </TabsList>
            
            {/* Everdraw Export */}
            <TabsContent value="everdraw" className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Layers</span>
                  <span>{layers.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Strokes</span>
                  <span>{strokeCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Canvas</span>
                  <span>{canvasSize.width} × {canvasSize.height}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Est. Size</span>
                  <span>~{formatBytes(everdrawSize)}</span>
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground">
                Everdraw format preserves all layers, strokes, and settings for full editability.
              </p>
              
              <Button onClick={handleExportEverdraw} className="w-full gap-2">
                <Download className="w-4 h-4" />
                Export .everdraw
              </Button>
            </TabsContent>
            
            {/* Image Export */}
            <TabsContent value="image" className="space-y-4">
              {/* Format Selection */}
              <div className="space-y-2">
                <Label>Format</Label>
                <div className="flex gap-2">
                  {(['png', 'jpg', 'webp'] as ImageExportFormat[]).map((format) => (
                    <Button
                      key={format}
                      variant={imageFormat === format ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setImageFormat(format)}
                      className="flex-1 uppercase"
                    >
                      {format}
                    </Button>
                  ))}
                </div>
              </div>
              
              {/* Include Background */}
              <div className="flex items-center justify-between">
                <Label htmlFor="includeBackground">Include Background</Label>
                <Switch
                  id="includeBackground"
                  checked={includeBackground}
                  onCheckedChange={setIncludeBackground}
                />
              </div>
              
              {/* Quality (for lossy formats) */}
              {imageFormat !== 'png' && (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Quality</Label>
                    <span className="text-sm text-muted-foreground">{Math.round(quality * 100)}%</span>
                  </div>
                  <Slider
                    value={[quality]}
                    onValueChange={([v]) => setQuality(v)}
                    min={0.1}
                    max={1}
                    step={0.05}
                  />
                </div>
              )}
              
              {/* Scale */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Scale</Label>
                  <span className="text-sm text-muted-foreground">{scale}x</span>
                </div>
                <Slider
                  value={[scale]}
                  onValueChange={([v]) => setScale(v)}
                  min={0.5}
                  max={4}
                  step={0.5}
                />
                <p className="text-xs text-muted-foreground">
                  Output: {outputWidth} × {outputHeight} px
                </p>
              </div>
              
              <Button 
                onClick={handleExportImage} 
                className="w-full gap-2"
                disabled={isExporting || !sourceCanvas}
              >
                <Download className="w-4 h-4" />
                {isExporting ? 'Exporting...' : `Export ${imageFormat.toUpperCase()}`}
              </Button>
              
              {/* Sign & Publish options appear after export */}
              {exportedBlob && (
                <div className="border-t pt-4 mt-2 space-y-3">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-sm font-medium">{exportedFileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {(exportedBlob.size / 1024).toFixed(1)} KB • Ready for blockchain
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="outline" 
                      onClick={handleSignExported} 
                      className="gap-2"
                    >
                      <Signature className="w-4 h-4" />
                      Sign Proof
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setShowPublishDialog(true)} 
                      className="gap-2"
                    >
                      <Globe className="w-4 h-4" />
                      Publish
                    </Button>
                  </div>
                  
                  <p className="text-xs text-muted-foreground text-center">
                    Sign for proof of authorship or publish to decentralized gallery
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
        
        {/* Sign Dialog */}
        <SignArtworkDialog
          open={showSignDialog}
          onOpenChange={setShowSignDialog}
          artworkBlob={exportedBlob}
          artworkName={exportedFileName}
          onSignComplete={handleSignComplete}
        />
        
        {/* Publish to Gallery Dialog */}
        <PublishToGalleryDialog
          open={showPublishDialog}
          onOpenChange={setShowPublishDialog}
          artworkBlob={exportedBlob}
          artworkName={exportedFileName}
        />
      </DialogContent>
    </Dialog>
  );
};
