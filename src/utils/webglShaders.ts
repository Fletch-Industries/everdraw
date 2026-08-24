/**
 * WebGL shaders for instanced brush-stamp rendering and layer compositing.
 */

// Instanced stamp rendering. Each instance: position(2), size, rotation,
// pressure, opacity, color(3), aspectRatio = 10 floats.
export const STAMP_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;

in vec2 a_stampPosition;
in float a_stampSize;
in float a_stampRotation;
in float a_stampPressure;
in float a_stampOpacity;
in vec3 a_stampColor;
in float a_stampAspectRatio;

uniform vec2 u_resolution;

out vec2 v_texCoord;
out float v_pressure;
out float v_opacity;
out vec3 v_color;

void main() {
  float c = cos(a_stampRotation);
  float s = sin(a_stampRotation);
  mat2 rotation = mat2(c, -s, s, c);

  vec2 scaled = a_position * a_stampSize * 0.5;
  scaled.x *= a_stampAspectRatio;
  vec2 canvasPos = a_stampPosition + rotation * scaled;

  vec2 clipPos = (canvasPos / u_resolution) * 2.0 - 1.0;
  clipPos.y = -clipPos.y;

  gl_Position = vec4(clipPos, 0.0, 1.0);
  v_texCoord = a_texCoord;
  v_pressure = a_stampPressure;
  v_opacity = a_stampOpacity;
  v_color = a_stampColor;
}
`;

export const STAMP_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texCoord;
in float v_pressure;
in float v_opacity;
in vec3 v_color;

uniform sampler2D u_brushTip;
uniform sampler2D u_grain;

uniform float u_grainAmount;   // 0 = no grain
uniform float u_grainScale;    // canvas px -> grain UV
uniform float u_pressureTooth; // 1 = paper-tooth mode (pencil/charcoal/chalk)

out vec4 fragColor;

void main() {
  float alpha = texture(u_brushTip, v_texCoord).r;

  if (u_grainAmount > 0.001) {
    float g = texture(u_grain, gl_FragCoord.xy * u_grainScale).r;
    if (u_pressureTooth > 0.5) {
      // Paper tooth: light pressure only catches the high spots of the paper;
      // heavy pressure fills the valleys too.
      float threshold = mix(0.78, 0.18, pow(v_pressure, 0.7));
      float caught = smoothstep(threshold - 0.22, threshold + 0.22, g);
      alpha *= mix(1.0, caught, u_grainAmount);
    } else {
      alpha *= mix(1.0, 0.45 + 0.65 * g, u_grainAmount);
    }
  }

  alpha *= v_opacity;
  if (alpha < 0.002) discard;

  // Premultiplied alpha output
  fragColor = vec4(v_color * alpha, alpha);
}
`;

// Full-screen quad compositing
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

// Optional wet-edge darkening: pigment pools at the spatial boundary of a wet
// stroke, so we darken where the alpha gradient is steep (true edges), not
// merely where alpha happens to be low.
export const COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_opacity;
uniform float u_wetEdge;   // 0 = off
uniform vec2 u_texelSize;

out vec4 fragColor;

void main() {
  vec4 color = texture(u_texture, v_texCoord);

  if (u_wetEdge > 0.001 && color.a > 0.01) {
    // Wide kernel so soft (watercolor) boundaries register too.
    vec2 o = u_texelSize * 2.5;
    float aL = texture(u_texture, v_texCoord - vec2(o.x, 0.0)).a;
    float aR = texture(u_texture, v_texCoord + vec2(o.x, 0.0)).a;
    float aB = texture(u_texture, v_texCoord - vec2(0.0, o.y)).a;
    float aT = texture(u_texture, v_texCoord + vec2(0.0, o.y)).a;
    float grad = length(vec2(aR - aL, aT - aB));
    float edge = smoothstep(0.008, 0.06, grad);
    // Darken pigment at the rim; slight alpha boost so the rim reads.
    color.rgb *= 1.0 - u_wetEdge * 0.5 * edge;
    color.a = min(1.0, color.a * (1.0 + u_wetEdge * 0.25 * edge));
  }

  fragColor = vec4(color.rgb * u_opacity, color.a * u_opacity);
}
`;

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

export function createStampProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, STAMP_VERTEX_SHADER);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, STAMP_FRAGMENT_SHADER);
  if (!vs || !fs) return null;
  return createProgram(gl, vs, fs);
}

export function createCompositeProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, COMPOSITE_VERTEX_SHADER);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, COMPOSITE_FRAGMENT_SHADER);
  if (!vs || !fs) return null;
  return createProgram(gl, vs, fs);
}
