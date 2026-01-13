/**
 * WebGL Brush Engine - GPU-accelerated brush stamp rendering with texture-based tips
 * 
 * Uses instanced rendering with pre-baked brush tip textures for high-quality,
 * efficient brush strokes.
 */

import { BrushType, WetMixSettings } from '@/types/drawing';
import { CustomBrushPreset } from '@/types/customBrush';
import { Stamp } from './strokeSession';
import { createStampProgram, createCompositeProgram } from './webglShaders';
import { WebGLLayerManager, LayerFBO } from './webglLayerManager';
import { getBrushTipTexture, uploadBrushTipToGL } from './brushTipGenerator';

// Maximum stamps per batch (instanced rendering)
const MAX_STAMPS_PER_BATCH = 10000;

export class WebGLBrushEngine {
  private gl: WebGL2RenderingContext;
  private stampProgram: WebGLProgram | null = null;
  private compositeProgram: WebGLProgram | null = null;
  
  // Buffers
  private quadVAO: WebGLVertexArrayObject | null = null;
  private instanceBuffer: WebGLBuffer | null = null;
  
  // Instance data array (reused to avoid allocations)
  private instanceData: Float32Array;
  
  // Brush tip texture cache
  private brushTipTextures: Map<string, WebGLTexture> = new Map();
  private currentBrushTip: WebGLTexture | null = null;
  
  // Uniform locations
  private stampUniforms: {
    resolution: WebGLUniformLocation | null;
    brushTip: WebGLUniformLocation | null;
    grainAmount: WebGLUniformLocation | null;
    grainOffset: WebGLUniformLocation | null;
    // Pencil-specific uniforms
    isPencil: WebGLUniformLocation | null;
    paperGrain: WebGLUniformLocation | null;
    tiltFactor: WebGLUniformLocation | null;
    // Wet mixing uniforms
    wetMixEnabled: WebGLUniformLocation | null;
    wetMixDilution: WebGLUniformLocation | null;
    wetMixCharge: WebGLUniformLocation | null;
    wetMixPull: WebGLUniformLocation | null;
    canvasTexture: WebGLUniformLocation | null;
    canvasSize: WebGLUniformLocation | null;
  } | null = null;
  
  private compositeUniforms: {
    texture: WebGLUniformLocation | null;
    opacity: WebGLUniformLocation | null;
  } | null = null;

  // Layer manager reference
  private layerManager: WebGLLayerManager;

  // Composite quad VAO
  private compositeVAO: WebGLVertexArrayObject | null = null;
  
  // Grain offset for screen-space consistency
  private grainOffset: [number, number] = [0, 0];
  
  // Canvas state texture for wet mixing
  private canvasStateTexture: WebGLTexture | null = null;
  private canvasStateFBO: WebGLFramebuffer | null = null;
  private canvasStateSize: { width: number; height: number } = { width: 0, height: 0 };
  
  // Wet mixing throttle - only update texture every N stamps
  private wetMixStampCounter: number = 0;
  private static readonly WET_MIX_UPDATE_INTERVAL = 30;

  constructor(gl: WebGL2RenderingContext, layerManager: WebGLLayerManager) {
    this.gl = gl;
    this.layerManager = layerManager;
    
    // Allocate instance data buffer
    // Each stamp: x, y, size, rotation, pressure, opacity, r, g, b, aspectRatio = 10 floats
    this.instanceData = new Float32Array(MAX_STAMPS_PER_BATCH * 10);
    
    this.initializeShaders();
    this.initializeBuffers();
  }

