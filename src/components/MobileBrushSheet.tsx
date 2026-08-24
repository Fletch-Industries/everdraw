import { useState, useRef, useEffect } from 'react';
import { Star, Paintbrush, Pen, Palette, Sparkles } from 'lucide-react';
import { BrushType } from '@/types/drawing';
import { CustomBrushPreset } from '@/types/customBrush';
import { cn } from '@/lib/utils';
import { useBrushLibrary } from '@/hooks/useBrushLibrary';
import { brushes, getIconForBrush } from './BrushPicker';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

interface MobileBrushSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeBrush: BrushType;
  onBrushChange: (brush: BrushType) => void;
  onCustomBrushSelect?: (preset: CustomBrushPreset) => void;
  currentColor: string;
  favoriteBrushes: string[];
  onToggleFavorite?: (brushId: string) => void;
}

type TabType = 'drawing' | 'painting' | 'custom' | 'favorites';

export const MobileBrushSheet = ({
  open,
  onOpenChange,
  activeBrush,
  onBrushChange,
  onCustomBrushSelect,
  currentColor,
  favoriteBrushes,
  onToggleFavorite,
}: MobileBrushSheetProps) => {
  const [activeTab, setActiveTab] = useState<TabType>('drawing');
  const { allBrushes } = useBrushLibrary();
  
  const drawingBrushes = brushes.filter(b => b.category === 'sketching' || b.category === 'inking');
  const paintingBrushes = brushes.filter(b => b.category === 'painting' || b.category === 'airbrushing');
  const customBrushes = allBrushes.filter(b => b.category === 'custom' || !b.isBuiltIn);
  
  // Get favorite brushes from the brush list
  const favoriteBrushList = brushes.filter(b => favoriteBrushes.includes(b.type));

  const handleSelect = (brush: BrushType) => {
    onBrushChange(brush);
    onOpenChange(false);
  };

  const handleCustomSelect = (preset: CustomBrushPreset) => {
    onCustomBrushSelect?.(preset);
    onOpenChange(false);
  };

  const handleToggleFavorite = (brushId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite?.(brushId);
  };

  const tabs: { id: TabType; label: string; icon: typeof Pen }[] = [
    { id: 'drawing', label: 'Drawing', icon: Pen },
    { id: 'painting', label: 'Painting', icon: Paintbrush },
    { id: 'custom', label: 'Custom', icon: Sparkles },
    { id: 'favorites', label: 'Favorites', icon: Star },
  ];

  const renderBrushCard = (
    type: BrushType, 
    label: string, 
    Icon: typeof Pen,
    isFavorite: boolean
  ) => (
    <button
      key={type}
      onClick={() => handleSelect(type)}
      className={cn(
        "relative flex flex-col items-center gap-2 p-4 rounded-2xl transition-all touch-manipulation",
        "border-2",
        activeBrush === type 
          ? "bg-primary/10 border-primary" 
          : "bg-muted/30 border-transparent hover:bg-muted/50"
      )}
    >
      {/* Favorite star */}
      <button
        onClick={(e) => handleToggleFavorite(type, e)}
        className={cn(
          "absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full transition-all",
          isFavorite 
            ? "text-yellow-500" 
            : "text-muted-foreground/30 hover:text-muted-foreground"
        )}
      >
        <Star className="w-4 h-4" fill={isFavorite ? "currentColor" : "none"} />
      </button>

      {/* Brush stroke preview */}
      <div 
        className="w-full h-12 rounded-lg overflow-hidden"
        style={{ backgroundColor: 'hsl(var(--muted)/0.5)' }}
      >
        <BrushStrokePreview 
          brushType={type} 
          color={currentColor} 
        />
      </div>

      {/* Brush icon */}
      <div className={cn(
        "w-10 h-10 rounded-xl flex items-center justify-center",
        activeBrush === type 
          ? "bg-primary text-primary-foreground" 
          : "bg-muted text-foreground"
      )}>
        <Icon className="w-5 h-5" />
      </div>

      {/* Brush name */}
      <span className={cn(
        "text-sm font-medium",
        activeBrush === type ? "text-primary" : "text-foreground"
      )}>
        {label}
      </span>
    </button>
  );

  const renderCustomBrushCard = (preset: CustomBrushPreset, isFavorite: boolean) => (
    <button
      key={preset.id}
      onClick={() => handleCustomSelect(preset)}
      className={cn(
        "relative flex flex-col items-center gap-2 p-4 rounded-2xl transition-all touch-manipulation",
        "border-2 bg-muted/30 border-transparent hover:bg-muted/50"
      )}
    >
      {/* Favorite star */}
      <button
        onClick={(e) => handleToggleFavorite(preset.id, e)}
        className={cn(
          "absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full transition-all",
          isFavorite 
            ? "text-yellow-500" 
            : "text-muted-foreground/30 hover:text-muted-foreground"
        )}
      >
        <Star className="w-4 h-4" fill={isFavorite ? "currentColor" : "none"} />
      </button>

      {/* Brush icon */}
      <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-muted text-foreground">
        <Palette className="w-5 h-5" />
      </div>

      {/* Brush name */}
      <span className="text-sm font-medium text-foreground truncate max-w-full">
        {preset.name}
      </span>
    </button>
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-center">Select Brush</DrawerTitle>
        </DrawerHeader>

        {/* Tab Bar */}
        <div className="flex gap-1 px-4 pb-3">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl transition-all touch-manipulation",
                activeTab === tab.id 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
            >
              <tab.icon className="w-4 h-4" />
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Brush Grid */}
        <div className="px-4 pb-6 overflow-y-auto max-h-[60vh]">
          {activeTab === 'drawing' && (
            <div className="grid grid-cols-3 gap-3">
              {drawingBrushes.map(({ type, icon: Icon, label }) => 
                renderBrushCard(type, label, Icon, favoriteBrushes.includes(type))
              )}
            </div>
          )}

          {activeTab === 'painting' && (
            <div className="grid grid-cols-3 gap-3">
              {paintingBrushes.map(({ type, icon: Icon, label }) => 
                renderBrushCard(type, label, Icon, favoriteBrushes.includes(type))
              )}
            </div>
          )}

          {activeTab === 'custom' && (
            <div className="grid grid-cols-3 gap-3">
              {customBrushes.length > 0 ? (
                customBrushes.map(preset => 
                  renderCustomBrushCard(preset, favoriteBrushes.includes(preset.id))
                )
              ) : (
                <div className="col-span-3 py-8 text-center text-muted-foreground">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No custom brushes yet</p>
                  <p className="text-xs mt-1">Create one in Brush Studio</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'favorites' && (
            <div className="grid grid-cols-3 gap-3">
              {favoriteBrushList.length > 0 ? (
                favoriteBrushList.map(({ type, icon: Icon, label }) => 
                  renderBrushCard(type, label, Icon, true)
                )
              ) : (
                <div className="col-span-3 py-8 text-center text-muted-foreground">
                  <Star className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No favorite brushes</p>
                  <p className="text-xs mt-1">Tap the star on any brush to add it</p>
                </div>
              )}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

// Simple brush stroke preview component
const BrushStrokePreview = ({ brushType, color }: { brushType: BrushType; color: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Draw a simple wavy stroke preview
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Different stroke styles based on brush type
    const getStrokeStyle = () => {
      switch (brushType) {
        case 'pencil':
          return { lineWidth: 2, opacity: 0.8 };
        case 'pen':
          return { lineWidth: 3, opacity: 1 };
        case 'fountain_pen':
          return { lineWidth: 4, opacity: 0.9 };
        case 'marker':
          return { lineWidth: 8, opacity: 0.7 };
        case 'charcoal':
          return { lineWidth: 6, opacity: 0.6 };
        case 'paintbrush':
          return { lineWidth: 6, opacity: 0.85 };
        case 'acrylic':
          return { lineWidth: 8, opacity: 0.95 };
        case 'oil_paint':
          return { lineWidth: 10, opacity: 0.9 };
        case 'watercolor':
          return { lineWidth: 12, opacity: 0.5 };
        default:
          return { lineWidth: 4, opacity: 0.8 };
      }
    };

    const style = getStrokeStyle();
    ctx.lineWidth = style.lineWidth;
    ctx.globalAlpha = style.opacity;

    // Draw wavy line
    ctx.beginPath();
    ctx.moveTo(10, height / 2);
    
    const points = 5;
    const amplitude = height * 0.25;
    const segmentWidth = (width - 20) / points;
    
    for (let i = 0; i <= points; i++) {
      const x = 10 + i * segmentWidth;
      const y = height / 2 + Math.sin(i * Math.PI) * amplitude * (i % 2 === 0 ? 1 : -1);
      ctx.lineTo(x, y);
    }
    
    ctx.stroke();
  }, [brushType, color]);

  return (
    <canvas 
      ref={canvasRef} 
      width={120} 
      height={48}
      className="w-full h-full"
    />
  );
};