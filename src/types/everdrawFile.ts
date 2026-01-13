import { Layer, WetMixSettings, ReferenceImage } from './drawing';
import { CustomBrushPreset } from './customBrush';
import { CanvasSize } from './canvasSize';

export const EVERDRAW_MAGIC = 'EVDR';
export const EVERDRAW_VERSION = 2; // Bumped for reference images
export const EVERDRAW_EXTENSION = '.everdraw';
export const EVERDRAW_MIME_TYPE = 'application/x-everdraw';

export interface EverdrawFileMetadata {
  name: string;
  created: number;
  modified: number;
  appVersion: string;
  fileFormatVersion: number;
}

export interface EverdrawCanvasSettings {
  width: number;
  height: number;
  dpi: number;
  backgroundColor: string;
}

export interface EverdrawFile {
  magic: typeof EVERDRAW_MAGIC;
  version: number; // Changed to number for flexibility
  metadata: EverdrawFileMetadata;
  canvas: EverdrawCanvasSettings;
  layers: Layer[];
  customBrushes: CustomBrushPreset[];
  activeLayerId: string;
  wetMix: WetMixSettings;
  referenceImages?: ReferenceImage[]; // Optional for backward compatibility
}

export type ImageExportFormat = 'png' | 'jpg' | 'webp';

export interface ImageExportOptions {
  format: ImageExportFormat;
  includeBackground: boolean;
  quality: number; // 0.0-1.0 for lossy formats (jpg, webp)
  scale: number;   // 1 = original size, 2 = 2x, etc.
}

export interface EverdrawExportOptions {
  format: 'everdraw';
  name?: string;
}

export type ExportOptions = ImageExportOptions | EverdrawExportOptions;

export interface ImportResult {
  success: boolean;
  file?: EverdrawFile;
  error?: string;
}
