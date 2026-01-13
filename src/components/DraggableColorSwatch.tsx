import React, { useCallback } from 'react';
import { cn } from '@/lib/utils';

interface DraggableColorSwatchProps {
  color: string;
  isActive?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md';
  className?: string;
}

export const DraggableColorSwatch = ({
  color,
  isActive = false,
  onClick,
  size = 'sm',
  className,
}: DraggableColorSwatchProps) => {
  const handleDragStart = useCallback((e: React.DragEvent) => {
    // Set the drag data to the color
    e.dataTransfer.setData('application/x-color', color);
    e.dataTransfer.effectAllowed = 'copy';
    
    // Create a visual drag image (colored circle)
    const dragImage = document.createElement('div');
    dragImage.style.width = '32px';
    dragImage.style.height = '32px';
    dragImage.style.borderRadius = '50%';
    dragImage.style.backgroundColor = color;
    dragImage.style.border = '2px solid white';
    dragImage.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    document.body.appendChild(dragImage);
    
    e.dataTransfer.setDragImage(dragImage, 16, 16);
    
    // Clean up the drag image element after a short delay
    setTimeout(() => {
      document.body.removeChild(dragImage);
    }, 0);
  }, [color]);

  const sizeClasses = size === 'sm' 
    ? 'w-6 h-6 rounded-md' 
    : 'w-7 h-7 rounded-lg';

  return (
    <button
      draggable
      onDragStart={handleDragStart}
      onClick={onClick}
      className={cn(
        sizeClasses,
        'border transition-all hover:scale-110 active:scale-95 cursor-grab active:cursor-grabbing',
        isActive 
          ? 'border-primary ring-2 ring-primary/30' 
          : 'border-border/50',
        className
      )}
      style={{ backgroundColor: color }}
      title={`${color} - Click to select, drag to fill`}
    />
  );
};
