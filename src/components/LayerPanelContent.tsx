import { useState, useRef, useEffect } from 'react';
import { Eye, EyeOff, Trash2, Plus, GripVertical, Merge, ImageIcon, Lock, Unlock } from 'lucide-react';
import { Layer, ReferenceImage } from '@/types/drawing';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';

interface LayerPanelContentProps {
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
  onRenameLayer: (id: string, name: string) => void;
  // Reference images
  referenceImages?: ReferenceImage[];
  onToggleReferenceVisibility?: (id: string) => void;
  onSetReferenceOpacity?: (id: string, opacity: number) => void;
  onDeleteReference?: (id: string) => void;
  onToggleReferenceLock?: (id: string) => void;
  // Confirmation hooks
  onRequestDeleteLayer?: (id: string) => void;
}

export const LayerPanelContent = ({
  layers,
  activeLayerId,
  onAddLayer,
  onDeleteLayer,
  onToggleVisibility,
  onSelectLayer,
  onSetOpacity,
  onReorderLayer,
  onMergeLayers,
  onRenameLayer,
  referenceImages = [],
  onToggleReferenceVisibility,
  onSetReferenceOpacity,
  onDeleteReference,
  onToggleReferenceLock,
  onRequestDeleteLayer,
}: LayerPanelContentProps) => {
  const reversedLayers = [...layers].reverse();
  
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const dragStartY = useRef<number>(0);

  // Focus input when editing starts
  useEffect(() => {
    if (editingLayerId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingLayerId]);

  const handleDragStart = (e: React.DragEvent, layerId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', layerId);
    setDraggedId(layerId);
    dragStartY.current = e.clientY;
  };

  const handleDragOver = (e: React.DragEvent, layerId: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== layerId) {
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
        onMergeLayers(sourceLayerId, targetLayerId);
      } else {
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

  const handleDoubleClick = (layerId: string, currentName: string) => {
    setEditingLayerId(layerId);
    setEditingName(currentName);
  };

  const handleRenameSubmit = () => {
    if (editingLayerId && editingName.trim()) {
      onRenameLayer(editingLayerId, editingName.trim().slice(0, 20));
    }
    setEditingLayerId(null);
    setEditingName('');
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setEditingLayerId(null);
      setEditingName('');
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, layerId: string) => {
    e.stopPropagation();
    if (onRequestDeleteLayer) {
      onRequestDeleteLayer(layerId);
    } else {
      onDeleteLayer(layerId);
    }
  };

  return (
    <div className="glass-panel p-2 w-[200px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs text-muted-foreground font-medium">Layers</span>
        <button
          onClick={onAddLayer}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          title="Add Layer"
        >
          <Plus className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Layer List */}
      <div className="space-y-1 max-h-[320px] overflow-y-auto">
        {reversedLayers.map((layer) => {
          const isDragging = draggedId === layer.id;
          const isDropTarget = dropTargetId === layer.id;
          const isMergeTarget = mergeTargetId === layer.id;
          const isEditing = editingLayerId === layer.id;
          
          return (
            <div
              key={layer.id}
              draggable={!isEditing}
              onDragStart={(e) => handleDragStart(e, layer.id)}
              onDragOver={(e) => handleDragOver(e, layer.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, layer.id)}
              onDragEnd={handleDragEnd}
              className={cn(
                'rounded-lg transition-all border',
                activeLayerId === layer.id
                  ? 'bg-primary/20 border-primary/30'
                  : 'hover:bg-muted/50 border-transparent',
                isDragging && 'opacity-50 scale-95',
                isDropTarget && 'border-primary border-dashed bg-primary/10',
                isMergeTarget && 'border-amber-500 border-2 bg-amber-500/20'
              )}
            >
              <div
                onClick={() => !isEditing && onSelectLayer(layer.id)}
                className="flex items-center gap-1.5 px-2 py-2 cursor-pointer group"
              >
                <div 
                  className="cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-muted transition-colors"
                  title="Drag to reorder (Shift+Drop to merge)"
                >
                  <GripVertical className="w-3 h-3 text-muted-foreground/50" />
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisibility(layer.id);
                  }}
                  className="p-0.5 rounded hover:bg-muted transition-colors"
                  title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                >
                  {layer.visible ? (
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <EyeOff className="w-4 h-4 text-muted-foreground/50" />
                  )}
                </button>

                {isEditing ? (
                  <Input
                    ref={editInputRef}
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={handleRenameSubmit}
                    onKeyDown={handleRenameKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 h-6 text-xs px-1 py-0"
                    maxLength={20}
                  />
                ) : (
                  <span
                    onDoubleClick={() => handleDoubleClick(layer.id, layer.name)}
                    className={cn(
                      'flex-1 text-xs truncate cursor-text',
                      layer.visible ? 'text-foreground' : 'text-muted-foreground/50',
                      activeLayerId === layer.id && 'font-medium'
                    )}
                    title="Double-click to rename"
                  >
                    {layer.name}
                  </span>
                )}

                {layers.length > 1 && !isEditing && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
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
                    <Merge className="w-3.5 h-3.5 text-amber-500" />
                  </button>
                )}

                {layers.length > 1 && !isEditing && (
                  <button
                    onClick={(e) => handleDeleteClick(e, layer.id)}
                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/20 transition-all"
                    title="Delete Layer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                )}
              </div>

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

      {/* Reference Images Section */}
      {referenceImages.length > 0 && (
        <>
          <div className="h-px bg-border/50 my-2" />
          <div className="px-1 mb-1">
            <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">References</span>
          </div>
          <div className="space-y-1">
            {referenceImages.map((ref) => (
              <div
                key={ref.id}
                className="rounded-lg border border-transparent hover:bg-muted/50"
              >
                <div className="flex items-center gap-1.5 px-2 py-2 group">
                  <ImageIcon className="w-3 h-3 text-muted-foreground/50" />
                  
                  <button
                    onClick={() => onToggleReferenceVisibility?.(ref.id)}
                    className="p-0.5 rounded hover:bg-muted transition-colors"
                    title={ref.visible ? 'Hide Reference' : 'Show Reference'}
                  >
                    {ref.visible ? (
                      <Eye className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-muted-foreground/50" />
                    )}
                  </button>

                  <span className={cn(
                    'flex-1 text-xs truncate',
                    ref.visible ? 'text-foreground' : 'text-muted-foreground/50'
                  )}>
                    {ref.name}
                  </span>

                  <button
                    onClick={() => onToggleReferenceLock?.(ref.id)}
                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-all"
                    title={ref.locked ? 'Unlock' : 'Lock'}
                  >
                    {ref.locked ? (
                      <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <Unlock className="w-3.5 h-3.5 text-muted-foreground/50" />
                    )}
                  </button>

                  <button
                    onClick={() => onDeleteReference?.(ref.id)}
                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/20 transition-all"
                    title="Remove Reference"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>

                {ref.visible && (
                  <div 
                    className="px-2 pb-2 pt-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-8">
                        {Math.round(ref.opacity * 100)}%
                      </span>
                      <Slider
                        value={[ref.opacity * 100]}
                        min={0}
                        max={100}
                        step={1}
                        onValueChange={([value]) => onSetReferenceOpacity?.(ref.id, value / 100)}
                        className="flex-1 cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Footer */}
      <div className="mt-2 pt-2 border-t border-border/50 text-center">
        <div className="text-[10px] text-muted-foreground/60">
          {layers.find(l => l.id === activeLayerId)?.strokes.length || 0} strokes
        </div>
      </div>
    </div>
  );
};
