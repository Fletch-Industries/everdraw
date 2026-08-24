import { Point, BrushType, Stroke, WetMixSettings } from '@/types/drawing';
import { CustomBrushPreset, PressureCurve, PRESSURE_CURVE_PRESETS } from '@/types/customBrush';

// Simple noise function for texture
const noise = (x: number, y: number): number => {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
};

// ============= OPTIMIZED ERASER RENDERER =============
// Simple, fast eraser that uses basic line drawing instead of complex brush rendering
// This prevents iPad crashes during large erasing operations

export const renderEraserStroke = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  size: number,
  startIndex: number = 0
) => {
  if (points.length < 2) return;
  
  const start = Math.max(startIndex, 1);
  if (start >= points.length) return;
  
  // Simple pressure-sensitive line - no bristles, no texture, no color blending
  // Just a smooth line with destination-out composite operation
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'white'; // Color doesn't matter for destination-out
  
  // Draw continuous path for better performance
  ctx.beginPath();
  
  const firstPoint = points[start - 1];
  ctx.moveTo(firstPoint.x, firstPoint.y);
  
  for (let i = start; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    
    // Average pressure between points
    const pressure = Math.max(0.3, (p1.pressure + p2.pressure) / 2);
    ctx.lineWidth = size * pressure;
    
    // Use quadratic curve for smoother lines
    if (i < points.length - 1) {
      const p3 = points[i + 1];
      const midX = (p2.x + p3.x) / 2;
      const midY = (p2.y + p3.y) / 2;
      ctx.quadraticCurveTo(p2.x, p2.y, midX, midY);
    } else {
      ctx.lineTo(p2.x, p2.y);
    }
  }
  
  ctx.stroke();
};

// Decimate points for long strokes - reduces memory and rendering load
// Uses Ramer-Douglas-Peucker-like simplification based on distance
export const decimatePoints = (points: Point[], tolerance: number = 1.5): Point[] => {
  if (points.length <= 10) return points;
  
  const result: Point[] = [points[0]];
  let lastKept = points[0];
  
  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i];
    const dx = point.x - lastKept.x;
    const dy = point.y - lastKept.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // Keep point if it's far enough from last kept point
    // Also keep every Nth point to maintain stroke quality
    if (dist >= tolerance || i % 3 === 0) {
      result.push(point);
      lastKept = point;
    }
  }
  
  // Always keep the last point
  result.push(points[points.length - 1]);
  
  return result;
};

// Apply pressure curve to input pressure
const applyPressureCurve = (inputPressure: number, curve: PressureCurve): number => {
  const points = curve.points;
  if (points.length < 2) return inputPressure;
  
  // Clamp input
  const p = Math.max(0, Math.min(1, inputPressure));
  
  // Find the two points to interpolate between
  let lower = points[0];
  let upper = points[points.length - 1];
  
  for (let i = 0; i < points.length - 1; i++) {
    if (p >= points[i].x && p <= points[i + 1].x) {
      lower = points[i];
      upper = points[i + 1];
      break;
    }
  }
  
  // Linear interpolation between the two points
  if (upper.x === lower.x) return lower.y;
  const t = (p - lower.x) / (upper.x - lower.x);
  return lower.y + (upper.y - lower.y) * t;
};

// Calculate distance between two points
const distance = (p1: Point, p2: Point): number => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

// Calculate angle between two points
const angle = (p1: Point, p2: Point): number => {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x);
};

// Interpolate between points for smooth strokes
const interpolatePoints = (p1: Point, p2: Point, steps: number): Point[] => {
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({
      x: p1.x + (p2.x - p1.x) * t,
      y: p1.y + (p2.y - p1.y) * t,
      pressure: p1.pressure + (p2.pressure - p1.pressure) * t,
      timestamp: p1.timestamp + (p2.timestamp - p1.timestamp) * t,
    });
  }
  return points;
};

// Parse hex color to RGB
const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 255, g: 255, b: 255 };
};

