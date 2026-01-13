import pako from 'pako';
import {
  EverdrawFile,
  EVERDRAW_MAGIC,
  EVERDRAW_VERSION,
  ImportResult,
} from '@/types/everdrawFile';
import { Layer } from '@/types/drawing';

// Validate the structure of an Everdraw file
export const validateEverdrawFile = (data: unknown): { valid: boolean; error?: string } => {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid file: not an object' };
  }
  
  const file = data as Record<string, unknown>;
  
  // Check magic bytes
  if (file.magic !== EVERDRAW_MAGIC) {
    return { valid: false, error: 'Invalid file: not an Everdraw file' };
  }
  
  // Check version
  if (typeof file.version !== 'number') {
    return { valid: false, error: 'Invalid file: missing version' };
  }
  
  // Version compatibility check
  if (file.version > EVERDRAW_VERSION) {
    return { 
      valid: false, 
      error: `File version ${file.version} is newer than supported version ${EVERDRAW_VERSION}. Please update the app.` 
    };
  }
  
  // Check required fields
  if (!file.metadata || typeof file.metadata !== 'object') {
    return { valid: false, error: 'Invalid file: missing metadata' };
  }
  
  if (!file.canvas || typeof file.canvas !== 'object') {
    return { valid: false, error: 'Invalid file: missing canvas settings' };
  }
  
  if (!Array.isArray(file.layers)) {
    return { valid: false, error: 'Invalid file: missing layers' };
  }
  
  // Validate canvas dimensions
  const canvas = file.canvas as Record<string, unknown>;
  if (typeof canvas.width !== 'number' || canvas.width <= 0 || canvas.width > 16384) {
    return { valid: false, error: 'Invalid file: invalid canvas width' };
  }
  if (typeof canvas.height !== 'number' || canvas.height <= 0 || canvas.height > 16384) {
    return { valid: false, error: 'Invalid file: invalid canvas height' };
  }
  
  // Validate layers
  const layers = file.layers as unknown[];
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i] as Record<string, unknown>;
    if (!layer.id || typeof layer.id !== 'string') {
      return { valid: false, error: `Invalid file: layer ${i} missing id` };
    }
    if (!Array.isArray(layer.strokes)) {
      return { valid: false, error: `Invalid file: layer ${i} missing strokes` };
    }
  }
  
  return { valid: true };
};

// Migrate older file versions to current version
const migrateFile = (file: EverdrawFile): EverdrawFile => {
  // Future migrations would go here
  // For now, just return as-is since we're at version 1
  return file;
};

// Decompress and parse an Everdraw file
export const parseEverdrawFile = (data: ArrayBuffer): ImportResult => {
  try {
    // Try to decompress
    let jsonString: string;
    try {
      const decompressed = pako.ungzip(new Uint8Array(data));
      jsonString = new TextDecoder().decode(decompressed);
    } catch {
      // Maybe it's not compressed (legacy or debug file)
      jsonString = new TextDecoder().decode(data);
    }
    
    // Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      return { success: false, error: 'Invalid file: not valid JSON' };
    }
    
    // Validate structure
    const validation = validateEverdrawFile(parsed);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    
    // Migrate if needed
    const file = migrateFile(parsed as EverdrawFile);
    
    return { success: true, file };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error parsing file' 
    };
  }
};

// Read a file from disk and parse it
export const importEverdrawFile = (file: File): Promise<ImportResult> => {
  return new Promise((resolve) => {
    // Check file extension
    if (!file.name.toLowerCase().endsWith('.everdraw')) {
      resolve({ 
        success: false, 
        error: 'Invalid file type. Please select an .everdraw file.' 
      });
      return;
    }
    
    const reader = new FileReader();
    
    reader.onload = () => {
      const result = reader.result as ArrayBuffer;
      const parseResult = parseEverdrawFile(result);
      resolve(parseResult);
    };
    
    reader.onerror = () => {
      resolve({ success: false, error: 'Failed to read file' });
    };
    
    reader.readAsArrayBuffer(file);
  });
};

// Generate new IDs for layers to avoid conflicts when importing
export const regenerateLayerIds = (layers: Layer[]): Layer[] => {
  const generateId = () => Math.random().toString(36).substr(2, 9);
  
  return layers.map(layer => ({
    ...layer,
    id: generateId(),
    strokes: layer.strokes.map(stroke => ({ ...stroke })),
  }));
};
