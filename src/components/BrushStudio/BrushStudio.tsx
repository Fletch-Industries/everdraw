import { useState, useCallback } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  CustomBrushPreset, 
  createDefaultPreset,
} from '@/types/customBrush';
import { BrushPreview } from './BrushPreview';
import { TestCanvas } from './TestCanvas';
import { ShapeSettings } from './ShapeSettings';
import { DynamicsSettings } from './DynamicsSettings';
import { StrokeSettings } from './StrokeSettings';
import { TextureSettings } from './TextureSettings';
import { ColorSettings } from './ColorSettings';
import { useBrushLibrary } from '@/hooks/useBrushLibrary';
import { toast } from 'sonner';
import { Trash2, Copy, Download, Upload, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BrushStudioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPreset?: CustomBrushPreset | null;
  currentColor: string;
  onSelectBrush?: (preset: CustomBrushPreset) => void;
}

export const BrushStudio = ({ 
  open, 
  onOpenChange, 
  initialPreset,
  currentColor,
  onSelectBrush,
}: BrushStudioProps) => {
  const { 
    allBrushes, 
    saveBrush, 
    deleteBrush, 
    duplicateBrush,
    exportBrush,
    importBrush,
  } = useBrushLibrary();

  const [preset, setPreset] = useState<CustomBrushPreset>(() => 
    initialPreset || createDefaultPreset()
  );
  const [selectedLibraryBrush, setSelectedLibraryBrush] = useState<string | null>(
    initialPreset?.id || null
  );

  const handleSave = useCallback(() => {
    saveBrush(preset);
    toast.success(`Brush "${preset.name}" saved!`);
  }, [preset, saveBrush]);

  const handleDelete = useCallback(() => {
    if (preset.isBuiltIn) {
      toast.error("Cannot delete built-in brushes");
      return;
    }
    deleteBrush(preset.id);
    setPreset(createDefaultPreset());
    setSelectedLibraryBrush(null);
    toast.success("Brush deleted");
  }, [preset, deleteBrush]);

  const handleDuplicate = useCallback(() => {
    const duplicated = duplicateBrush(preset);
    setPreset(duplicated);
    setSelectedLibraryBrush(duplicated.id);
    toast.success(`Duplicated as "${duplicated.name}"`);
  }, [preset, duplicateBrush]);

  const handleExport = useCallback(() => {
    const json = exportBrush(preset);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${preset.name.replace(/\s+/g, '-').toLowerCase()}.brush.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Brush exported");
  }, [preset, exportBrush]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const json = e.target?.result as string;
        const imported = importBrush(json);
        if (imported) {
          setPreset(imported);
          setSelectedLibraryBrush(imported.id);
          toast.success(`Imported "${imported.name}"`);
        } else {
          toast.error("Failed to import brush");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [importBrush]);

  const handleReset = useCallback(() => {
    setPreset(createDefaultPreset());
    setSelectedLibraryBrush(null);
  }, []);

  const handleLibrarySelect = useCallback((brush: CustomBrushPreset) => {
    setPreset({ ...brush });
    setSelectedLibraryBrush(brush.id);
  }, []);

  const handleUseThisBrush = useCallback(() => {
    onSelectBrush?.(preset);
    onOpenChange(false);
  }, [preset, onSelectBrush, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-lg font-semibold">Brush Studio</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Library Sidebar */}
          <div className="w-48 border-r border-border bg-muted/30 flex flex-col">
            <div className="p-3 border-b border-border">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Library</Label>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {allBrushes.map(brush => (
                  <button
                    key={brush.id}
                    onClick={() => handleLibrarySelect(brush)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                      "hover:bg-accent",
                      selectedLibraryBrush === brush.id && "bg-primary text-primary-foreground hover:bg-primary"
                    )}
                  >
                    <div className="font-medium truncate">{brush.name}</div>
                    <div className="text-xs opacity-70 capitalize">{brush.category}</div>
                  </button>
                ))}
              </div>
            </ScrollArea>
            <div className="p-2 border-t border-border space-y-1">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start"
                onClick={handleReset}
              >
                <RotateCcw className="w-3 h-3 mr-2" />
                New Brush
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start"
                onClick={handleImport}
              >
                <Upload className="w-3 h-3 mr-2" />
                Import
              </Button>
            </div>
          </div>

          {/* Main Editor */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Preview & Name */}
            <div className="p-4 border-b border-border space-y-3">
              <div className="flex gap-4 items-start">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="brush-name" className="text-xs text-muted-foreground">Name</Label>
                  <Input
                    id="brush-name"
                    value={preset.name}
                    onChange={(e) => setPreset(prev => ({ ...prev, name: e.target.value }))}
                    className="h-9"
                    placeholder="Brush name"
                  />
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={handleDuplicate} title="Duplicate">
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={handleExport} title="Export">
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={handleDelete} 
                    title="Delete"
                    disabled={preset.isBuiltIn}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <BrushPreview preset={preset} color={currentColor} size={20} width={300} height={60} />
              <TestCanvas preset={preset} size={20} />
            </div>

            {/* Settings Tabs */}
            <Tabs defaultValue="shape" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="mx-4 mt-2 justify-start">
                <TabsTrigger value="shape">Shape</TabsTrigger>
                <TabsTrigger value="dynamics">Dynamics</TabsTrigger>
                <TabsTrigger value="stroke">Stroke</TabsTrigger>
                <TabsTrigger value="texture">Texture</TabsTrigger>
                <TabsTrigger value="color">Color</TabsTrigger>
              </TabsList>
              
              <ScrollArea className="flex-1 px-4 py-3">
                <TabsContent value="shape" className="mt-0">
                  <ShapeSettings 
                    shape={preset.shape} 
                    onChange={(shape) => setPreset(prev => ({ ...prev, shape }))} 
                  />
                </TabsContent>
                <TabsContent value="dynamics" className="mt-0">
                  <DynamicsSettings 
                    dynamics={preset.dynamics} 
                    onChange={(dynamics) => setPreset(prev => ({ ...prev, dynamics }))} 
                  />
                </TabsContent>
                <TabsContent value="stroke" className="mt-0">
                  <StrokeSettings 
                    stroke={preset.stroke} 
                    onChange={(stroke) => setPreset(prev => ({ ...prev, stroke }))} 
                  />
                </TabsContent>
                <TabsContent value="texture" className="mt-0">
                  <TextureSettings 
                    texture={preset.texture} 
                    onChange={(texture) => setPreset(prev => ({ ...prev, texture }))} 
                  />
                </TabsContent>
                <TabsContent value="color" className="mt-0">
                  <ColorSettings 
                    colorSettings={preset.color} 
                    onChange={(color) => setPreset(prev => ({ ...prev, color }))} 
                  />
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={handleSave}>
            Save Brush
          </Button>
          <Button onClick={handleUseThisBrush}>
            Use This Brush
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
