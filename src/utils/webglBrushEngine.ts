/**
 * WebGL Brush Engine - GPU-accelerated instanced stamp rendering.
 *
 * Renders stroke stamps into an active-stroke FBO, composites layer FBOs,
 * and provides undo/redo layer snapshots plus a CPU pixel sampler for
 * deterministic wet mixing.
 */

import { BrushType, Layer } from '@/types/drawing';
import { CustomBrushPreset } from '@/types/customBrush';
import { Stamp, PixelSampler } from './strokeSession';
import { EngineBrushPreset } from './brushPresets';
import { createStampProgram, createCompositeProgram, compileShader, createProgram } from './webglShaders';
import { WebGLLayerManager, LayerFBO } from './webglLayerManager';
import { getBrushTipTexture, uploadBrushTipToGL, uploadGrainToGL } from './brushTipGenerator';

const MAX_STAMPS_PER_BATCH = 8192;
const FLOATS_PER_STAMP = 10;

// Positioned, rotated textured quad (reference images)
const IMAGE_VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 a_position;
in vec2 a_texCoord;
uniform vec2 u_resolution;
uniform vec2 u_center;   // canvas px
uniform vec2 u_halfSize; // canvas px
uniform float u_rotation;
out vec2 v_texCoord;
void main() {
  float c = cos(u_rotation);
  float s = sin(u_rotation);
  vec2 p = a_position * u_halfSize;
  vec2 rotated = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  vec2 canvasPos = u_center + rotated;
  vec2 clip = (canvasPos / u_resolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  v_texCoord = vec2(a_texCoord.x, 1.0 - a_texCoord.y);
}
`;

const IMAGE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_opacity;
out vec4 fragColor;
void main() {
  vec4 color = texture(u_texture, v_texCoord);
  fragColor = vec4(color.rgb * color.a * u_opacity, color.a * u_opacity);
}
`;

export interface StampRenderOptions {
  brushType: BrushType | string;
  customBrush?: CustomBrushPreset;
  preset: EngineBrushPreset;
  isEraser?: boolean;
  dpr: number;
  /** Render directly to the screen instead of the active-stroke FBO. */
  toScreen?: boolean;
  /** Render into a specific FBO instead of the active-stroke FBO. */
  targetFBO?: LayerFBO;
  /** Extra alpha multiplier applied per stamp. */
  opacityScale?: number;
}

export class WebGLBrushEngine {
  private gl: WebGL2RenderingContext;
  private layerManager: WebGLLayerManager;

  private stampProgram: WebGLProgram | null = null;
  private compositeProgram: WebGLProgram | null = null;

  private quadVAO: WebGLVertexArrayObject | null = null;
  private compositeVAO: WebGLVertexArrayObject | null = null;
  private instanceBuffer: WebGLBuffer | null = null;
  private instanceData: Float32Array;

  private brushTipTextures = new Map<string, WebGLTexture>();
  private grainTexture: WebGLTexture | null = null;

  private stampUniforms: {
    resolution: WebGLUniformLocation | null;
    brushTip: WebGLUniformLocation | null;
    grain: WebGLUniformLocation | null;
    grainAmount: WebGLUniformLocation | null;
    grainScale: WebGLUniformLocation | null;
    pressureTooth: WebGLUniformLocation | null;
  } | null = null;

  private compositeUniforms: {
    texture: WebGLUniformLocation | null;
    opacity: WebGLUniformLocation | null;
    wetEdge: WebGLUniformLocation | null;
    texelSize: WebGLUniformLocation | null;
  } | null = null;

  private imageProgram: WebGLProgram | null = null;
  private imageVAO: WebGLVertexArrayObject | null = null;
  private imageUniforms: {
    resolution: WebGLUniformLocation | null;
    center: WebGLUniformLocation | null;
    halfSize: WebGLUniformLocation | null;
    rotation: WebGLUniformLocation | null;
    texture: WebGLUniformLocation | null;
    opacity: WebGLUniformLocation | null;
  } | null = null;
  private imageTextures = new Map<string, WebGLTexture>();

  constructor(gl: WebGL2RenderingContext, layerManager: WebGLLayerManager) {
    this.gl = gl;
    this.layerManager = layerManager;
    this.instanceData = new Float32Array(MAX_STAMPS_PER_BATCH * FLOATS_PER_STAMP);
    this.initializeShaders();
    this.initializeBuffers();
    this.grainTexture = uploadGrainToGL(gl);
  }

  private initializeShaders(): void {
    const gl = this.gl;

    this.stampProgram = createStampProgram(gl);
    if (this.stampProgram) {
      this.stampUniforms = {
        resolution: gl.getUniformLocation(this.stampProgram, 'u_resolution'),
        brushTip: gl.getUniformLocation(this.stampProgram, 'u_brushTip'),
        grain: gl.getUniformLocation(this.stampProgram, 'u_grain'),
        grainAmount: gl.getUniformLocation(this.stampProgram, 'u_grainAmount'),
        grainScale: gl.getUniformLocation(this.stampProgram, 'u_grainScale'),
        pressureTooth: gl.getUniformLocation(this.stampProgram, 'u_pressureTooth'),
      };
    }

    this.compositeProgram = createCompositeProgram(gl);
    if (this.compositeProgram) {
      this.compositeUniforms = {
        texture: gl.getUniformLocation(this.compositeProgram, 'u_texture'),
        opacity: gl.getUniformLocation(this.compositeProgram, 'u_opacity'),
        wetEdge: gl.getUniformLocation(this.compositeProgram, 'u_wetEdge'),
        texelSize: gl.getUniformLocation(this.compositeProgram, 'u_texelSize'),
      };
    }

    const imageVS = compileShader(gl, gl.VERTEX_SHADER, IMAGE_VERTEX_SHADER);
    const imageFS = compileShader(gl, gl.FRAGMENT_SHADER, IMAGE_FRAGMENT_SHADER);
    if (imageVS && imageFS) {
      this.imageProgram = createProgram(gl, imageVS, imageFS);
      if (this.imageProgram) {
        this.imageUniforms = {
          resolution: gl.getUniformLocation(this.imageProgram, 'u_resolution'),
          center: gl.getUniformLocation(this.imageProgram, 'u_center'),
          halfSize: gl.getUniformLocation(this.imageProgram, 'u_halfSize'),
          rotation: gl.getUniformLocation(this.imageProgram, 'u_rotation'),
          texture: gl.getUniformLocation(this.imageProgram, 'u_texture'),
          opacity: gl.getUniformLocation(this.imageProgram, 'u_opacity'),
        };
      }
    }
  }

  private initializeBuffers(): void {
    const gl = this.gl;

    const quadVertices = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
       1,  1, 1, 1,
      -1, -1, 0, 0,
       1,  1, 1, 1,
      -1,  1, 0, 1,
    ]);

    // Stamp VAO
    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);

    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(this.stampProgram!, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);

    const texLoc = gl.getAttribLocation(this.stampProgram!, 'a_texCoord');
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);

    this.instanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);

    const stride = FLOATS_PER_STAMP * 4;
    const instanceAttrs: Array<[string, number, number]> = [
      ['a_stampPosition', 2, 0],
      ['a_stampSize', 1, 8],
      ['a_stampRotation', 1, 12],
      ['a_stampPressure', 1, 16],
      ['a_stampOpacity', 1, 20],
      ['a_stampColor', 3, 24],
      ['a_stampAspectRatio', 1, 36],
    ];
    for (const [name, size, offset] of instanceAttrs) {
      const loc = gl.getAttribLocation(this.stampProgram!, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
      gl.vertexAttribDivisor(loc, 1);
    }

    gl.bindVertexArray(null);

    // Composite VAO
    this.compositeVAO = gl.createVertexArray();
    gl.bindVertexArray(this.compositeVAO);

    const compositeBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, compositeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    const cPosLoc = gl.getAttribLocation(this.compositeProgram!, 'a_position');
    gl.enableVertexAttribArray(cPosLoc);
    gl.vertexAttribPointer(cPosLoc, 2, gl.FLOAT, false, 16, 0);

    const cTexLoc = gl.getAttribLocation(this.compositeProgram!, 'a_texCoord');
    gl.enableVertexAttribArray(cTexLoc);
    gl.vertexAttribPointer(cTexLoc, 2, gl.FLOAT, false, 16, 8);

    gl.bindVertexArray(null);

    // Image VAO
    if (this.imageProgram) {
      this.imageVAO = gl.createVertexArray();
      gl.bindVertexArray(this.imageVAO);

      const imageBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, imageBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

      const iPosLoc = gl.getAttribLocation(this.imageProgram, 'a_position');
      gl.enableVertexAttribArray(iPosLoc);
      gl.vertexAttribPointer(iPosLoc, 2, gl.FLOAT, false, 16, 0);

      const iTexLoc = gl.getAttribLocation(this.imageProgram, 'a_texCoord');
      gl.enableVertexAttribArray(iTexLoc);
      gl.vertexAttribPointer(iTexLoc, 2, gl.FLOAT, false, 16, 8);

      gl.bindVertexArray(null);
    }
  }

  private getBrushTipGLTexture(brushType: BrushType | string, customBrush?: CustomBrushPreset): WebGLTexture | null {
    const tip = getBrushTipTexture(brushType, customBrush);
    // Cache GL textures by the generated tip canvas identity (already de-duped
    // by parameter in the tip cache), so parameter edits always take effect.
    const key = `${brushType}:${customBrush?.id ?? ''}:${customBrush?.updatedAt ?? ''}`;
    let glTexture = this.brushTipTextures.get(key) ?? null;
    if (!glTexture) {
      glTexture = uploadBrushTipToGL(this.gl, tip);
      if (glTexture) this.brushTipTextures.set(key, glTexture);
    }
    return glTexture;
  }

  /**
   * Render a batch of stamps into the active-stroke FBO (or the screen).
   */
  renderStamps(stamps: Stamp[], opts: StampRenderOptions): void {
    if (stamps.length === 0) return;

    const gl = this.gl;
    if (!this.stampProgram || !this.stampUniforms) return;

    const brushTipTexture = this.getBrushTipGLTexture(opts.brushType, opts.customBrush);
    if (!brushTipTexture) return;

    let width: number;
    let height: number;
    if (opts.toScreen) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      width = gl.canvas.width;
      height = gl.canvas.height;
    } else {
      const targetFBO = opts.targetFBO ?? this.layerManager.getActiveStrokeFBO();
      if (!targetFBO) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO.framebuffer);
      width = targetFBO.width;
      height = targetFBO.height;
    }
    gl.viewport(0, 0, width, height);

    gl.enable(gl.BLEND);
    if (opts.preset.blend === 'add' && !opts.isEraser) {
      gl.blendFunc(gl.ONE, gl.ONE);
    } else {
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }

    gl.useProgram(this.stampProgram);
    gl.bindVertexArray(this.quadVAO);

    gl.uniform2f(this.stampUniforms.resolution, width, height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, brushTipTexture);
    gl.uniform1i(this.stampUniforms.brushTip, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.grainTexture);
    gl.uniform1i(this.stampUniforms.grain, 1);

    const grainAmount = opts.isEraser ? 0 : opts.preset.grainAmount;
    gl.uniform1f(this.stampUniforms.grainAmount, grainAmount);
    // gl_FragCoord is in physical pixels; keep grain size constant in canvas units.
    gl.uniform1f(this.stampUniforms.grainScale, opts.preset.grainScale / Math.max(1, opts.dpr));
    gl.uniform1f(this.stampUniforms.pressureTooth, opts.preset.pressureTooth ? 1 : 0);

    const dpr = opts.dpr;
    const opacityScale = opts.opacityScale ?? 1;
    const numBatches = Math.ceil(stamps.length / MAX_STAMPS_PER_BATCH);
    for (let batch = 0; batch < numBatches; batch++) {
      const start = batch * MAX_STAMPS_PER_BATCH;
      const end = Math.min(start + MAX_STAMPS_PER_BATCH, stamps.length);
      const count = end - start;

      for (let i = 0; i < count; i++) {
        const stamp = stamps[start + i];
        const o = i * FLOATS_PER_STAMP;
        this.instanceData[o] = stamp.x * dpr;
        this.instanceData[o + 1] = stamp.y * dpr;
        this.instanceData[o + 2] = stamp.size * dpr;
        this.instanceData[o + 3] = stamp.angle;
        this.instanceData[o + 4] = stamp.pressure;
        this.instanceData[o + 5] = stamp.opacity * opacityScale;
        this.instanceData[o + 6] = stamp.color.r / 255;
        this.instanceData[o + 7] = stamp.color.g / 255;
        this.instanceData[o + 8] = stamp.color.b / 255;
        this.instanceData[o + 9] = stamp.aspectRatio ?? 1;
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData.subarray(0, count * FLOATS_PER_STAMP));
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
    }

    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Draw an FBO's texture onto a target (another FBO or the screen).
   */
  renderFBOToTarget(
    sourceFBO: LayerFBO,
    targetFBO: LayerFBO | null,
    opacity: number = 1,
    isEraser: boolean = false,
    wetEdge: number = 0
  ): void {
    this.drawTextureToTarget(sourceFBO.texture, sourceFBO.width, sourceFBO.height, targetFBO, opacity, isEraser, wetEdge);
  }

  private drawTextureToTarget(
    texture: WebGLTexture,
    sourceWidth: number,
    sourceHeight: number,
    targetFBO: LayerFBO | null,
    opacity: number = 1,
    isEraser: boolean = false,
    wetEdge: number = 0
  ): void {
    const gl = this.gl;
    if (!this.compositeProgram || !this.compositeUniforms) return;

    if (targetFBO) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO.framebuffer);
      gl.viewport(0, 0, targetFBO.width, targetFBO.height);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    }

    gl.enable(gl.BLEND);
    if (isEraser) {
      gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    } else {
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }

    gl.useProgram(this.compositeProgram);
    gl.bindVertexArray(this.compositeVAO);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.compositeUniforms.texture, 0);
    gl.uniform1f(this.compositeUniforms.opacity, opacity);
    gl.uniform1f(this.compositeUniforms.wetEdge, wetEdge);
    gl.uniform2f(this.compositeUniforms.texelSize, 1 / sourceWidth, 1 / sourceHeight);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * Merge the active-stroke FBO into a layer FBO and clear it.
   * `opacity` is the brush opacity slider — the glaze model composites the
   * whole stroke at this alpha (erase strength for eraser strokes).
   */
  mergeActiveStrokeToLayer(layerId: string, isEraser: boolean = false, opacity: number = 1, wetEdge: number = 0): void {
    const layerFBO = this.layerManager.getLayerFBO(layerId);
    const activeFBO = this.layerManager.getActiveStrokeFBO();
    if (!layerFBO || !activeFBO) return;

    this.renderFBOToTarget(activeFBO, layerFBO, opacity, isEraser, isEraser ? 0 : wetEdge);
    this.layerManager.clearActiveStrokeFBO();
  }

  /**
   * Copy a layer's current pixels into a snapshot slot (fast undo/redo path).
   */
  snapshotLayer(layerId: string, slot: 'undo' | 'redo'): boolean {
    const gl = this.gl;
    const layerFBO = this.layerManager.getLayerFBO(layerId);
    const snapshotFBO = this.layerManager.getSnapshotFBO(slot);
    if (!layerFBO || !snapshotFBO) return false;

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, layerFBO.framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, snapshotFBO.framebuffer);
    gl.blitFramebuffer(
      0, 0, layerFBO.width, layerFBO.height,
      0, 0, snapshotFBO.width, snapshotFBO.height,
      gl.COLOR_BUFFER_BIT, gl.NEAREST
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }

  /**
   * Restore a layer's pixels from a snapshot slot.
   */
  restoreLayerSnapshot(layerId: string, slot: 'undo' | 'redo'): boolean {
    const gl = this.gl;
    const layerFBO = this.layerManager.getLayerFBO(layerId);
    const snapshotFBO = this.layerManager.getSnapshotFBO(slot);
    if (!layerFBO || !snapshotFBO) return false;

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, snapshotFBO.framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, layerFBO.framebuffer);
    gl.blitFramebuffer(
      0, 0, snapshotFBO.width, snapshotFBO.height,
      0, 0, layerFBO.width, layerFBO.height,
      gl.COLOR_BUFFER_BIT, gl.NEAREST
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }

  /**
   * Composite a layer plus the active stroke into the scratch FBO, so the
   * live preview (including erasing) only affects that layer's pixels.
   */
  compositeLayerWithActiveStroke(
    layerFBO: LayerFBO,
    isEraser: boolean,
    strokeOpacity: number = 1,
    wetEdge: number = 0,
    tailStamps?: Stamp[],
    tailOpts?: StampRenderOptions
  ): LayerFBO | null {
    const gl = this.gl;
    const scratch = this.layerManager.getScratchFBO();
    const activeFBO = this.layerManager.getActiveStrokeFBO();
    if (!scratch || !activeFBO) return null;

    // The predicted tail joins the stroke in FLOW space (before the opacity
    // slider is applied), so the preview never double-darkens where the tail
    // overlaps already-rendered stamps.
    let strokeSource: LayerFBO = activeFBO;
    if (tailStamps && tailStamps.length > 0 && tailOpts) {
      const strokeScratch = this.layerManager.getStrokeScratchFBO();
      if (strokeScratch) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, strokeScratch.framebuffer);
        gl.viewport(0, 0, strokeScratch.width, strokeScratch.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.renderFBOToTarget(activeFBO, strokeScratch, 1, false);
        this.renderStamps(tailStamps, { ...tailOpts, targetFBO: strokeScratch, toScreen: false });
        strokeSource = strokeScratch;
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, scratch.framebuffer);
    gl.viewport(0, 0, scratch.width, scratch.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.renderFBOToTarget(layerFBO, scratch, 1, false);
    this.renderFBOToTarget(strokeSource, scratch, strokeOpacity, isEraser, isEraser ? 0 : wetEdge);
    return scratch;
  }

  /**
   * Build a CPU pixel sampler of all visible layers (alpha preserved, no
   * background) for wet mixing. Called once per wet stroke at pointer-down.
   */
  createWetMixSampler(layers: Layer[], dpr: number): PixelSampler | null {
    const gl = this.gl;
    // Composite into a small sampler FBO — color pickup only needs coarse
    // color, and a full-resolution readback stalls stroke start.
    const sampler = this.layerManager.getSamplerFBO();
    if (!sampler) return null;

    gl.bindFramebuffer(gl.FRAMEBUFFER, sampler.framebuffer);
    gl.viewport(0, 0, sampler.width, sampler.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    for (const layer of layers) {
      if (!layer.visible) continue;
      const fbo = this.layerManager.getLayerFBO(layer.id);
      if (fbo) this.renderFBOToTarget(fbo, sampler, layer.opacity);
    }

    const pixels = new Uint8Array(sampler.width * sampler.height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, sampler.framebuffer);
    gl.readPixels(0, 0, sampler.width, sampler.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const dims = this.layerManager.getDimensions();
    return {
      width: sampler.width,
      height: sampler.height,
      pixels,
      // canvas coords → sampler pixels (canvas physical = dims; sampler is scaled down)
      scale: dpr * (sampler.width / Math.max(1, dims.width)),
      flipY: true,
    };
  }

  /**
   * Upload (and cache) a reference image texture.
   */
  getImageTexture(id: string, image: HTMLImageElement): WebGLTexture | null {
    let texture = this.imageTextures.get(id) ?? null;
    if (texture) return texture;

    const gl = this.gl;
    texture = gl.createTexture();
    if (!texture) return null;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.imageTextures.set(id, texture);
    return texture;
  }

  pruneImageTextures(liveIds: Set<string>): void {
    const gl = this.gl;
    this.imageTextures.forEach((texture, id) => {
      if (!liveIds.has(id)) {
        gl.deleteTexture(texture);
        this.imageTextures.delete(id);
      }
    });
  }

  /**
   * Draw a textured quad (reference image) to the screen in canvas px.
   */
  drawImageToScreen(
    texture: WebGLTexture,
    centerX: number,
    centerY: number,
    width: number,
    height: number,
    rotation: number,
    opacity: number,
    dpr: number
  ): void {
    const gl = this.gl;
    if (!this.imageProgram || !this.imageUniforms || !this.imageVAO) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(this.imageProgram);
    gl.bindVertexArray(this.imageVAO);

    gl.uniform2f(this.imageUniforms.resolution, gl.canvas.width, gl.canvas.height);
    gl.uniform2f(this.imageUniforms.center, centerX * dpr, centerY * dpr);
    gl.uniform2f(this.imageUniforms.halfSize, (width / 2) * dpr, (height / 2) * dpr);
    gl.uniform1f(this.imageUniforms.rotation, rotation);
    gl.uniform1f(this.imageUniforms.opacity, opacity);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.imageUniforms.texture, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * Paint-bucket fill on a layer: flood-fills the contiguous region around
   * the seed (matching on the layer's own pixels, background-independent)
   * and composites the fill under the existing anti-aliased edges.
   * Deterministic given the layer content, so replay reproduces it exactly.
   */
  applyFillToLayer(layerId: string, canvasX: number, canvasY: number, color: string, dpr: number): boolean {
    const gl = this.gl;
    const layerFBO = this.layerManager.getLayerFBO(layerId);
    if (!layerFBO) return false;

    const { width, height } = layerFBO;
    const sx = Math.round(canvasX * dpr);
    // Seed in GL orientation (bottom-up) so no buffer flipping is needed.
    const sy = height - 1 - Math.round(canvasY * dpr);
    if (sx < 0 || sy < 0 || sx >= width || sy >= height) return false;

    const pixels = new Uint8Array(width * height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, layerFBO.framebuffer);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
    const fr = m ? parseInt(m[1], 16) : 0;
    const fg = m ? parseInt(m[2], 16) : 0;
    const fb = m ? parseInt(m[3], 16) : 0;

    const seedIdx = (sy * width + sx) * 4;
    const tr = pixels[seedIdx], tg = pixels[seedIdx + 1], tb = pixels[seedIdx + 2], ta = pixels[seedIdx + 3];
    const TOLERANCE = 40;
    const matches = (i: number): boolean => {
      const da = pixels[i + 3] - ta;
      // Alpha dominates the match: filling "empty" region must not creep
      // into painted strokes and vice versa.
      if (Math.abs(da) > TOLERANCE) return false;
      return (
        Math.abs(pixels[i] - tr) <= TOLERANCE &&
        Math.abs(pixels[i + 1] - tg) <= TOLERANCE &&
        Math.abs(pixels[i + 2] - tb) <= TOLERANCE
      );
    };

    // Scanline flood fill building a coverage mask.
    const mask = new Uint8Array(width * height);
    const stack: number[] = [sx, sy];
    while (stack.length > 0) {
      const y = stack.pop() as number;
      let x = stack.pop() as number;
      let i = y * width + x;
      if (mask[i] || !matches(i * 4)) continue;

      // Walk left
      while (x > 0 && !mask[i - 1] && matches((i - 1) * 4)) { x--; i--; }
      let spanAbove = false;
      let spanBelow = false;
      while (x < width && !mask[i] && matches(i * 4)) {
        mask[i] = 1;
        if (y > 0) {
          const below = i - width;
          const ok = !mask[below] && matches(below * 4);
          if (ok && !spanBelow) { stack.push(x, y - 1); spanBelow = true; }
          else if (!ok) spanBelow = false;
        }
        if (y < height - 1) {
          const above = i + width;
          const ok = !mask[above] && matches(above * 4);
          if (ok && !spanAbove) { stack.push(x, y + 1); spanAbove = true; }
          else if (!ok) spanAbove = false;
        }
        x++; i++;
      }
    }

    // 1px dilation so the fill tucks under anti-aliased stroke edges
    // instead of leaving a light halo.
    const dilated = new Uint8Array(mask);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (mask[i]) continue;
        if ((x > 0 && mask[i - 1]) || (x < width - 1 && mask[i + 1]) ||
            (y > 0 && mask[i - width]) || (y < height - 1 && mask[i + width])) {
          dilated[i] = 1;
        }
      }
    }

    // Fill texture (premultiplied, full alpha inside the region)
    const fillPixels = new Uint8Array(width * height * 4);
    for (let i = 0; i < dilated.length; i++) {
      if (dilated[i]) {
        const o = i * 4;
        fillPixels[o] = fr; fillPixels[o + 1] = fg; fillPixels[o + 2] = fb; fillPixels[o + 3] = 255;
      }
    }

    const fillTexture = gl.createTexture();
    if (!fillTexture) return false;
    gl.bindTexture(gl.TEXTURE_2D, fillTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, fillPixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Composite the fill UNDER existing content: draw fill over a copy is
    // wrong (halo); instead draw fill first then original layer on top.
    const scratch = this.layerManager.getScratchFBO();
    if (!scratch) { gl.deleteTexture(fillTexture); return false; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, scratch.framebuffer);
    gl.viewport(0, 0, scratch.width, scratch.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.drawTextureToTarget(fillTexture, width, height, scratch, 1);
    this.renderFBOToTarget(layerFBO, scratch, 1);

    // Copy the result back into the layer
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, scratch.framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, layerFBO.framebuffer);
    gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.deleteTexture(fillTexture);
    return true;
  }

  /**
   * Composite all visible layers (no background) into a 2D canvas with a
   * real alpha channel — the GL backbuffer is opaque, so transparent PNG
   * export needs this readback path.
   */
  renderLayersToTransparentCanvas(layers: Layer[]): HTMLCanvasElement | null {
    const gl = this.gl;
    const scratch = this.layerManager.getScratchFBO();
    if (!scratch) return null;

    gl.bindFramebuffer(gl.FRAMEBUFFER, scratch.framebuffer);
    gl.viewport(0, 0, scratch.width, scratch.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    for (const layer of layers) {
      if (!layer.visible) continue;
      const fbo = this.layerManager.getLayerFBO(layer.id);
      if (fbo) this.renderFBOToTarget(fbo, scratch, layer.opacity);
    }

    const { width, height } = scratch;
    const pixels = new Uint8Array(width * height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, scratch.framebuffer);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Un-premultiply and flip Y (GL rows are bottom-up; ImageData is straight alpha)
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      const src = (height - 1 - y) * width * 4;
      const dst = y * width * 4;
      for (let x = 0; x < width * 4; x += 4) {
        const a = pixels[src + x + 3];
        if (a > 0) {
          const inv = 255 / a;
          img.data[dst + x] = Math.min(255, pixels[src + x] * inv);
          img.data[dst + x + 1] = Math.min(255, pixels[src + x + 1] * inv);
          img.data[dst + x + 2] = Math.min(255, pixels[src + x + 2] * inv);
        }
        img.data[dst + x + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  dispose(): void {
    const gl = this.gl;

    if (this.quadVAO) gl.deleteVertexArray(this.quadVAO);
    if (this.compositeVAO) gl.deleteVertexArray(this.compositeVAO);
    if (this.imageVAO) gl.deleteVertexArray(this.imageVAO);
    if (this.instanceBuffer) gl.deleteBuffer(this.instanceBuffer);
    if (this.stampProgram) gl.deleteProgram(this.stampProgram);
    if (this.compositeProgram) gl.deleteProgram(this.compositeProgram);
    if (this.imageProgram) gl.deleteProgram(this.imageProgram);
    if (this.grainTexture) gl.deleteTexture(this.grainTexture);

    this.brushTipTextures.forEach(texture => gl.deleteTexture(texture));
    this.brushTipTextures.clear();
    this.imageTextures.forEach(texture => gl.deleteTexture(texture));
    this.imageTextures.clear();
  }
}
