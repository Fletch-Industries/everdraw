import { Layer, WetMixSettings, ReferenceImage } from './drawing';
import { CustomBrushPreset } from './customBrush';
import { CanvasSize } from './canvasSize';

export interface SignedProof {
  txid: string;
  contentHash: string;
  signedAt: number;
}

export interface Project {
  id: string;
  name: string;
  thumbnail: string; // Base64 PNG thumbnail
  created: number;
  modified: number;
  canvas: {
    width: number;
    height: number;
    dpi: number;
    backgroundColor: string;
  };
  layers: Layer[];
  customBrushes: CustomBrushPreset[];
  activeLayerId: string;
  wetMix: WetMixSettings;
  referenceImages: ReferenceImage[];
  signedProof?: SignedProof;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  thumbnail: string;
  created: number;
  modified: number;
  canvasWidth: number;
  canvasHeight: number;
  signedProof?: SignedProof;
}
