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
}

export class WebGLLayerManager {
  private gl: WebGL2RenderingContext;
  private layerFBOs: Map<string, LayerFBO> = new Map();
  private activeStrokeFBO: LayerFBO | null = null;
  private width: number = 0;
  private height: number = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  /**
   * Initialize or resize the layer system
   */
  initialize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    
    // Resize existing FBOs
    this.layerFBOs.forEach((fbo, id) => {
      this.resizeFBO(fbo, width, height);
    });
    
    // Create or resize active stroke FBO
    if (!this.activeStrokeFBO) {
      this.activeStrokeFBO = this.createFBO(width, height);
    } else {
      this.resizeFBO(this.activeStrokeFBO, width, height);
    }
  }

  /**
   * Create a new FBO for a layer
   */
  private createFBO(width: number, height: number): LayerFBO {
    const gl = this.gl;
    
    // Create texture
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    // Create framebuffer
    const framebuffer = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    
    // Check framebuffer status
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.error('Framebuffer not complete:', status);
    }
    
    // Clear to transparent
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    // Unbind
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    
    return { framebuffer, texture, width, height };
  }

  /**
   * Resize an existing FBO
   */
  private resizeFBO(fbo: LayerFBO, width: number, height: number): void {
    if (fbo.width === width && fbo.height === height) return;
    
    const gl = this.gl;
    
    gl.bindTexture(gl.TEXTURE_2D, fbo.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
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
   * Merge active stroke FBO into a layer FBO (pixel-perfect merge)
   */
  mergeActiveToLayer(layerId: string, isEraser: boolean = false): void {
    const layerFBO = this.ensureLayerFBO(layerId);
    if (!this.activeStrokeFBO) return;
    
    const gl = this.gl;
    
    // Bind the layer FBO as render target
    gl.bindFramebuffer(gl.FRAMEBUFFER, layerFBO.framebuffer);
    gl.viewport(0, 0, layerFBO.width, layerFBO.height);
    
    // Set blend mode
    if (isEraser) {
      // Eraser: destination-out blending
      gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    } else {
      // Normal: premultiplied alpha blending
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
    gl.enable(gl.BLEND);
    
    // Draw the active stroke texture onto the layer
    // (This requires a full-screen quad render - implemented in WebGLBrushEngine)
    
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
    
    if (this.activeStrokeFBO) {
      gl.deleteFramebuffer(this.activeStrokeFBO.framebuffer);
      gl.deleteTexture(this.activeStrokeFBO.texture);
      this.activeStrokeFBO = null;
    }
  }

  /**
   * Get dimensions
   */
  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }
}
