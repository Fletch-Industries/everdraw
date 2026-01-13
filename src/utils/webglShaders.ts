/**
 * WebGL Shaders for texture-based brush stamp rendering
 */

// Vertex shader for texture-based brush stamps (instanced rendering)
// Supports aspect ratio for elongated brush tips (pencil bristles, flat brushes)
export const STAMP_VERTEX_SHADER = `#version 300 es
precision highp float;

// Per-vertex attributes (quad corners)
in vec2 a_position;
in vec2 a_texCoord;

// Per-instance attributes
in vec2 a_stampPosition;
in float a_stampSize;
in float a_stampRotation;
in float a_stampPressure;
in float a_stampOpacity;
in vec3 a_stampColor;
in float a_stampAspectRatio; // Aspect ratio for elongated stamps (width/height)

// Uniforms
uniform vec2 u_resolution;

// Outputs to fragment shader
out vec2 v_texCoord;
out float v_pressure;
out float v_opacity;
out vec3 v_color;

void main() {
  // Rotate the quad
  float c = cos(a_stampRotation);
  float s = sin(a_stampRotation);
  mat2 rotation = mat2(c, -s, s, c);
  
  // Scale the quad with aspect ratio support
  // Aspect ratio stretches along the X axis (stroke direction when rotated)
  vec2 scaled = a_position * a_stampSize * 0.5;
  scaled.x *= a_stampAspectRatio; // Apply aspect ratio stretch
  vec2 rotated = rotation * scaled;
  
  // Position in canvas space (already in physical pixels)
  vec2 canvasPos = a_stampPosition + rotated;
  
  // Convert to clip space (-1 to 1)
  vec2 clipPos = (canvasPos / u_resolution) * 2.0 - 1.0;
  clipPos.y = -clipPos.y; // Flip Y for canvas coordinates
  
  gl_Position = vec4(clipPos, 0.0, 1.0);
  
  // Transform texture coordinates for rotation
  v_texCoord = a_texCoord;
  v_pressure = a_stampPressure;
  v_opacity = a_stampOpacity;
  v_color = a_stampColor;
}
`;

// Fragment shader for texture-based brush stamps with wet mixing support
// Enhanced with paper tooth masking for authentic pencil feel
export const STAMP_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texCoord;
in float v_pressure;
in float v_opacity;
in vec3 v_color;

uniform sampler2D u_brushTip;
uniform float u_grainAmount;
uniform vec2 u_grainOffset; // For screen-space grain consistency

// Pencil-specific uniforms
uniform bool u_isPencil;        // Whether this is a pencil brush
uniform float u_paperGrain;     // Paper texture interaction strength (0-1)
uniform float u_tiltFactor;     // Tilt amount (0 = upright, 1 = flat/shading)

// Wet mixing uniforms
uniform bool u_wetMixEnabled;
uniform float u_wetMixDilution;    // Color pickup amount (0-1)
uniform float u_wetMixCharge;      // Paint load (0-1) - higher = less pickup
uniform float u_wetMixPull;        // Smudge strength (0-1)
uniform sampler2D u_canvasTexture; // Current canvas state for sampling
uniform vec2 u_canvasSize;         // Canvas dimensions for sampling

out vec4 fragColor;

// Simple noise function for grain
float noise(vec2 st) {
  return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453);
}

// Multi-octave noise for realistic paper texture
float paperNoise(vec2 st) {
  float n = noise(st * 0.7);
  n += noise(st * 1.4) * 0.5;
  n += noise(st * 2.8) * 0.25;
  n += noise(st * 5.6) * 0.125;
  return n / 1.875;
}