// Convert RGB to hex
const rgbToHex = (r: number, g: number, b: number): string => {
  const toHex = (c: number) => {
    const hex = Math.max(0, Math.min(255, Math.round(c))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

// ============= WET MIXING UTILITIES =============

// Sample color from canvas at a specific point (with radius for averaging)
// DPR parameter is critical - canvas getImageData works in actual pixels, not logical pixels
export const sampleCanvasColor = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number = 2,
  dpr: number = 1
): { r: number; g: number; b: number; a: number } => {
  const sampleRadius = Math.max(1, Math.floor(radius));
  const diameter = sampleRadius * 2 + 1;
  
  // Scale coordinates by DPR for getImageData (which works in actual canvas pixels)
  const scaledX = Math.floor((x - sampleRadius) * dpr);
  const scaledY = Math.floor((y - sampleRadius) * dpr);
  const scaledDiameter = Math.floor(diameter * dpr);
  
  // Bounds check to prevent sampling outside canvas
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;
  
  if (scaledX < 0 || scaledY < 0 || 
      scaledX + scaledDiameter > canvasWidth || 
      scaledY + scaledDiameter > canvasHeight) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  
  try {
    const imageData = ctx.getImageData(
      scaledX,
      scaledY,
      scaledDiameter,
      scaledDiameter
    );
    
    const data = imageData.data;
    let r = 0, g = 0, b = 0, a = 0;
    let count = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      a += data[i + 3];
      count++;
    }
    
    if (count === 0) return { r: 0, g: 0, b: 0, a: 0 };
    
    // Clamp values to valid ranges to prevent color inversion
    return {
      r: Math.max(0, Math.min(255, r / count)),
      g: Math.max(0, Math.min(255, g / count)),
      b: Math.max(0, Math.min(255, b / count)),
      a: Math.max(0, Math.min(1, a / count / 255)), // Normalize alpha to 0-1
    };
  } catch (e) {
    // Return transparent if sampling fails (e.g., out of bounds)
    return { r: 0, g: 0, b: 0, a: 0 };
  }
};

// Blend two colors together based on a mix amount
export const blendColors = (
  brushColor: { r: number; g: number; b: number },
  canvasColor: { r: number; g: number; b: number; a: number },
  mixAmount: number // 0 = all brush, 1 = all canvas
): { r: number; g: number; b: number } => {
  // If canvas is transparent, just use brush color
  if (canvasColor.a < 0.1) {
    return brushColor;
  }
  
  const t = Math.max(0, Math.min(1, mixAmount)) * canvasColor.a;
  
  return {
    r: brushColor.r * (1 - t) + canvasColor.r * t,
    g: brushColor.g * (1 - t) + canvasColor.g * t,
    b: brushColor.b * (1 - t) + canvasColor.b * t,
  };
};

// Calculate how much mixing should occur based on velocity and wet mix settings
export const calculateMixAmount = (
  velocity: number,      // Current stroke velocity
  strokeProgress: number, // 0-1, how far along the stroke (affects charge depletion)
  wetMix: WetMixSettings
): { colorMix: number; smudge: number } => {
  // Slower velocity = more time for color to mix
  // velocity ~0 = full mix potential, velocity > 2 = minimal mixing
  const velocityFactor = Math.max(0, 1 - velocity * 0.4);
  
  // Charge depletes over the stroke - more pickup at the end
  // charge of 1 = no pickup initially, 0 = immediate pickup
  const chargeDepletion = Math.pow(strokeProgress, 1.5);
  const chargeRemaining = wetMix.charge * (1 - chargeDepletion);
  
  // Color mixing based on dilution and velocity
  const colorMix = wetMix.dilution * velocityFactor * (1 - chargeRemaining);
  
  // Smudge/pull is affected by velocity but not charge
  const smudge = wetMix.pull * velocityFactor;
  
  return {
    colorMix: Math.max(0, Math.min(1, colorMix)),
    smudge: Math.max(0, Math.min(1, smudge)),
  };
};

// State tracker for wet mixing during a stroke
export interface WetMixState {
  currentColor: { r: number; g: number; b: number };
  strokeLength: number;
  pointCount: number;
}

// Create initial wet mix state
export const createWetMixState = (brushColor: string): WetMixState => {
  return {
    currentColor: hexToRgb(brushColor),
    strokeLength: 0,
    pointCount: 0,
  };
};

// Update wet mix state with new sampled color
export const updateWetMixState = (
  state: WetMixState,
  sampledColor: { r: number; g: number; b: number; a: number },
  mixAmount: number,
  smudgeAmount: number
): WetMixState => {
  const blended = blendColors(state.currentColor, sampledColor, mixAmount);
  
  return {
    currentColor: blended,
    strokeLength: state.strokeLength,
    pointCount: state.pointCount + 1,
  };
};

export const renderPencil = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  baseSize: number
) => {
  if (points.length < 2) return;

  ctx.save();
  const rgb = hexToRgb(color);

  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const dist = distance(p1, p2);
    
    const timeDelta = Math.max(1, p2.timestamp - p1.timestamp);
    const velocity = dist / timeDelta;
    const velocityFactor = Math.min(1, Math.max(0.4, 1 - velocity * 0.008));
    
    const interpolatedPoints = interpolatePoints(p1, p2, Math.max(1, Math.floor(dist / 1)));

    for (let j = 1; j < interpolatedPoints.length; j++) {
      const point = interpolatedPoints[j];
      const prevPoint = interpolatedPoints[j - 1];
      
      const pressure = Math.max(0.1, point.pressure);
      
      // Calculate tilt for shading effect (H2 graphite behavior)
      const altitude = point.altitude ?? Math.PI / 2;
      const normalizedAltitude = altitude / (Math.PI / 2);
      const tiltFactor = 1 - normalizedAltitude;
      
      // H2 pencil: small tip, firm graphite
      const shadingMultiplier = 1 + tiltFactor * 3;
      const alphaReduction = 1 - tiltFactor * 0.4;
      
      // Smaller base size for graphite tip
      const brushWidth = baseSize * pressure * velocityFactor * 0.6 * shadingMultiplier;
      const ang = angle(prevPoint, point);
      
      // Graphite bristle count - fewer than paintbrush for finer tip
      const bristleCount = Math.max(2, Math.floor(brushWidth / 3));
      
      if (tiltFactor > 0.3) {
        // Shading mode - wider, softer graphite strokes
        for (let b = 0; b < bristleCount * 2; b++) {
          const bristleOffset = (b - bristleCount) * (brushWidth / bristleCount) * 0.8;
          const perpAngle = ang + Math.PI / 2;
          
          const offsetX = Math.cos(perpAngle) * bristleOffset;
          const offsetY = Math.sin(perpAngle) * bristleOffset;
          
          // Graphite grain texture
          const jitterX = (noise(point.x + b, point.y) - 0.5) * brushWidth * 0.3;
          const jitterY = (noise(point.x, point.y + b) - 0.5) * brushWidth * 0.3;
          
          const bristleThickness = (brushWidth / bristleCount) * (0.3 + noise(b, i) * 0.4);
          
          // Graphite color variation (subtle gray shifts)
          const grayVar = 8 * (noise(b, i * 0.1) - 0.5);
          const r = Math.max(0, Math.min(255, rgb.r + grayVar));
          const g = Math.max(0, Math.min(255, rgb.g + grayVar));
          const blue = Math.max(0, Math.min(255, rgb.b + grayVar));
          
          ctx.beginPath();
          ctx.strokeStyle = `rgba(${r}, ${g}, ${blue}, ${(0.08 + pressure * 0.15) * alphaReduction})`;
          ctx.lineWidth = bristleThickness;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          
          ctx.moveTo(prevPoint.x + offsetX + jitterX, prevPoint.y + offsetY + jitterY);
          ctx.lineTo(point.x + offsetX + jitterX, point.y + offsetY + jitterY);
          ctx.stroke();
        }
        
        // Paper grain effect for shading
        const grainCount = Math.floor(brushWidth * 0.5);
        for (let g = 0; g < grainCount; g++) {
          const gx = point.x + (noise(point.x + g, point.y) - 0.5) * brushWidth;
          const gy = point.y + (noise(point.x, point.y + g) - 0.5) * brushWidth;
          
          if (noise(g, i) > 0.6) {
            ctx.beginPath();
            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.1 * pressure * alphaReduction})`;
            ctx.arc(gx, gy, 0.5 + noise(g, i) * 0.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else {
        // Normal writing mode - fine H2 graphite tip (no solid core, all bristles)
        // More bristles for better texture, especially at small sizes
        const minBristles = Math.max(4, Math.ceil(baseSize * 0.8));
        const actualBristleCount = Math.max(minBristles, bristleCount);
        
        for (let b = 0; b < actualBristleCount; b++) {
          const bristleOffset = (b - actualBristleCount / 2) * (brushWidth / actualBristleCount) * 0.9;
          const perpAngle = ang + Math.PI / 2;
          
          const offsetX = Math.cos(perpAngle) * bristleOffset;
          const offsetY = Math.sin(perpAngle) * bristleOffset;
          
          // More jitter for graphite texture
          const jitterX = (noise(point.x + b, point.y) - 0.5) * brushWidth * 0.25;
          const jitterY = (noise(point.x, point.y + b) - 0.5) * brushWidth * 0.25;
          
          // Thinner individual bristles
          const bristleThickness = Math.max(0.3, (brushWidth / actualBristleCount) * (0.3 + noise(b, i) * 0.4));
          
          const grayVar = 8 * (noise(b, i * 0.1) - 0.5);
          const r = Math.max(0, Math.min(255, rgb.r + grayVar));
          const g = Math.max(0, Math.min(255, rgb.g + grayVar));
          const blue = Math.max(0, Math.min(255, rgb.b + grayVar));
          
          // Variable alpha per bristle for more natural graphite look
          const bristleAlpha = (0.15 + pressure * 0.35) * (0.6 + noise(b, j) * 0.4);
          
          ctx.beginPath();
          ctx.strokeStyle = `rgba(${r}, ${g}, ${blue}, ${bristleAlpha})`;
          ctx.lineWidth = bristleThickness;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          
          ctx.moveTo(prevPoint.x + offsetX + jitterX, prevPoint.y + offsetY + jitterY);
          ctx.lineTo(point.x + offsetX + jitterX, point.y + offsetY + jitterY);
          ctx.stroke();
        }
        
        // Subtle graphite dust particles instead of solid core
        if (pressure > 0.3) {
          const dustCount = Math.floor(2 + pressure * 3);
          for (let d = 0; d < dustCount; d++) {
            const dx = point.x + (noise(point.x + d, point.y) - 0.5) * brushWidth * 0.6;
            const dy = point.y + (noise(point.x, point.y + d) - 0.5) * brushWidth * 0.6;
            
            ctx.beginPath();
            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.1 + pressure * 0.15})`;
            ctx.arc(dx, dy, 0.3 + noise(d, i) * 0.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  }

  ctx.restore();
};

export const renderPen = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  baseSize: number
) => {
  if (points.length < 2) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;

  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    
    const pressure = Math.max(0.2, p2.pressure);
    const size = baseSize * pressure;

    ctx.beginPath();
    ctx.globalAlpha = Math.min(1, 0.8 + pressure * 0.2);
    ctx.lineWidth = size;
    ctx.moveTo(p1.x, p1.y);
    
    // Smooth curve through points
    if (i < points.length - 1) {
      const p3 = points[i + 1];
      const midX = (p2.x + p3.x) / 2;
      const midY = (p2.y + p3.y) / 2;
      ctx.quadraticCurveTo(p2.x, p2.y, midX, midY);
    } else {
      ctx.lineTo(p2.x, p2.y);
    }
    
    ctx.stroke();
  }

  ctx.restore();
};

