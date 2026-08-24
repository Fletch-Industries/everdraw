/**
 * WebGL Layer Manager - FBO-based layer management
 * 
 * Handles creation, resizing, and compositing of layer framebuffer objects.
 * Each layer renders to its own FBO for GPU-accelerated compositing.
 */

import { Layer } from '@/types/drawing';

export interface LayerFBO {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
  /** RGBA16F storage (stroke accumulation buffers) vs RGBA8 (layers). */
  isFloat?: boolean;
}

export class WebGLLayerManager {
  private gl: WebGL2RenderingContext;
  private layerFBOs: Map<string, LayerFBO> = new Map();
  private activeStrokeFBO: LayerFBO | null = null;
  private scratchFBO: LayerFBO | null = null;
  private strokeScratchFBO: LayerFBO | null = null;
  private snapshotFBOs: { undo: LayerFBO | null; redo: LayerFBO | null } = { undo: null, redo: null };
  private width: number = 0;
  private height: number = 0;

  /**
   * Half-float rendering support. Stroke accumulation uses RGBA16F when
   * available: low-flow brushes emit per-stamp alphas of ~1/500, which
   * posterize badly in 8-bit buffers (visible banding in airbrush strokes).
   */
  private readonly halfFloat: boolean;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.halfFloat = !!(
      gl.getExtension('EXT_color_buffer_float') ||
      gl.getExtension('EXT_color_buffer_half_float')
    );
  }

  /**
   * Initialize or resize the layer system
   */
  initialize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    // Resize existing FBOs
    this.layerFBOs.forEach((fbo) => {
      this.resizeFBO(fbo, width, height);
    });

    // Create or resize helper FBOs (stroke accumulation buffers are RGBA16F)
    if (!this.activeStrokeFBO) {
      this.activeStrokeFBO = this.createFBO(width, height, true);
    } else {
      this.resizeFBO(this.activeStrokeFBO, width, height);
    }
    if (this.scratchFBO) this.resizeFBO(this.scratchFBO, width, height);
    if (this.strokeScratchFBO) this.resizeFBO(this.strokeScratchFBO, width, height);
    if (this.snapshotFBOs.undo) this.resizeFBO(this.snapshotFBOs.undo, width, height);
    if (this.snapshotFBOs.redo) this.resizeFBO(this.snapshotFBOs.redo, width, height);
  }

  /**
   * Second stroke-accumulation buffer: the predicted tail is joined with the
   * active stroke here in flow space, so the preview composites at stroke
   * opacity exactly once (no double-darkening where tail meets stroke).
   */
  getStrokeScratchFBO(): LayerFBO | null {
    if (this.width === 0) return null;
    if (!this.strokeScratchFBO) this.strokeScratchFBO = this.createFBO(this.width, this.height, true);
    return this.strokeScratchFBO;
  }

  /**
   * Scratch FBO for temporary composites (eraser preview, wet-mix sampling).
   */
  getScratchFBO(): LayerFBO | null {
    if (this.width === 0) return null;
    if (!this.scratchFBO) this.scratchFBO = this.createFBO(this.width, this.height);
    return this.scratchFBO;
  }

  /**
   * Small FBO for wet-mix color sampling: pickup only needs coarse color, and
   * reading back the full-resolution canvas stalled stroke start by 100ms+.
   */
  private samplerFBO: LayerFBO | null = null;

  getSamplerFBO(): LayerFBO | null {
    if (this.width === 0) return null;
    const maxDim = 512;
    const scale = Math.min(1, maxDim / Math.max(this.width, this.height));
    const w = Math.max(1, Math.round(this.width * scale));
    const h = Math.max(1, Math.round(this.height * scale));
    if (this.samplerFBO && (this.samplerFBO.width !== w || this.samplerFBO.height !== h)) {
      const gl = this.gl;
      gl.deleteFramebuffer(this.samplerFBO.framebuffer);
      gl.deleteTexture(this.samplerFBO.texture);
      this.samplerFBO = null;
    }
    if (!this.samplerFBO) this.samplerFBO = this.createFBO(w, h);
    return this.samplerFBO;
  }

  /**
   * Snapshot FBOs backing the fast one-step undo/redo path.
   */
  getSnapshotFBO(slot: 'undo' | 'redo'): LayerFBO | null {
    if (this.width === 0) return null;
    if (!this.snapshotFBOs[slot]) this.snapshotFBOs[slot] = this.createFBO(this.width, this.height);
    return this.snapshotFBOs[slot];
  }

  /**
   * Create a new FBO for a layer
   */
  private createFBO(width: number, height: number, precise: boolean = false): LayerFBO {
    const gl = this.gl;
    const useFloat = precise && this.halfFloat;

    // Create texture
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (useFloat) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Create framebuffer
    const framebuffer = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    // Check framebuffer status; fall back to RGBA8 if float isn't renderable.
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      if (useFloat) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteTexture(texture);
        return this.createFBO(width, height, false);
      }
      console.error('Framebuffer not complete:', status);
    }

    // Clear to transparent
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Unbind
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return { framebuffer, texture, width, height, isFloat: useFloat };
  }

  /**
   * Resize an existing FBO
   */
  private resizeFBO(fbo: LayerFBO, width: number, height: number): void {
    if (fbo.width === width && fbo.height === height) return;

    const gl = this.gl;

    gl.bindTexture(gl.TEXTURE_2D, fbo.texture);
    if (fbo.isFloat) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);

    fbo.width = width;
    fbo.height = height;
  }

  /**
   * Ensure a layer has an FBO
   */
  ensureLayerFBO(layerId: string): LayerFBO {
    let fbo = this.layerFBOs.get(layerId);
    if (!fbo) {
      fbo = this.createFBO(this.width, this.height);
      this.layerFBOs.set(layerId, fbo);
    }
    return fbo;
  }

  /**
   * Get the FBO for a layer
   */
  getLayerFBO(layerId: string): LayerFBO | undefined {
    return this.layerFBOs.get(layerId);
  }

  /**
   * Get the active stroke FBO
   */
  getActiveStrokeFBO(): LayerFBO | null {
    return this.activeStrokeFBO;
  }

  /**
   * Clear the active stroke FBO
   */
  clearActiveStrokeFBO(): void {
    if (!this.activeStrokeFBO) return;
    
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.activeStrokeFBO.framebuffer);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Clear a layer FBO
   */
  clearLayerFBO(layerId: string): void {
    const fbo = this.layerFBOs.get(layerId);
    if (!fbo) return;
    
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.framebuffer);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Remove a layer FBO
   */
  removeLayerFBO(layerId: string): void {
    const fbo = this.layerFBOs.get(layerId);
    if (!fbo) return;
    
    const gl = this.gl;
    gl.deleteFramebuffer(fbo.framebuffer);
    gl.deleteTexture(fbo.texture);
    this.layerFBOs.delete(layerId);
  }

  /**
   * Sync layer FBOs with layer list (create/remove as needed)
   */
  syncWithLayers(layers: Layer[]): void {
    const layerIds = new Set(layers.map(l => l.id));
    
    // Create FBOs for new layers
    layers.forEach(layer => {
      this.ensureLayerFBO(layer.id);
    });
    
    // Remove FBOs for deleted layers
    this.layerFBOs.forEach((_, id) => {
      if (!layerIds.has(id)) {
        this.removeLayerFBO(id);
      }
    });
  }

  /**
   * Get all layer FBOs in order
   */
  getOrderedLayerFBOs(layers: Layer[]): Array<{ layerId: string; fbo: LayerFBO; layer: Layer }> {
    return layers
      .map(layer => ({
        layerId: layer.id,
        fbo: this.layerFBOs.get(layer.id),
        layer,
      }))
      .filter((item): item is { layerId: string; fbo: LayerFBO; layer: Layer } => 
        item.fbo !== undefined
      );
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    const gl = this.gl;
    
    this.layerFBOs.forEach((fbo) => {
      gl.deleteFramebuffer(fbo.framebuffer);
      gl.deleteTexture(fbo.texture);
    });
    this.layerFBOs.clear();
    
    const helpers = [this.activeStrokeFBO, this.scratchFBO, this.strokeScratchFBO, this.samplerFBO, this.snapshotFBOs.undo, this.snapshotFBOs.redo];
    for (const fbo of helpers) {
      if (fbo) {
        gl.deleteFramebuffer(fbo.framebuffer);
        gl.deleteTexture(fbo.texture);
      }
    }
    this.activeStrokeFBO = null;
    this.scratchFBO = null;
    this.strokeScratchFBO = null;
    this.samplerFBO = null;
    this.snapshotFBOs = { undo: null, redo: null };
  }

  /**
   * Get dimensions
   */
  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
}