  private initializeShaders(): void {
    const gl = this.gl;
    
    // Create stamp program
    this.stampProgram = createStampProgram(gl);
    if (this.stampProgram) {
      this.stampUniforms = {
        resolution: gl.getUniformLocation(this.stampProgram, 'u_resolution'),
        brushTip: gl.getUniformLocation(this.stampProgram, 'u_brushTip'),
        grainAmount: gl.getUniformLocation(this.stampProgram, 'u_grainAmount'),
        grainOffset: gl.getUniformLocation(this.stampProgram, 'u_grainOffset'),
        // Pencil-specific uniforms
        isPencil: gl.getUniformLocation(this.stampProgram, 'u_isPencil'),
        paperGrain: gl.getUniformLocation(this.stampProgram, 'u_paperGrain'),
        tiltFactor: gl.getUniformLocation(this.stampProgram, 'u_tiltFactor'),
        // Wet mixing uniforms
        wetMixEnabled: gl.getUniformLocation(this.stampProgram, 'u_wetMixEnabled'),
        wetMixDilution: gl.getUniformLocation(this.stampProgram, 'u_wetMixDilution'),
        wetMixCharge: gl.getUniformLocation(this.stampProgram, 'u_wetMixCharge'),
        wetMixPull: gl.getUniformLocation(this.stampProgram, 'u_wetMixPull'),
        canvasTexture: gl.getUniformLocation(this.stampProgram, 'u_canvasTexture'),
        canvasSize: gl.getUniformLocation(this.stampProgram, 'u_canvasSize'),
      };
    }
    
    // Create composite program
    this.compositeProgram = createCompositeProgram(gl);
    if (this.compositeProgram) {
      this.compositeUniforms = {
        texture: gl.getUniformLocation(this.compositeProgram, 'u_texture'),
        opacity: gl.getUniformLocation(this.compositeProgram, 'u_opacity'),
      };
    }
  }

  private initializeBuffers(): void {
    const gl = this.gl;
    
    // Create quad geometry for stamps
    const quadVertices = new Float32Array([
      // position (x, y), texCoord (u, v)
      -1, -1, 0, 0,
       1, -1, 1, 0,
       1,  1, 1, 1,
      -1, -1, 0, 0,
       1,  1, 1, 1,
      -1,  1, 0, 1,
    ]);
    
    // Create VAO for stamps
    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);
    
    // Vertex buffer
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
    
    // Position attribute
    const posLoc = gl.getAttribLocation(this.stampProgram!, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    
    // TexCoord attribute
    const texLoc = gl.getAttribLocation(this.stampProgram!, 'a_texCoord');
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);
    