// FBM noise for more organic paper tooth
float fbmPaper(vec2 st) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(st * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  // Sample brush tip texture (grayscale alpha mask)
  vec4 tipSample = texture(u_brushTip, v_texCoord);
  float alpha = tipSample.r; // Brush tip is grayscale, use red channel
  
  // Apply grain using screen-space coordinates for consistency
  if (u_grainAmount > 0.0) {
    vec2 grainCoord = (gl_FragCoord.xy + u_grainOffset) * 0.1;
    float grain = noise(grainCoord);
    alpha *= mix(1.0, grain, u_grainAmount * 0.3);
  }
  
  // Pencil-specific: PAPER TOOTH MASKING
  // This is the key to the "soft sketch start" feel
  // Low pressure = graphite only catches on high-tooth areas (broken, sketchy)
  // High pressure = fills more continuously (darker, smoother)
  vec3 finalColor = v_color;
  if (u_isPencil && u_paperGrain > 0.0) {
    // Sample paper texture at screen position (consistent across all strokes)
    vec2 paperCoord = gl_FragCoord.xy * 0.12;
    float paper = fbmPaper(paperCoord);
    
    // PRESSURE-DEPENDENT TOOTH THRESHOLD
    // Low pressure (0.1) -> threshold ~0.7 (only high-tooth areas catch)
    // High pressure (1.0) -> threshold ~0.25 (most areas catch)
    float threshold = mix(0.72, 0.25, pow(v_pressure, 0.6));
    
    // Soft edge around threshold for natural blending
    float edgeWidth = 0.12;
    float paperCatch = smoothstep(threshold - edgeWidth, threshold + edgeWidth, paper);
    
    // Apply paper grain effect - stronger when tilted (shading mode)
    float paperEffect = u_paperGrain * mix(0.6, 1.0, u_tiltFactor);
    alpha *= mix(1.0, paperCatch, paperEffect);
    
    // Additional grain breaking at low pressure
    if (v_pressure < 0.4) {
      float breakNoise = noise(gl_FragCoord.xy * 0.25);
      float breakThreshold = (0.4 - v_pressure) * 1.5; // More breaking at lower pressure
      if (breakNoise < breakThreshold * 0.3) {
        alpha *= 0.3; // Partial break
      }
    }
    
    // Subtle graphite shimmer/value variation
    float shimmer = (noise(gl_FragCoord.xy * 0.35) - 0.5) * 0.1 * u_paperGrain;
    finalColor = clamp(finalColor + vec3(shimmer), 0.0, 1.0);
  }
  
  // Apply pressure and opacity
  alpha *= v_pressure * v_opacity;
  
  // Discard fully transparent pixels
  if (alpha < 0.002) discard;
  
  // Wet mixing: blend with canvas color
  if (u_wetMixEnabled) {
    // Sample canvas at this fragment's position
    vec2 canvasUV = gl_FragCoord.xy / u_canvasSize;
    canvasUV.y = 1.0 - canvasUV.y; // Flip Y for WebGL texture coordinates
    vec4 canvasSample = texture(u_canvasTexture, canvasUV);
    
    // Only mix if canvas has content (non-zero alpha)
    if (canvasSample.a > 0.01) {
      // Unpremultiply the canvas color
      vec3 canvasColor = canvasSample.rgb / max(canvasSample.a, 0.01);
      
      // Charge reduces color pickup - high charge = more fresh paint, less pickup
      // Use quadratic falloff for more natural feel
      float chargeReduction = u_wetMixCharge * u_wetMixCharge;
      float effectiveDilution = u_wetMixDilution * (1.0 - chargeReduction);
      
      // Blend based on effective dilution and canvas alpha
      float mixFactor = effectiveDilution * canvasSample.a;
      finalColor = mix(finalColor, canvasColor, mixFactor);
      
      // Pull effect: smudge existing paint
      if (u_wetMixPull > 0.0) {
        // Pull picks up canvas color more strongly
        float pullMix = u_wetMixPull * canvasSample.a * 0.7;
        finalColor = mix(finalColor, canvasColor, pullMix);
        // Slightly boost alpha for smudge effect
        alpha = mix(alpha, min(alpha * 1.3, 1.0), u_wetMixPull * canvasSample.a * 0.3);
      }
    }
  }
  
  // Output with premultiplied alpha
  fragColor = vec4(finalColor * alpha, alpha);
}
`;

// Vertex shader for layer compositing (full-screen quad)
export const COMPOSITE_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;

out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

// Fragment shader for layer compositing
export const COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_opacity;

out vec4 fragColor;

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  // Apply opacity to premultiplied color (scale both RGB and alpha)
  fragColor = vec4(color.rgb * u_opacity, color.a * u_opacity);
}
`;

// Utility function to compile a shader
export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  
  return shader;
}

// Utility function to create a shader program
export function createProgram(
  gl: WebGL2RenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader
): WebGLProgram | null {
  const program = gl.createProgram();
  if (!program) return null;
  
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  
  return program;
}

// Create the stamp rendering program
export function createStampProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, STAMP_VERTEX_SHADER);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, STAMP_FRAGMENT_SHADER);
  
  if (!vertexShader || !fragmentShader) return null;
  
  return createProgram(gl, vertexShader, fragmentShader);
}

// Create the composite rendering program
export function createCompositeProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, COMPOSITE_VERTEX_SHADER);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, COMPOSITE_FRAGMENT_SHADER);
  
  if (!vertexShader || !fragmentShader) return null;
  
  return createProgram(gl, vertexShader, fragmentShader);
}
