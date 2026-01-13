import { useState, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FileArchive, AlertCircle, CheckCircle } from 'lucide-react';
import { EverdrawFile } from '@/types/everdrawFile';
import { importEverdrawFile, regenerateLayerIds } from '@/utils/fileImport';
import { formatBytes } from '@/utils/fileExport';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (file: EverdrawFile) => void;
}

export const ImportDialog = ({
  open,
  onOpenChange,
  onImport,
}: ImportDialogProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<EverdrawFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleFile = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    setPreviewFile(null);
    
    const result = await importEverdrawFile(file);
    
    setIsLoading(false);
    
    if (result.success && result.file) {
      setPreviewFile(result.file);
    } else {
      setError(result.error || 'Unknown error');
    }
  }, []);
  
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);
  
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);
  
  const handleImport = useCallback(() => {
    if (!previewFile) return;
    
    // Regenerate layer IDs to avoid conflicts
    const fileWithNewIds: EverdrawFile = {
      ...previewFile,
      layers: regenerateLayerIds(previewFile.layers),
      activeLayerId: '', // Will be set to first layer
    };
    
    // Set active layer to first layer
    if (fileWithNewIds.layers.length > 0) {
      fileWithNewIds.activeLayerId = fileWithNewIds.layers[0].id;
    }
    
    onImport(fileWithNewIds);
    toast.success(`Imported "${previewFile.metadata.name}"`);
    onOpenChange(false);
    
    // Reset state
    setPreviewFile(null);
    setError(null);
  }, [previewFile, onImport, onOpenChange]);
  
  const handleClose = useCallback((open: boolean) => {
    if (!open) {
      setPreviewFile(null);
      setError(null);
    }
    onOpenChange(open);
  }, [onOpenChange]);
  
  const strokeCount = previewFile?.layers.reduce((acc, layer) => acc + layer.strokes.length, 0) ?? 0;
  
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import Canvas</DialogTitle>
          <DialogDescription>
            Load an Everdraw file to continue editing
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
              isDragging
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary/50 hover:bg-muted/50',
              isLoading && 'pointer-events-none opacity-50'
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".everdraw"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Upload className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              
              <div>
                <p className="text-sm font-medium">
                  {isLoading ? 'Loading...' : 'Drop file here or click to browse'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports .everdraw files
                </p>
              </div>
            </div>
          </div>
          
          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          
          {/* Preview */}
          {previewFile && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-green-500">
                <CheckCircle className="w-4 h-4" />
                <span>File loaded successfully</span>
              </div>
              
              <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                <div className="flex items-center gap-2 mb-3">
                  <FileArchive className="w-5 h-5 text-primary" />
                  <span className="font-medium">{previewFile.metadata.name}</span>
                </div>
                
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Layers</span>
                  <span>{previewFile.layers.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Strokes</span>
                  <span>{strokeCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Canvas</span>
                  <span>{previewFile.canvas.width} × {previewFile.canvas.height}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Created</span>
                  <span>{new Date(previewFile.metadata.created).toLocaleDateString()}</span>
                </div>
                {previewFile.customBrushes.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Custom Brushes</span>
                    <span>{previewFile.customBrushes.length}</span>
                  </div>
                )}
              </div>
              
              <p className="text-xs text-muted-foreground">
                This will replace your current canvas. Make sure to export first if you want to keep your work.
              </p>
              
              <Button onClick={handleImport} className="w-full gap-2">
                <Upload className="w-4 h-4" />
                Import and Replace
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