    // Instance buffer
    this.instanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);
    
    // Instance attributes (with divisor = 1 for per-instance data)
    const stride = 10 * 4; // 10 floats per instance (added aspectRatio)
    
    const stampPosLoc = gl.getAttribLocation(this.stampProgram!, 'a_stampPosition');
    gl.enableVertexAttribArray(stampPosLoc);
    gl.vertexAttribPointer(stampPosLoc, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(stampPosLoc, 1);
    
    const sizeLoc = gl.getAttribLocation(this.stampProgram!, 'a_stampSize');
    gl.enableVertexAttribArray(sizeLoc);
    gl.vertexAttribPointer(sizeLoc, 1, gl.FLOAT, false, stride, 8);
    gl.vertexAttribDivisor(sizeLoc, 1);
    
    const rotLoc = gl.getAttribLocation(this.stampProgram!, 'a_stampRotation');
    gl.enableVertexAttribArray(rotLoc);
    gl.vertexAttribPointer(rotLoc, 1, gl.FLOAT, false, stride, 12);
    gl.vertexAttribDivisor(rotLoc, 1);
    
    const pressLoc = gl.getAttribLocation(this.stampProgram!, 'a_stampPressure');
    gl.enableVertexAttribArray(pressLoc);
    gl.vertexAttribPointer(pressLoc, 1, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(pressLoc, 1);
    
    const opacLoc = gl.getAttribLocation(this.stampProgram!, 'a_stampOpacity');
    gl.enableVertexAttribArray(opacLoc);
    gl.vertexAttribPointer(opacLoc, 1, gl.FLOAT, false, stride, 20);
    gl.vertexAttribDivisor(opacLoc, 1);
    
    const colorLoc = gl.getAttribLocation(this.stampProgram!, 'a_stampColor');
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, stride, 24);
    gl.vertexAttribDivisor(colorLoc, 1);
    
    // Aspect ratio attribute (new - for elongated pencil bristles)
    const aspectLoc = gl.getAttribLocation(this.stampProgram!, 'a_stampAspectRatio');
    gl.enableVertexAttribArray(aspectLoc);
    gl.vertexAttribPointer(aspectLoc, 1, gl.FLOAT, false, stride, 36);
    gl.vertexAttribDivisor(aspectLoc, 1);
    
    gl.bindVertexArray(null);
    
    // Create composite VAO
    this.createCompositeVAO();
  }

  private createCompositeVAO(): void {
    const gl = this.gl;
    
    const quadVertices = new Float32Array([
      // position (x, y), texCoord (u, v)
      -1, -1, 0, 0,
       1, -1, 1, 0,
       1,  1, 1, 1,
      -1, -1, 0, 0,
       1,  1, 1, 1,
      -1,  1, 0, 1,
    ]);
    
    this.compositeVAO = gl.createVertexArray();
    gl.bindVertexArray(this.compositeVAO);
    
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
    
    const posLoc = gl.getAttribLocation(this.compositeProgram!, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    
    const texLoc = gl.getAttribLocation(this.compositeProgram!, 'a_texCoord');
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);
    
    gl.bindVertexArray(null);
  }

  /**
   * Get or create a WebGL texture for a brush type
   */
  private getBrushTipGLTexture(brushType: BrushType, customBrush?: CustomBrushPreset): WebGLTexture | null {
    const cacheKey = customBrush ? `custom:${customBrush.id}` : brushType;
    
    let glTexture = this.brushTipTextures.get(cacheKey);
    if (!glTexture) {
      const tipTexture = getBrushTipTexture(brushType, customBrush);
      glTexture = uploadBrushTipToGL(this.gl, tipTexture);
      if (glTexture) {
        this.brushTipTextures.set(cacheKey, glTexture);
      }
    }
    
    return glTexture ?? null;
  }

  /**
   * Render stamps to the active stroke FBO with optional wet mixing
   */
  renderStamps(
    stamps: Stamp[],
    brushType: BrushType,
    customBrush?: CustomBrushPreset,
    isEraser: boolean = false,
    dpr: number = 1,
    wetMix?: WetMixSettings,
    activeLayerId?: string
  ): void {
    if (stamps.length === 0) return;
    
    const gl = this.gl;
    const activeFBO = this.layerManager.getActiveStrokeFBO();
    if (!activeFBO || !this.stampProgram) return;
    
    // Get brush tip texture
    const brushTipTexture = this.getBrushTipGLTexture(brushType, customBrush);
    if (!brushTipTexture) return;
    
    // PERFORMANCE: GPU-side wet mixing is completely disabled
    // Wet mixing is now done CPU-side in StrokeSession for better color accumulation
    // and to work identically on all devices (including iPad)
    const wetMixEnabled = false;
    
    // Bind the active stroke FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, activeFBO.framebuffer);
    gl.viewport(0, 0, activeFBO.width, activeFBO.height);
    
    // Enable blending with proper paint layering
    // Always use normal blending when stamping - eraser effect is applied during merge/composite
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.ONE, gl.ONE_MINUS_SRC_ALPHA,  // RGB (premultiplied)
      gl.ONE, gl.ONE_MINUS_SRC_ALPHA   // Alpha
    );
    
    // Use stamp program
    gl.useProgram(this.stampProgram);
    gl.bindVertexArray(this.quadVAO);
    
    // Set uniforms
    gl.uniform2f(this.stampUniforms!.resolution, activeFBO.width, activeFBO.height);
    
    // Bind brush tip texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, brushTipTexture);
    gl.uniform1i(this.stampUniforms!.brushTip, 0);
    
    // Grain settings
    const grainAmount = customBrush?.texture?.grain ?? (brushType === 'pencil' ? 0.5 : 0);
    gl.uniform1f(this.stampUniforms!.grainAmount, grainAmount);
    gl.uniform2f(this.stampUniforms!.grainOffset, this.grainOffset[0], this.grainOffset[1]);
    
    // Pencil-specific uniforms - enable paper tooth masking
    const isPencil = brushType === 'pencil';
    gl.uniform1i(this.stampUniforms!.isPencil, isPencil ? 1 : 0);
    gl.uniform1f(this.stampUniforms!.paperGrain, isPencil ? 0.45 : 0); // Moderate paper tooth effect
    gl.uniform1f(this.stampUniforms!.tiltFactor, 0); // Will be updated per-stroke if tilt data available
    
    // Wet mixing settings
    gl.uniform1i(this.stampUniforms!.wetMixEnabled, wetMixEnabled ? 1 : 0);
    if (wetMixEnabled && wetMix && this.canvasStateTexture) {
      gl.uniform1f(this.stampUniforms!.wetMixDilution, wetMix.dilution);
      gl.uniform1f(this.stampUniforms!.wetMixCharge, wetMix.charge);
      gl.uniform1f(this.stampUniforms!.wetMixPull, wetMix.pull);
      gl.uniform2f(this.stampUniforms!.canvasSize, activeFBO.width, activeFBO.height);
      
      // Bind canvas state texture to texture unit 1
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.canvasStateTexture);
      gl.uniform1i(this.stampUniforms!.canvasTexture, 1);
    } else {
      gl.uniform1f(this.stampUniforms!.wetMixDilution, 0);
      gl.uniform1f(this.stampUniforms!.wetMixCharge, 1);
      gl.uniform1f(this.stampUniforms!.wetMixPull, 0);
    }
    
    // Batch stamps
    const numBatches = Math.ceil(stamps.length / MAX_STAMPS_PER_BATCH);
    
    for (let batch = 0; batch < numBatches; batch++) {
      const startIdx = batch * MAX_STAMPS_PER_BATCH;
      const endIdx = Math.min(startIdx + MAX_STAMPS_PER_BATCH, stamps.length);
      const batchSize = endIdx - startIdx;
      
      // Fill instance data with DPR-scaled positions
      for (let i = 0; i < batchSize; i++) {
        const stamp = stamps[startIdx + i];
        const offset = i * 10; // 10 floats per stamp (added aspectRatio)
        
        // Scale position and size by DPR
        this.instanceData[offset + 0] = stamp.x * dpr;
        this.instanceData[offset + 1] = stamp.y * dpr;
        this.instanceData[offset + 2] = stamp.size * dpr;
        this.instanceData[offset + 3] = stamp.angle;
        this.instanceData[offset + 4] = stamp.pressure;
        this.instanceData[offset + 5] = stamp.opacity;
        this.instanceData[offset + 6] = stamp.color.r / 255;
        this.instanceData[offset + 7] = stamp.color.g / 255;
        this.instanceData[offset + 8] = stamp.color.b / 255;
        this.instanceData[offset + 9] = stamp.aspectRatio ?? 1.0; // Aspect ratio (default 1.0)
      }
      
      // Upload instance data
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData.subarray(0, batchSize * 10));
      
      // Draw instanced
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, batchSize);
    }
    
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  
  /**
   * Update the canvas state texture for wet mixing
   * Composites all visible layers into a single texture for sampling
   */
  private updateCanvasStateTexture(activeLayerId: string): void {
    const gl = this.gl;
    const dims = this.layerManager.getDimensions();
    
    // Create canvas state texture if needed or if size changed
    const needsResize = this.canvasStateSize.width !== dims.width || this.canvasStateSize.height !== dims.height;
    
    if (!this.canvasStateTexture || needsResize) {
      if (this.canvasStateTexture) {
        gl.deleteTexture(this.canvasStateTexture);
      }
      if (this.canvasStateFBO) {
        gl.deleteFramebuffer(this.canvasStateFBO);
      }
      
      this.canvasStateTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.canvasStateTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, dims.width, dims.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      
      this.canvasStateFBO = gl.createFramebuffer();
      this.canvasStateSize = { width: dims.width, height: dims.height };
    }
    
    // Bind canvas state FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.canvasStateFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.canvasStateTexture, 0);
    gl.viewport(0, 0, dims.width, dims.height);
    
    // Clear to transparent
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    // Composite the active layer FBO into canvas state texture
    const layerFBO = this.layerManager.getLayerFBO(activeLayerId);
    if (layerFBO && this.compositeProgram) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      
      gl.useProgram(this.compositeProgram);
      gl.bindVertexArray(this.compositeVAO);
      
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, layerFBO.texture);
      gl.uniform1i(this.compositeUniforms!.texture, 0);
      gl.uniform1f(this.compositeUniforms!.opacity, 1);
      
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      
      gl.bindVertexArray(null);
    }
    
    // NOTE: Do NOT composite the active stroke FBO here!
    // Including it causes self-sampling where the brush blends with its own paint,
    // creating muddy overlay effects. We only sample committed layer content.
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * Set grain offset for consistent screen-space grain
   */
  setGrainOffset(x: number, y: number): void {
    this.grainOffset = [x, y];
  }

  /**
   * Render an FBO texture to another FBO or screen
   */
  renderFBOToTarget(
    sourceFBO: LayerFBO,
    targetFBO: LayerFBO | null,
    opacity: number = 1,
    isEraser: boolean = false
  ): void {
    const gl = this.gl;
    if (!this.compositeProgram) return;
    
    // Bind target (null = screen)
    if (targetFBO) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO.framebuffer);
      gl.viewport(0, 0, targetFBO.width, targetFBO.height);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    }
    
    // Enable blending with proper paint layering
    gl.enable(gl.BLEND);
    if (isEraser) {
      gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    } else {
      // Premultiplied alpha blending for compositing
      gl.blendFuncSeparate(
        gl.ONE, gl.ONE_MINUS_SRC_ALPHA,  // RGB (premultiplied)
        gl.ONE, gl.ONE_MINUS_SRC_ALPHA   // Alpha
      );
    }
    
    // Use composite program
    gl.useProgram(this.compositeProgram);
    gl.bindVertexArray(this.compositeVAO);
    
    // Bind source texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceFBO.texture);
    gl.uniform1i(this.compositeUniforms!.texture, 0);
    gl.uniform1f(this.compositeUniforms!.opacity, opacity);
    
    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * Merge active stroke FBO into a layer FBO
   */
  mergeActiveStrokeToLayer(layerId: string, isEraser: boolean = false): void {
    const layerFBO = this.layerManager.getLayerFBO(layerId);
    const activeFBO = this.layerManager.getActiveStrokeFBO();
    
    if (!layerFBO || !activeFBO) return;
    
    this.renderFBOToTarget(activeFBO, layerFBO, 1, isEraser);
    this.layerManager.clearActiveStrokeFBO();
    
    // Reset wet mix counter for next stroke
    this.wetMixStampCounter = 0;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    const gl = this.gl;
    
    if (this.quadVAO) gl.deleteVertexArray(this.quadVAO);
    if (this.compositeVAO) gl.deleteVertexArray(this.compositeVAO);
    if (this.instanceBuffer) gl.deleteBuffer(this.instanceBuffer);
    if (this.stampProgram) gl.deleteProgram(this.stampProgram);
    if (this.compositeProgram) gl.deleteProgram(this.compositeProgram);
    
    // Delete canvas state texture and FBO
    if (this.canvasStateTexture) gl.deleteTexture(this.canvasStateTexture);
    if (this.canvasStateFBO) gl.deleteFramebuffer(this.canvasStateFBO);
    
    // Delete brush tip textures
    this.brushTipTextures.forEach(texture => {
      gl.deleteTexture(texture);
    });
    this.brushTipTextures.clear();
  }
}