export const renderPaintbrush = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  baseSize: number,
  wetMix?: WetMixSettings,
  sourceCtx?: CanvasRenderingContext2D, // Canvas to sample from for wet mixing
  dpr: number = 1
) => {
  if (points.length < 2) return;

  ctx.save();
  let currentRgb = hexToRgb(color);
  
  // Calculate total stroke length for charge depletion
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    totalLength += distance(points[i - 1], points[i]);
  }
  let accumulatedLength = 0;
  
  // Distance-based wet mix sampling - sample every ~30% of brush size for performance
  const wetMixSampleInterval = baseSize * 0.3;
  let distanceSinceLastSample = wetMixSampleInterval; // Start ready to sample

  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const dist = distance(p1, p2);
    accumulatedLength += dist;
    distanceSinceLastSample += dist;
    
    const timeDelta = Math.max(1, p2.timestamp - p1.timestamp);
    const velocity = dist / timeDelta;
    const velocityFactor = Math.min(1, Math.max(0.3, 1 - velocity * 0.01));
    
    // Wet mixing: sample and blend colors (throttled by distance)
    if (wetMix && sourceCtx && (wetMix.dilution > 0 || wetMix.pull > 0) && distanceSinceLastSample >= wetMixSampleInterval) {
      distanceSinceLastSample = 0;
      const strokeProgress = totalLength > 0 ? accumulatedLength / totalLength : 0;
      const { colorMix, smudge } = calculateMixAmount(velocity, strokeProgress, wetMix);
      
      if (colorMix > 0.01 || smudge > 0.01) {
        const sampledColor = sampleCanvasColor(sourceCtx, p2.x, p2.y, baseSize * 0.5, dpr);
        if (sampledColor.a > 0.1) {
          currentRgb = blendColors(currentRgb, sampledColor, colorMix + smudge * 0.5);
        }
      }
    }
    
    const interpolatedPoints = interpolatePoints(p1, p2, Math.max(1, Math.floor(dist / 1.5)));

    for (let j = 1; j < interpolatedPoints.length; j++) {
      const point = interpolatedPoints[j];
      const prevPoint = interpolatedPoints[j - 1];
      
      const pressure = Math.max(0.1, point.pressure);
      const brushWidth = baseSize * pressure * velocityFactor * 1.5;
      const ang = angle(prevPoint, point);
      
      const bristleCount = Math.max(3, Math.floor(brushWidth / 2));
      
      for (let b = 0; b < bristleCount; b++) {
        const bristleOffset = (b - bristleCount / 2) * (brushWidth / bristleCount);
        const perpAngle = ang + Math.PI / 2;
        
        const offsetX = Math.cos(perpAngle) * bristleOffset;
        const offsetY = Math.sin(perpAngle) * bristleOffset;
        
        const jitterX = (noise(point.x + b, point.y) - 0.5) * brushWidth * 0.2;
        const jitterY = (noise(point.x, point.y + b) - 0.5) * brushWidth * 0.2;
        
        const bristleThickness = (brushWidth / bristleCount) * (0.5 + noise(b, i) * 0.5);
        
        const colorVar = 10 * (noise(b, i * 0.1) - 0.5);
        const r = Math.max(0, Math.min(255, currentRgb.r + colorVar));
        const g = Math.max(0, Math.min(255, currentRgb.g + colorVar));
        const blue = Math.max(0, Math.min(255, currentRgb.b + colorVar));
        
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${r}, ${g}, ${blue}, ${0.15 + pressure * 0.35})`;
        ctx.lineWidth = bristleThickness;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.moveTo(prevPoint.x + offsetX + jitterX, prevPoint.y + offsetY + jitterY);
        ctx.lineTo(point.x + offsetX + jitterX, point.y + offsetY + jitterY);
        ctx.stroke();
      }
      
      if (velocityFactor > 0.7 && pressure > 0.5) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(${currentRgb.r}, ${currentRgb.g}, ${currentRgb.b}, ${0.05 * pressure})`;
        ctx.arc(point.x, point.y, brushWidth * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();
};

// Charcoal brush - rough, dusty texture with smudging
export const renderCharcoal = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  baseSize: number
) => {
  if (points.length < 2) return;

  ctx.save();
  const rgb = hexToRgb(color);

  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const dist = distance(p1, p2);
    const interpolatedPoints = interpolatePoints(p1, p2, Math.max(1, Math.floor(dist / 1)));

    for (let j = 1; j < interpolatedPoints.length; j++) {
      const point = interpolatedPoints[j];
      const prevPoint = interpolatedPoints[j - 1];
      
      const pressure = Math.max(0.1, point.pressure);
      const size = baseSize * pressure * 2;
      
      // Main charcoal stroke - many scattered particles
      const particleCount = Math.floor(size * 1.5);
      for (let p = 0; p < particleCount; p++) {
        const spreadX = (noise(point.x + p * 0.3, point.y) - 0.5) * size;
        const spreadY = (noise(point.x, point.y + p * 0.3) - 0.5) * size;
        const particleSize = 1 + noise(p, i) * 2;
        
        ctx.beginPath();
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.1 + pressure * 0.3})`;
        ctx.arc(point.x + spreadX, point.y + spreadY, particleSize, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // Core dense line
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.4 * pressure})`;
      ctx.lineWidth = size * 0.3;
      ctx.lineCap = 'round';
      ctx.moveTo(prevPoint.x, prevPoint.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      
      // Edge texture
      for (let e = 0; e < 4; e++) {
        const edgeOffset = (e - 2) * size * 0.4;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.1 * pressure})`;
        ctx.lineWidth = 1;
        ctx.moveTo(prevPoint.x + edgeOffset * (noise(e, i) - 0.5), prevPoint.y + edgeOffset * (noise(i, e) - 0.5));
        ctx.lineTo(point.x + edgeOffset * (noise(e + 1, i) - 0.5), point.y + edgeOffset * (noise(i, e + 1) - 0.5));
        ctx.stroke();
      }
    }
  }

  ctx.restore();
};

// Fountain pen - elegant with ink flow variation
export const renderFountainPen = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  baseSize: number
) => {
  if (points.length < 2) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const dist = distance(p1, p2);
    
    const timeDelta = Math.max(1, p2.timestamp - p1.timestamp);
    const velocity = dist / timeDelta;
    
    // Fountain pen gets thicker when moving slow (ink pools)
    const velocityFactor = Math.min(1.5, Math.max(0.3, 1.2 - velocity * 0.02));
    const pressure = Math.max(0.2, p2.pressure);
    
    // Angle affects stroke width (like a real nib)
    const strokeAngle = angle(p1, p2);
    const nibFactor = 0.5 + Math.abs(Math.cos(strokeAngle)) * 0.5;
    
    const size = baseSize * pressure * velocityFactor * nibFactor;

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.globalAlpha = Math.min(1, 0.85 + pressure * 0.15);
    ctx.lineWidth = size;
    
    // Smooth bezier through points
    if (i >= 2 && i < points.length - 1) {
      const p0 = points[i - 2];
      const p3 = points[i + 1];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      
      ctx.moveTo(p1.x, p1.y);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    } else {
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    
    ctx.stroke();
    
    // Ink pooling at slow spots
    if (velocity < 0.5 && pressure > 0.6) {
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.3;
      ctx.arc(p2.x, p2.y, size * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
};

// Oil paint - thick, blended, textured
export const renderOilPaint = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  baseSize: number,
  wetMix?: WetMixSettings,
  sourceCtx?: CanvasRenderingContext2D,
  dpr: number = 1
) => {
  if (points.length < 2) return;

  ctx.save();
  let currentRgb = hexToRgb(color);
  
  // Calculate total stroke length for charge depletion
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    totalLength += distance(points[i - 1], points[i]);
  }
  let accumulatedLength = 0;
  
  // Distance-based wet mix sampling - oil paint samples slightly more often for richer blending
  const wetMixSampleInterval = baseSize * 0.25;
  let distanceSinceLastSample = wetMixSampleInterval;

  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const dist = distance(p1, p2);
    accumulatedLength += dist;
    distanceSinceLastSample += dist;
    
    const timeDelta = Math.max(1, p2.timestamp - p1.timestamp);
    const velocity = dist / timeDelta;
    const velocityFactor = Math.min(1, Math.max(0.4, 1 - velocity * 0.008));
    
    // Wet mixing: sample and blend colors (oil is very blendable, throttled by distance)
    if (wetMix && sourceCtx && (wetMix.dilution > 0 || wetMix.pull > 0) && distanceSinceLastSample >= wetMixSampleInterval) {
      distanceSinceLastSample = 0;
      const strokeProgress = totalLength > 0 ? accumulatedLength / totalLength : 0;
      const { colorMix, smudge } = calculateMixAmount(velocity, strokeProgress, wetMix);
      
      // Oil paint has enhanced mixing capability
      const enhancedMix = colorMix * 1.3;
      
      if (enhancedMix > 0.01 || smudge > 0.01) {
        const sampledColor = sampleCanvasColor(sourceCtx, p2.x, p2.y, baseSize * 0.7, dpr);
        if (sampledColor.a > 0.1) {
          currentRgb = blendColors(currentRgb, sampledColor, enhancedMix + smudge * 0.7);
        }
      }
    }
    
    const interpolatedPoints = interpolatePoints(p1, p2, Math.max(1, Math.floor(dist / 2)));

    for (let j = 1; j < interpolatedPoints.length; j++) {
      const point = interpolatedPoints[j];
      const prevPoint = interpolatedPoints[j - 1];
      
      const pressure = Math.max(0.2, point.pressure);
      const brushWidth = baseSize * pressure * velocityFactor * 2.5;
      const ang = angle(prevPoint, point);
      
      // Thick paint layers
      const layerCount = 3;
      for (let layer = 0; layer < layerCount; layer++) {
        const layerOffset = (layer - 1) * brushWidth * 0.15;
        
        // Color variation per layer
        const lightness = 15 * (layer / layerCount - 0.5);
        const r = Math.max(0, Math.min(255, currentRgb.r + lightness));
        const g = Math.max(0, Math.min(255, currentRgb.g + lightness));
        const blue = Math.max(0, Math.min(255, currentRgb.b + lightness));
        
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${r}, ${g}, ${blue}, ${0.4 + pressure * 0.4})`;
        ctx.lineWidth = brushWidth * (0.6 + layer * 0.2);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        const perpAngle = ang + Math.PI / 2;
        const offX = Math.cos(perpAngle) * layerOffset;
        const offY = Math.sin(perpAngle) * layerOffset;
        
        ctx.moveTo(prevPoint.x + offX, prevPoint.y + offY);
        ctx.lineTo(point.x + offX, point.y + offY);
        ctx.stroke();
      }
      
      // Impasto texture bumps
      if (pressure > 0.5 && velocityFactor > 0.6) {
        for (let t = 0; t < 3; t++) {
          const tx = point.x + (noise(point.x + t, point.y) - 0.5) * brushWidth * 0.5;
          const ty = point.y + (noise(point.x, point.y + t) - 0.5) * brushWidth * 0.5;
          
          ctx.beginPath();
          ctx.fillStyle = `rgba(${currentRgb.r + 20}, ${currentRgb.g + 20}, ${currentRgb.b + 20}, ${0.2 * pressure})`;
          ctx.arc(tx, ty, brushWidth * 0.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  ctx.restore();
};

// Acrylic paint - smoother than oil, quick-drying look
export const renderAcrylic = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  baseSize: number,
  wetMix?: WetMixSettings,
  sourceCtx?: CanvasRenderingContext2D,
  dpr: number = 1
) => {
  if (points.length < 2) return;

  ctx.save();
  let currentRgb = hexToRgb(color);
  
  // Calculate total stroke length for charge depletion
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    totalLength += distance(points[i - 1], points[i]);
  }
  let accumulatedLength = 0;
  
  // Distance-based wet mix sampling - acrylic dries fast, sample less often
  const wetMixSampleInterval = baseSize * 0.35;
  let distanceSinceLastSample = wetMixSampleInterval;

  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const dist = distance(p1, p2);
    accumulatedLength += dist;
    distanceSinceLastSample += dist;
    
    const timeDelta = Math.max(1, p2.timestamp - p1.timestamp);
    const velocity = dist / timeDelta;
    const velocityFactor = Math.min(1, Math.max(0.5, 1 - velocity * 0.005));
    
    // Wet mixing (acrylic dries faster, throttled by distance)
    if (wetMix && sourceCtx && (wetMix.dilution > 0 || wetMix.pull > 0) && distanceSinceLastSample >= wetMixSampleInterval) {
      distanceSinceLastSample = 0;
      const strokeProgress = totalLength > 0 ? accumulatedLength / totalLength : 0;
      const { colorMix, smudge } = calculateMixAmount(velocity, strokeProgress, wetMix);
      
      // Acrylic has reduced mixing compared to oil
      const reducedMix = colorMix * 0.8;
      
      if (reducedMix > 0.01 || smudge > 0.01) {
        const sampledColor = sampleCanvasColor(sourceCtx, p2.x, p2.y, baseSize * 0.5, dpr);
        if (sampledColor.a > 0.1) {
          currentRgb = blendColors(currentRgb, sampledColor, reducedMix + smudge * 0.4);
        }
      }
    }
    
    const pressure = Math.max(0.2, p2.pressure);
    const brushWidth = baseSize * pressure * velocityFactor * 1.8;
    
    // Main opaque stroke
    ctx.beginPath();
    ctx.strokeStyle = `rgba(${currentRgb.r}, ${currentRgb.g}, ${currentRgb.b}, ${0.7 + pressure * 0.3})`;
    ctx.lineWidth = brushWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    
    // Slight edge highlight
    ctx.beginPath();
    ctx.strokeStyle = `rgba(${Math.min(255, currentRgb.r + 30)}, ${Math.min(255, currentRgb.g + 30)}, ${Math.min(255, currentRgb.b + 30)}, ${0.15 * pressure})`;
    ctx.lineWidth = brushWidth * 0.3;
    ctx.moveTo(p1.x, p1.y - brushWidth * 0.2);
    ctx.lineTo(p2.x, p2.y - brushWidth * 0.2);
    ctx.stroke();
    
    // Subtle brush marks
    if (i % 3 === 0) {
      const ang = angle(p1, p2);
      for (let m = 0; m < 2; m++) {
        const markOffset = (m - 0.5) * brushWidth * 0.6;
        const perpAngle = ang + Math.PI / 2;
        
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${currentRgb.r}, ${currentRgb.g}, ${currentRgb.b}, 0.1)`;
        ctx.lineWidth = 1;
        ctx.moveTo(
          p2.x + Math.cos(perpAngle) * markOffset,
          p2.y + Math.sin(perpAngle) * markOffset
        );
        ctx.lineTo(
          p2.x + Math.cos(perpAngle) * markOffset + Math.cos(ang) * brushWidth * 0.3,
          p2.y + Math.sin(perpAngle) * markOffset + Math.sin(ang) * brushWidth * 0.3
        );
        ctx.stroke();
      }
    }
  }

  ctx.restore();
};

// Watercolor - transparent, flowing, wet edges
export const renderWatercolor = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  baseSize: number,
  wetMix?: WetMixSettings,
  sourceCtx?: CanvasRenderingContext2D,
  dpr: number = 1
) => {
  if (points.length < 2) return;

  ctx.save();
  let currentRgb = hexToRgb(color);
  
  // Calculate total stroke length
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    totalLength += distance(points[i - 1], points[i]);
  }
  let accumulatedLength = 0;
  
  // Distance-based wet mix sampling - watercolor samples more often for fluid blending
  const wetMixSampleInterval = baseSize * 0.2;
  let distanceSinceLastSample = wetMixSampleInterval;

  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const dist = distance(p1, p2);
    accumulatedLength += dist;
    distanceSinceLastSample += dist;
    
    const timeDelta = Math.max(1, p2.timestamp - p1.timestamp);
    const velocity = dist / timeDelta;
    const velocityFactor = Math.min(1.3, Math.max(0.6, 1.2 - velocity * 0.01));
    
    // Wet mixing (watercolor is very wet and blendable, throttled by distance)
    if (wetMix && sourceCtx && (wetMix.dilution > 0 || wetMix.pull > 0) && distanceSinceLastSample >= wetMixSampleInterval) {
      distanceSinceLastSample = 0;
      const strokeProgress = totalLength > 0 ? accumulatedLength / totalLength : 0;
      const { colorMix, smudge } = calculateMixAmount(velocity, strokeProgress, wetMix);
      
      // Watercolor has enhanced wet-on-wet mixing
      const enhancedMix = colorMix * 1.5;
      
      if (enhancedMix > 0.01 || smudge > 0.01) {
        const sampledColor = sampleCanvasColor(sourceCtx, p2.x, p2.y, baseSize * 0.8, dpr);
        if (sampledColor.a > 0.05) {
          currentRgb = blendColors(currentRgb, sampledColor, enhancedMix + smudge * 0.8);
        }
      }
    }
    
    const interpolatedPoints = interpolatePoints(p1, p2, Math.max(1, Math.floor(dist / 2)));

    for (let j = 1; j < interpolatedPoints.length; j++) {
      const point = interpolatedPoints[j];
      const prevPoint = interpolatedPoints[j - 1];
      
      const pressure = Math.max(0.1, point.pressure);
      const brushWidth = baseSize * pressure * velocityFactor * 2;
      
      // Transparent wash layer
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${currentRgb.r}, ${currentRgb.g}, ${currentRgb.b}, ${0.08 + pressure * 0.12})`;
      ctx.lineWidth = brushWidth * 1.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(prevPoint.x, prevPoint.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      
      // Wet edge effect
      const edgeAlpha = 0.15 + pressure * 0.1;
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${currentRgb.r}, ${currentRgb.g}, ${currentRgb.b}, ${edgeAlpha})`;
      ctx.lineWidth = brushWidth * 0.15;
      
      const ang = angle(prevPoint, point);
      const perpAngle = ang + Math.PI / 2;
      const edgeOffset = brushWidth * 0.5;
      
      ctx.moveTo(
        prevPoint.x + Math.cos(perpAngle) * edgeOffset,
        prevPoint.y + Math.sin(perpAngle) * edgeOffset
      );
      ctx.lineTo(
        point.x + Math.cos(perpAngle) * edgeOffset,
        point.y + Math.sin(perpAngle) * edgeOffset
      );
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(
        prevPoint.x - Math.cos(perpAngle) * edgeOffset,
        prevPoint.y - Math.sin(perpAngle) * edgeOffset
      );
      ctx.lineTo(
        point.x - Math.cos(perpAngle) * edgeOffset,
        point.y - Math.sin(perpAngle) * edgeOffset
      );
      ctx.stroke();
      
      // Water bloom at slow points
      if (velocity < 0.4 && pressure > 0.4) {
        const bloomSize = brushWidth * 0.8;
        for (let b = 0; b < 5; b++) {
          const bx = point.x + (noise(point.x + b, point.y) - 0.5) * bloomSize;
          const by = point.y + (noise(point.x, point.y + b) - 0.5) * bloomSize;
          
          ctx.beginPath();
          ctx.fillStyle = `rgba(${currentRgb.r}, ${currentRgb.g}, ${currentRgb.b}, ${0.03 * pressure})`;
          ctx.arc(bx, by, bloomSize * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  ctx.restore();
};

// Marker - solid, consistent, slight edge bleed
export const renderMarker = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  baseSize: number
) => {
  if (points.length < 2) return;

  ctx.save();
  const rgb = hexToRgb(color);

  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    
    const pressure = Math.max(0.5, p2.pressure);
    const size = baseSize * pressure * 1.5;

    // Main marker stroke - flat, opaque
    ctx.beginPath();
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.85)`;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    
    // Slight ink bleed at edges
    ctx.beginPath();
    ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
    ctx.lineWidth = size * 1.15;
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    
    // Subtle streaking effect
    if (i % 2 === 0) {
      const ang = angle(p1, p2);
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${Math.min(255, rgb.r + 40)}, ${Math.min(255, rgb.g + 40)}, ${Math.min(255, rgb.b + 40)}, 0.1)`;
      ctx.lineWidth = 1;
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }

  ctx.restore();
};

// Render custom brush based on preset parameters
export const renderCustomBrush = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  baseSize: number,
  preset: CustomBrushPreset
) => {
  if (points.length < 2) return;

  ctx.save();
  const rgb = hexToRgb(color);
  const { shape, dynamics, stroke, color: brushColor, texture } = preset;
  const taper = stroke.taper;

  // Calculate total stroke length for taper
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    totalLength += distance(points[i - 1], points[i]);
  }

  let currentLength = 0;

  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const segmentDist = distance(p1, p2);
    const segmentAngle = angle(p1, p2);
    
    // Apply spacing with spacing jitter
    let spacingPx = Math.max(1, (stroke.spacing / 100) * baseSize);
    if (stroke.spacingJitter > 0) {
      spacingPx *= 1 + (noise(i, currentLength) - 0.5) * stroke.spacingJitter;
    }
    
    const steps = Math.max(1, Math.floor(segmentDist / spacingPx));
    const interpolatedPoints = interpolatePoints(p1, p2, steps);

    for (let j = 1; j < interpolatedPoints.length; j++) {
      const point = interpolatedPoints[j];
      const prevPoint = interpolatedPoints[j - 1];
      currentLength += distance(prevPoint, point);
      
      // Calculate stroke progress (0-1) for taper
      const strokeProgress = totalLength > 0 ? currentLength / totalLength : 0;
      const taperZoneLength = taper.tipLength / 100;
      
      // Calculate taper factor for size
      let taperSizeFactor = 1;
      if (strokeProgress < taperZoneLength && taper.startSize > 0) {
        // Start taper
        const taperProgress = strokeProgress / taperZoneLength;
        taperSizeFactor = taper.startSize + (1 - taper.startSize) * taperProgress;
      } else if (strokeProgress > (1 - taperZoneLength) && taper.endSize > 0) {
        // End taper
        const taperProgress = (strokeProgress - (1 - taperZoneLength)) / taperZoneLength;
        taperSizeFactor = 1 - (1 - (1 - taper.endSize)) * taperProgress;
      }
      
      // Calculate taper factor for opacity
      let taperOpacityFactor = 1;
      if (strokeProgress < taperZoneLength) {
        const taperProgress = strokeProgress / taperZoneLength;
        taperOpacityFactor = taper.startOpacity + (1 - taper.startOpacity) * taperProgress;
      } else if (strokeProgress > (1 - taperZoneLength)) {
        const taperProgress = (strokeProgress - (1 - taperZoneLength)) / taperZoneLength;
        taperOpacityFactor = 1 - (1 - taper.endOpacity) * taperProgress;
      }
      
      // Calculate pressure-affected values
      let strokeSize = baseSize;
      let opacity = brushColor.baseOpacity;
      let flow = brushColor.flowRate;
      
      let pressure = Math.max(0.1, point.pressure);
      
      // Apply fall-off curve to pressure
      if (stroke.fallOff !== 'none') {
        switch (stroke.fallOff) {
          case 'linear':
            // pressure stays the same
            break;
          case 'parabolic':
            pressure = pressure * pressure;
            break;
          case 'exponential':
            pressure = Math.pow(pressure, 3);
            break;
        }
      }
      
      // Apply pressure curve first
      const pressureCurve = dynamics.pressureCurve || PRESSURE_CURVE_PRESETS.linear;
      const curvedPressure = applyPressureCurve(pressure, pressureCurve);
      
      // Apply pressure dynamics with curved pressure
      if (dynamics.pressureAffects.includes('size')) {
        strokeSize *= curvedPressure * dynamics.pressureSensitivity + (1 - dynamics.pressureSensitivity);
      }
      if (dynamics.pressureAffects.includes('opacity')) {
        opacity *= curvedPressure * dynamics.pressureSensitivity + (1 - dynamics.pressureSensitivity);
      }
      if (dynamics.pressureAffects.includes('flow')) {
        flow *= curvedPressure * dynamics.pressureSensitivity + (1 - dynamics.pressureSensitivity);
      }
      
      // Apply velocity dynamics
      const timeDelta = Math.max(1, point.timestamp - prevPoint.timestamp);
      const velocity = segmentDist / timeDelta;
      const velocityFactor = Math.min(1, Math.max(0.3, 1 - velocity * 0.01));
      
      if (dynamics.velocityAffects.includes('size')) {
        strokeSize *= velocityFactor * dynamics.velocitySensitivity + (1 - dynamics.velocitySensitivity);
      }
      if (dynamics.velocityAffects.includes('opacity')) {
        opacity *= velocityFactor * dynamics.velocitySensitivity + (1 - dynamics.velocitySensitivity);
      }
      
      // Apply taper
      strokeSize *= taperSizeFactor;
      opacity *= taperOpacityFactor;
      
      // Apply lateral jitter (perpendicular to stroke direction)
      let lateralOffset = 0;
      if (stroke.jitterLateral > 0) {
        lateralOffset = (noise(point.x + j * 0.5, point.y + i * 0.5) - 0.5) * strokeSize * stroke.jitterLateral * 3;
      }
      
      // Apply linear jitter (along stroke direction)
      let linearOffset = 0;
      if (stroke.jitterLinear > 0) {
        linearOffset = (noise(j * 0.3, i * 0.3) - 0.5) * strokeSize * stroke.jitterLinear * 2;
      }
      
      // Convert lateral/linear offsets to x/y based on stroke angle
      const lateralX = Math.cos(segmentAngle + Math.PI / 2) * lateralOffset;
      const lateralY = Math.sin(segmentAngle + Math.PI / 2) * lateralOffset;
      const linearX = Math.cos(segmentAngle) * linearOffset;
      const linearY = Math.sin(segmentAngle) * linearOffset;
      
      // Apply stamp position jitter (existing jitter)
      const stampJitterX = (noise(point.x + j, point.y) - 0.5) * strokeSize * stroke.jitter.position * 2;
      const stampJitterY = (noise(point.x, point.y + j) - 0.5) * strokeSize * stroke.jitter.position * 2;
      const sizeJitter = 1 + (noise(j, i) - 0.5) * stroke.jitter.size;
      const opacityJitter = 1 - noise(i, j) * stroke.jitter.opacity;
      
      const finalSize = strokeSize * sizeJitter * shape.aspectRatio;
      const finalOpacity = Math.min(1, opacity * opacityJitter * flow);
      
      const px = point.x + stampJitterX + lateralX + linearX;
      const py = point.y + stampJitterY + lateralY + linearY;
      const prevPx = prevPoint.x + stampJitterX * 0.5 + lateralX * 0.5 + linearX * 0.5;
      const prevPy = prevPoint.y + stampJitterY * 0.5 + lateralY * 0.5 + linearY * 0.5;
      
      // Color variation
      let r = rgb.r, g = rgb.g, b = rgb.b;
      if (brushColor.colorVariation > 0) {
        const variation = brushColor.colorVariation * 30;
        r = Math.max(0, Math.min(255, r + (noise(i, j * 0.1) - 0.5) * variation));
        g = Math.max(0, Math.min(255, g + (noise(j, i * 0.1) - 0.5) * variation));
        b = Math.max(0, Math.min(255, b + (noise(i + j, i - j) - 0.5) * variation));
      }

      // Render based on shape type
      switch (shape.baseType) {
        case 'scatter': {
          // Scatter: draw particles - cap at 15 to prevent iOS crashes
          const MAX_SCATTER_PARTICLES = 15;
          const particleCount = Math.min(MAX_SCATTER_PARTICLES, Math.max(1, Math.floor(finalSize / 3)));
          for (let p = 0; p < particleCount; p++) {
            const scatterX = px + (noise(px + p, py) - 0.5) * finalSize * 1.5;
            const scatterY = py + (noise(px, py + p) - 0.5) * finalSize * 1.5;
            const particleSize = (finalSize / 4) * (0.5 + noise(p, j) * 0.5);
            
            ctx.beginPath();
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${finalOpacity * (0.5 + noise(p, i) * 0.5)})`;
            ctx.arc(scatterX, scatterY, particleSize, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        
        case 'bristle': {
          // Bristle: multiple strokes simulating bristles
          const bristleCount = texture.bristleCount || 8;
          const ang = angle(prevPoint, point);
          
          for (let b = 0; b < bristleCount; b++) {
            const bristleOffset = (b / bristleCount - 0.5) * finalSize;
            const variation = (noise(b, i) - 0.5) * texture.bristleVariation * finalSize * 0.5;
            const perpAngle = ang + Math.PI / 2;
            
            const offX = Math.cos(perpAngle) * (bristleOffset + variation);
            const offY = Math.sin(perpAngle) * (bristleOffset + variation);
            
            ctx.beginPath();
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${finalOpacity * (0.4 + noise(b, j) * 0.6)})`;
            ctx.lineWidth = Math.max(0.5, finalSize / bristleCount * 0.8);
            ctx.lineCap = 'round';
            ctx.moveTo(prevPx + offX, prevPy + offY);
            ctx.lineTo(px + offX, py + offY);
            ctx.stroke();
          }
          break;
        }
        
        case 'flat': {
          // Flat: rectangular/elliptical brush
          const ang = angle(prevPoint, point) + shape.angle;
          
          ctx.beginPath();
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${finalOpacity})`;
          ctx.lineWidth = finalSize;
          ctx.lineCap = shape.roundness > 0.5 ? 'round' : 'square';
          ctx.lineJoin = 'round';
          ctx.moveTo(prevPx, prevPy);
          ctx.lineTo(px, py);
          ctx.stroke();
          
          // Edge softness
          if (texture.edgeBleed > 0) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${finalOpacity * 0.3 * texture.edgeBleed})`;
            ctx.lineWidth = finalSize * 1.2;
            ctx.moveTo(prevPx, prevPy);
            ctx.lineTo(px, py);
            ctx.stroke();
          }
          break;
        }
        
        case 'round':
        default: {
          // Round: smooth circular brush
          ctx.beginPath();
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${finalOpacity})`;
          ctx.lineWidth = finalSize * strokeSize / baseSize;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.moveTo(prevPx, prevPy);
          ctx.lineTo(px, py);
          ctx.stroke();
          
          // Soft edge / glow
          if (shape.roundness < 1 || texture.edgeBleed > 0) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${finalOpacity * 0.2})`;
            ctx.lineWidth = finalSize * 1.3;
            ctx.moveTo(prevPx, prevPy);
            ctx.lineTo(px, py);
            ctx.stroke();
          }
          break;
        }
      }
      
      // Add grain texture - skip for scatter (already creates visual grain via particles)
      // Cap grain particles to prevent performance issues on large brushes
      if (texture.grain > 0 && shape.baseType !== 'scatter') {
        const MAX_GRAIN_PARTICLES = 20;
        const grainCount = Math.min(MAX_GRAIN_PARTICLES, Math.floor(finalSize * texture.grain * 2));
        for (let gr = 0; gr < grainCount; gr++) {
          const gx = px + (noise(px + gr, py) - 0.5) * finalSize * texture.noiseScale;
          const gy = py + (noise(px, py + gr) - 0.5) * finalSize * texture.noiseScale;
          
          ctx.beginPath();
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${finalOpacity * 0.3})`;
          ctx.arc(gx, gy, 0.5 + noise(gr, i) * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  ctx.restore();
};

export const renderStroke = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  brush: BrushType,
  color: string,
  size: number,
  opacity: number = 1,
  customBrushPreset?: CustomBrushPreset,
  wetMix?: WetMixSettings,
  sourceCtx?: CanvasRenderingContext2D,
  dpr: number = 1,
  isEraser: boolean = false
) => {
  ctx.save();
  ctx.globalAlpha = ctx.globalAlpha * opacity;
  
  // For eraser, use white color - the actual color doesn't matter for destination-out,
  // only the alpha channel matters. White ensures no visible color flash during live drawing.
  const strokeColor = isEraser ? '#FFFFFF' : color;
  
  // Handle custom brush
  if (brush === 'custom' && customBrushPreset) {
    renderCustomBrush(ctx, points, strokeColor, size, customBrushPreset);
    ctx.restore();
    return;
  }

  switch (brush) {
    case 'pencil':
      renderPencil(ctx, points, strokeColor, size);
      break;
    case 'pen':
      renderPen(ctx, points, strokeColor, size);
      break;
    case 'paintbrush':
      renderPaintbrush(ctx, points, strokeColor, size, wetMix, sourceCtx, dpr);
      break;
    case 'charcoal':
      renderCharcoal(ctx, points, strokeColor, size);
      break;
    case 'fountain_pen':
      renderFountainPen(ctx, points, strokeColor, size);
      break;
    case 'oil_paint':
      renderOilPaint(ctx, points, strokeColor, size, wetMix, sourceCtx, dpr);
      break;
    case 'acrylic':
      renderAcrylic(ctx, points, strokeColor, size, wetMix, sourceCtx, dpr);
      break;
    case 'watercolor':
      renderWatercolor(ctx, points, strokeColor, size, wetMix, sourceCtx, dpr);
      break;
    case 'marker':
      renderMarker(ctx, points, strokeColor, size);
      break;
    default:
      // New WebGL-era brush types fall back to a plain pen line in the
      // legacy 2D renderer (used only when WebGL2 is unavailable).
      renderPen(ctx, points, strokeColor, size);
      break;
  }

  ctx.restore();
};

// Render only a segment of a stroke (for incremental rendering)
export const renderStrokeSegment = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  startIndex: number,
  brush: BrushType,
  color: string,
  size: number,
  opacity: number = 1,
  customBrushPreset?: CustomBrushPreset,
  wetMix?: WetMixSettings,
  sourceCtx?: CanvasRenderingContext2D,
  dpr: number = 1,
  isEraser: boolean = false
) => {
  if (startIndex >= points.length - 1) return;
  
  const segmentPoints = points.slice(startIndex);
  
  ctx.save();
  ctx.globalAlpha = ctx.globalAlpha * opacity;
  
  // For eraser, use white color - the actual color doesn't matter for destination-out,
  // only the alpha channel matters. White ensures no visible color flash during live drawing.
  const strokeColor = isEraser ? '#FFFFFF' : color;
  
  // Handle custom brush
  if (brush === 'custom' && customBrushPreset) {
    renderCustomBrush(ctx, segmentPoints, strokeColor, size, customBrushPreset);
    ctx.restore();
    return;
  }
  
  switch (brush) {
    case 'pencil':
      renderPencil(ctx, segmentPoints, strokeColor, size);
      break;
    case 'pen':
      renderPen(ctx, segmentPoints, strokeColor, size);
      break;
    case 'paintbrush':
      renderPaintbrush(ctx, segmentPoints, strokeColor, size, wetMix, sourceCtx, dpr);
      break;
    case 'charcoal':
      renderCharcoal(ctx, segmentPoints, strokeColor, size);
      break;
    case 'fountain_pen':
      renderFountainPen(ctx, segmentPoints, strokeColor, size);
      break;
    case 'oil_paint':
      renderOilPaint(ctx, segmentPoints, strokeColor, size, wetMix, sourceCtx, dpr);
      break;
    case 'acrylic':
      renderAcrylic(ctx, segmentPoints, strokeColor, size, wetMix, sourceCtx, dpr);
      break;
    case 'watercolor':
      renderWatercolor(ctx, segmentPoints, strokeColor, size, wetMix, sourceCtx, dpr);
      break;
    case 'marker':
      renderMarker(ctx, segmentPoints, strokeColor, size);
      break;
    default:
      renderPen(ctx, segmentPoints, strokeColor, size);
      break;
  }

  ctx.restore();
};
