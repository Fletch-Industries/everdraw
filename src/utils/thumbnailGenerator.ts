import { Layer } from '@/types/drawing';

const THUMBNAIL_SIZE = 200;

export const generateThumbnail = async (
  layers: Layer[],
  canvasWidth: number,
  canvasHeight: number,
  backgroundColor: string
): Promise<string> => {
  // Create a temporary canvas for the thumbnail
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Calculate thumbnail dimensions maintaining aspect ratio
  const aspectRatio = canvasWidth / canvasHeight;
  let thumbWidth: number;
  let thumbHeight: number;
  
  if (aspectRatio > 1) {
    thumbWidth = THUMBNAIL_SIZE;
    thumbHeight = THUMBNAIL_SIZE / aspectRatio;
  } else {
    thumbHeight = THUMBNAIL_SIZE;
    thumbWidth = THUMBNAIL_SIZE * aspectRatio;
  }

  canvas.width = Math.max(1, Math.round(thumbWidth));
  canvas.height = Math.max(1, Math.round(thumbHeight));

  // Draw background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, thumbWidth, thumbHeight);

  // Scale factor for strokes
  const scale = thumbWidth / canvasWidth;

  // Draw each visible layer's strokes (simplified)
  for (const layer of layers) {
    if (!layer.visible) continue;
    
    ctx.globalAlpha = layer.opacity;
    
    for (const stroke of layer.strokes) {
      if (stroke.points.length < 2) continue;
      
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = Math.max(1, stroke.size * scale);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = layer.opacity * stroke.opacity;
      
      const startPoint = stroke.points[0];
      ctx.moveTo(startPoint.x * scale, startPoint.y * scale);
      
      for (let i = 1; i < stroke.points.length; i++) {
        const point = stroke.points[i];
        ctx.lineTo(point.x * scale, point.y * scale);
      }
      
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;

  // Convert to base64
  return canvas.toDataURL('image/png', 0.8);
};

// Generate thumbnail from an existing canvas element
export const generateThumbnailFromCanvas = (
  sourceCanvas: HTMLCanvasElement | null,
  backgroundColor: string
): string => {
  if (!sourceCanvas) return '';

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const canvasWidth = sourceCanvas.width;
  const canvasHeight = sourceCanvas.height;

  // Calculate thumbnail dimensions maintaining aspect ratio
  const aspectRatio = canvasWidth / canvasHeight;
  let thumbWidth: number;
  let thumbHeight: number;
  
  if (aspectRatio > 1) {
    thumbWidth = THUMBNAIL_SIZE;
    thumbHeight = THUMBNAIL_SIZE / aspectRatio;
  } else {
    thumbHeight = THUMBNAIL_SIZE;
    thumbWidth = THUMBNAIL_SIZE * aspectRatio;
  }

  canvas.width = Math.max(1, Math.round(thumbWidth));
  canvas.height = Math.max(1, Math.round(thumbHeight));

  // Draw background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, thumbWidth, thumbHeight);

  // Draw the source canvas scaled down
  ctx.drawImage(sourceCanvas, 0, 0, thumbWidth, thumbHeight);

  return canvas.toDataURL('image/png', 0.8);
};
