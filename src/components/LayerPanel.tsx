import { useState, useRef } from 'react';
import { Eye, EyeOff, Trash2, Plus, GripVertical, Merge } from 'lucide-react';
import { Layer } from '@/types/drawing';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';

interface LayerPanelProps {
  layers: Layer[];
  activeLayerId: string;
  onAddLayer: () => void;
  onDeleteLayer: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onSelectLayer: (id: string) => void;
  onSetOpacity: (id: string, opacity: number) => void;
  onMoveLayer: (id: string, direction: 'up' | 'down') => void;
  onReorderLayer: (id: string, newIndex: number) => void;
  onMergeLayers: (sourceId: string, targetId: string) => void;
}

export const LayerPanel = ({
  layers,
  activeLayerId,
  onAddLayer,
  onDeleteLayer,
  onToggleVisibility,
  onSelectLayer,
  onSetOpacity,
  onReorderLayer,
  onMergeLayers,
}: LayerPanelProps) => {
  // Display layers in reverse order (top layer first in UI)
  const reversedLayers = [...layers].reverse();
  
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const dragStartY = useRef<number>(0);

  const handleDragStart = (e: React.DragEvent, layerId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', layerId);
    setDraggedId(layerId);
    dragStartY.current = e.clientY;
  };

  const handleDragOver = (e: React.DragEvent, layerId: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== layerId) {
      // Check if holding near merge zone (center of layer)
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      const isMergeZone = Math.abs(e.clientY - centerY) < 10;
      
      if (isMergeZone && e.shiftKey) {
        setMergeTargetId(layerId);
        setDropTargetId(null);
      } else {
        setDropTargetId(layerId);
        setMergeTargetId(null);
      }
    }
  };

  const handleDragLeave = () => {
    setDropTargetId(null);
    setMergeTargetId(null);
  };

  const handleDrop = (e: React.DragEvent, targetLayerId: string) => {
    e.preventDefault();
    const sourceLayerId = e.dataTransfer.getData('text/plain');
    
    if (sourceLayerId && sourceLayerId !== targetLayerId) {
      if (mergeTargetId && e.shiftKey) {
        // Merge layers
        onMergeLayers(sourceLayerId, targetLayerId);
      } else {
        // Reorder layers
        // Convert from reversed UI index to actual array index
        const targetReversedIndex = reversedLayers.findIndex(l => l.id === targetLayerId);
        const actualTargetIndex = layers.length - 1 - targetReversedIndex;
        onReorderLayer(sourceLayerId, actualTargetIndex);
      }
    }
    
    setDraggedId(null);
    setDropTargetId(null);
    setMergeTargetId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDropTargetId(null);
    setMergeTargetId(null);
  };

  return (
    <div className="glass-panel p-2 w-[180px] animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs text-muted-foreground font-medium">Layers</span>
        <button
          onClick={onAddLayer}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          title="Add Layer"
        >
          <Plus className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Layer List */}
      <div className="space-y-1 max-h-[280px] overflow-y-auto">
        {reversedLayers.map((layer) => {
          const isDragging = draggedId === layer.id;
          const isDropTarget = dropTargetId === layer.id;
          const isMergeTarget = mergeTargetId === layer.id;
          
          return (
            <div
              key={layer.id}
              draggable
              onDragStart={(e) => handleDragStart(e, layer.id)}
              onDragOver={(e) => handleDragOver(e, layer.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, layer.id)}
              onDragEnd={handleDragEnd}
              className={cn(
                'rounded transition-all border',
                activeLayerId === layer.id
                  ? 'bg-primary/20 border-primary/30'
                  : 'hover:bg-white/5 border-transparent',
                isDragging && 'opacity-50 scale-95',
                isDropTarget && 'border-primary border-dashed bg-primary/10',
                isMergeTarget && 'border-amber-500 border-2 bg-amber-500/20'
              )}
            >
              {/* Layer Row */}
              <div
                onClick={() => onSelectLayer(layer.id)}
                className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer group"
              >
                {/* Drag Handle */}
                <div 
                  className="cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-white/10 transition-colors"
                  title="Drag to reorder (Shift+Drop to merge)"
                >
                  <GripVertical className="w-3 h-3 text-muted-foreground/50" />
                </div>

                {/* Visibility Toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisibility(layer.id);
                  }}
                  className="p-0.5 rounded hover:bg-white/10 transition-colors"
                  title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                >
                  {layer.visible ? (
                    <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-muted-foreground/50" />
                  )}
                </button>

                {/* Layer Name */}
                <span
                  className={cn(
                    'flex-1 text-xs truncate',
                    layer.visible ? 'text-foreground' : 'text-muted-foreground/50',
                    activeLayerId === layer.id && 'font-medium'
                  )}
                >
                  {layer.name}
                </span>

                {/* Merge Button - Show when there are 2+ layers */}
                {layers.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Find the layer below this one (next in array order)
                      const currentIndex = layers.findIndex(l => l.id === layer.id);
                      if (currentIndex > 0) {
                        const targetLayer = layers[currentIndex - 1];
                        onMergeLayers(layer.id, targetLayer.id);
                      }
                    }}
                    className={cn(
                      'p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-amber-500/20 transition-all',
                      layers.findIndex(l => l.id === layer.id) === 0 && 'hidden'
                    )}
                    title="Merge with layer below"
                  >
                    <Merge className="w-3 h-3 text-amber-500" />
                  </button>
                )}

                {/* Delete Button */}
                {layers.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteLayer(layer.id);
                    }}
                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/20 transition-all"
                    title="Delete Layer"
                  >
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </button>
                )}
              </div>

              {/* Opacity Slider - Only show for active layer */}
              {activeLayerId === layer.id && (
                <div 
                  className="px-2 pb-2 pt-1"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-8">
                      {Math.round(layer.opacity * 100)}%
                    </span>
                    <Slider
                      value={[layer.opacity * 100]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={([value]) => onSetOpacity(layer.id, value / 100)}
                      className="flex-1 cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer info */}
      <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
        <div className="text-[10px] text-muted-foreground/60 text-center">
          {layers.find(l => l.id === activeLayerId)?.strokes.length || 0} strokes
        </div>
        <div className="text-[9px] text-muted-foreground/40 text-center">
          Shift+Drop to merge layers
        </div>
      </div>
    </div>
  );
};
