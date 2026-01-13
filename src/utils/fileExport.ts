import pako from 'pako';
import { Layer, DrawingState, WetMixSettings, ReferenceImage } from '@/types/drawing';
import { CustomBrushPreset } from '@/types/customBrush';
import { CanvasSize } from '@/types/canvasSize';
import {
  EverdrawFile,
  EVERDRAW_MAGIC,
  EVERDRAW_VERSION,
  EVERDRAW_EXTENSION,
  ImageExportOptions,
  ImageExportFormat,
} from '@/types/everdrawFile';

const APP_VERSION = '1.0.0';

// Extract unique custom brushes used in the layers
const extractUsedBrushes = (layers: Layer[]): CustomBrushPreset[] => {
  const brushMap = new Map<string, CustomBrushPreset>();
  
  for (const layer of layers) {
    for (const stroke of layer.strokes) {
      if (stroke.customBrushPreset) {
        brushMap.set(stroke.customBrushPreset.id, stroke.customBrushPreset);
      }
    }
  }
  
  return Array.from(brushMap.values());
};

// Create an Everdraw file object
export const createEverdrawFile = (
  layers: Layer[],
  canvasSize: CanvasSize,
  backgroundColor: string,
  activeLayerId: string,
  wetMix: WetMixSettings,
  referenceImages: ReferenceImage[] = [],
  name: string = 'Untitled'
): EverdrawFile => {
  const now = Date.now();
  const customBrushes = extractUsedBrushes(layers);
  
  return {
    magic: EVERDRAW_MAGIC,
    version: EVERDRAW_VERSION,
    metadata: {
      name,
      created: now,
      modified: now,
      appVersion: APP_VERSION,
      fileFormatVersion: EVERDRAW_VERSION,
    },
    canvas: {
      width: canvasSize.width,
      height: canvasSize.height,
      dpi: canvasSize.dpi,
      backgroundColor,
    },
    layers,
    customBrushes,
    activeLayerId,
    wetMix,
    referenceImages,
  };
};

// Serialize and compress the file
export const serializeEverdrawFile = (file: EverdrawFile): Uint8Array => {
  const jsonString = JSON.stringify(file);
  const compressed = pako.gzip(jsonString);
  return compressed;
};

// Export as .everdraw file and trigger download
export const exportEverdrawFile = (
  layers: Layer[],
  canvasSize: CanvasSize,
  backgroundColor: string,
  activeLayerId: string,
  wetMix: WetMixSettings,
  referenceImages: ReferenceImage[] = [],
  name: string = 'Untitled'
): void => {
  const file = createEverdrawFile(
    layers,
    canvasSize,
    backgroundColor,
    activeLayerId,
    wetMix,
    referenceImages,
    name
  );
  
  const compressed = serializeEverdrawFile(file);
  const blob = new Blob([new Uint8Array(compressed)], { type: 'application/x-everdraw' });
  
  const sanitizedName = name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'Untitled';
  const filename = `${sanitizedName}${EVERDRAW_EXTENSION}`;
  
  downloadBlob(blob, filename);
};

// Download a blob as a file
const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Get MIME type for image format
const getImageMimeType = (format: ImageExportFormat): string => {
  switch (format) {
    case 'png': return 'image/png';
    case 'jpg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    default: return 'image/png';
  }
};

// Get file extension for image format
const getImageExtension = (format: ImageExportFormat): string => {
  switch (format) {
    case 'png': return '.png';
    case 'jpg': return '.jpg';
    case 'webp': return '.webp';
    default: return '.png';
  }
};

// Render layers to a canvas and export as image
// Returns the exported blob for optional signing
export const exportAsImage = async (
  sourceCanvas: HTMLCanvasElement,
  options: ImageExportOptions,
  canvasSize: CanvasSize,
  backgroundColor: string,
  name: string = 'Untitled'
): Promise<{ blob: Blob; filename: string }> => {
  const { format, includeBackground, quality, scale } = options;
  
  // Create output canvas at the specified scale
  const outputWidth = Math.floor(canvasSize.width * scale);
  const outputHeight = Math.floor(canvasSize.height * scale);
  
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const outputCtx = outputCanvas.getContext('2d')!;
  
  // Fill background if requested
  if (includeBackground) {
    outputCtx.fillStyle = backgroundColor;
    outputCtx.fillRect(0, 0, outputWidth, outputHeight);
  }
  
  // Draw the source canvas scaled to the output
  outputCtx.drawImage(
    sourceCanvas,
    0, 0, sourceCanvas.width, sourceCanvas.height,
    0, 0, outputWidth, outputHeight
  );
  
  // Convert to blob
  const mimeType = getImageMimeType(format);
  const qualityValue = format === 'png' ? undefined : quality;
  
  return new Promise((resolve, reject) => {
    outputCanvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to create image blob'));
          return;
        }
        
        const sanitizedName = name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'Untitled';
        const scaleLabel = scale !== 1 ? `@${scale}x` : '';
        const filename = `${sanitizedName}${scaleLabel}${getImageExtension(format)}`;
        
        downloadBlob(blob, filename);
        resolve({ blob, filename });
      },
      mimeType,
      qualityValue
    );
  });
};

// Get estimated file size of the everdraw file
export const estimateEverdrawFileSize = (
  layers: Layer[],
  canvasSize: CanvasSize,
  backgroundColor: string,
  activeLayerId: string,
  wetMix: WetMixSettings,
  referenceImages: ReferenceImage[] = []
): number => {
  const file = createEverdrawFile(layers, canvasSize, backgroundColor, activeLayerId, wetMix, referenceImages);
  const jsonString = JSON.stringify(file);
  // Gzip typically achieves 70-90% compression on JSON
  return Math.floor(jsonString.length * 0.2);
};

// Format bytes to human readable string
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};
