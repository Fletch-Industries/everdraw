/**
 * Scanline flood fill algorithm - fills connected pixels of similar color
 * Operates directly on ImageData for performance
 */

// Color tolerance for flood fill (0-255)
const TOLERANCE = 32;

// Maximum pixels to fill (iOS performance: prevent hangs on large fills)
const MAX_FILL_PIXELS = 1_000_000;

// Convert hex color to RGBA
function hexToRgba(hex: string): [number, number, number, number] {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return [r, g, b, 255];
}

// Check if two colors are similar within tolerance
function colorsMatch(
  data: Uint8ClampedArray,
  idx: number,
  targetR: number,
  targetG: number,
  targetB: number,
  targetA: number
): boolean {
  const r = data[idx];
  const g = data[idx + 1];
  const b = data[idx + 2];
  const a = data[idx + 3];
  
  return (
    Math.abs(r - targetR) <= TOLERANCE &&
    Math.abs(g - targetG) <= TOLERANCE &&
    Math.abs(b - targetB) <= TOLERANCE &&
    Math.abs(a - targetA) <= TOLERANCE
  );
}

// Set pixel color
function setPixel(
  data: Uint8ClampedArray,
  idx: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  data[idx] = r;
  data[idx + 1] = g;
  data[idx + 2] = b;
  data[idx + 3] = a;
}

/**
 * Performs a scanline flood fill on a canvas context
 * @param ctx - The canvas 2D rendering context
 * @param startX - Starting X coordinate (in canvas pixels, not DPR-scaled)
 * @param startY - Starting Y coordinate (in canvas pixels, not DPR-scaled)
 * @param fillColor - Hex color to fill with
 * @param dpr - Device pixel ratio
 * @returns true if fill was performed, false if starting pixel matches fill color
 */
export function floodFill(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  fillColor: string,
  dpr: number = 1
): boolean {
  const canvas = ctx.canvas;
  const width = canvas.width;
  const height = canvas.height;
  
  // Scale coordinates by DPR
  const scaledX = Math.floor(startX * dpr);
  const scaledY = Math.floor(startY * dpr);
  
  // Bounds check
  if (scaledX < 0 || scaledX >= width || scaledY < 0 || scaledY >= height) {
    return false;
  }
  
  // Get image data
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  // Get target color (color at start point)
  const startIdx = (scaledY * width + scaledX) * 4;
  const targetR = data[startIdx];
  const targetG = data[startIdx + 1];
  const targetB = data[startIdx + 2];
  const targetA = data[startIdx + 3];
  
  // Get fill color
  const [fillR, fillG, fillB, fillA] = hexToRgba(fillColor);
  
  // Don't fill if target color matches fill color (within tolerance)
  if (
    Math.abs(targetR - fillR) <= TOLERANCE &&
    Math.abs(targetG - fillG) <= TOLERANCE &&
    Math.abs(targetB - fillB) <= TOLERANCE &&
    Math.abs(targetA - fillA) <= TOLERANCE
  ) {
    return false;
  }
  
  // Scanline flood fill using a stack
  const stack: [number, number][] = [[scaledX, scaledY]];
  const visited = new Set<number>();
  
  while (stack.length > 0) {
    // Safety limit to prevent browser hangs on very large fills
    if (visited.size > MAX_FILL_PIXELS) {
      console.warn('Flood fill capped at 1M pixels for performance');
      break;
    }
    
    const [x, y] = stack.pop()!;
    
    // Skip if out of bounds
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    
    const pixelKey = y * width + x;
    
    // Skip if already visited
    if (visited.has(pixelKey)) continue;
    
    const idx = pixelKey * 4;
    
    // Skip if color doesn't match target
    if (!colorsMatch(data, idx, targetR, targetG, targetB, targetA)) continue;
    
    // Mark as visited
    visited.add(pixelKey);
    
    // Find left edge of this scanline segment
    let left = x;
    while (left > 0) {
      const leftIdx = (y * width + (left - 1)) * 4;
      if (!colorsMatch(data, leftIdx, targetR, targetG, targetB, targetA)) break;
      if (visited.has(y * width + (left - 1))) break;
      left--;
    }
    
    // Find right edge
    let right = x;
    while (right < width - 1) {
      const rightIdx = (y * width + (right + 1)) * 4;
      if (!colorsMatch(data, rightIdx, targetR, targetG, targetB, targetA)) break;
      if (visited.has(y * width + (right + 1))) break;
      right++;
    }
    
    // Fill the scanline and check above/below
    for (let i = left; i <= right; i++) {
      const currentKey = y * width + i;
      visited.add(currentKey);
      
      const currentIdx = currentKey * 4;
      setPixel(data, currentIdx, fillR, fillG, fillB, fillA);
      
      // Check pixel above
      if (y > 0) {
        const aboveKey = (y - 1) * width + i;
        if (!visited.has(aboveKey)) {
          const aboveIdx = aboveKey * 4;
          if (colorsMatch(data, aboveIdx, targetR, targetG, targetB, targetA)) {
            stack.push([i, y - 1]);
          }
        }
      }
      
      // Check pixel below
      if (y < height - 1) {
        const belowKey = (y + 1) * width + i;
        if (!visited.has(belowKey)) {
          const belowIdx = belowKey * 4;
          if (colorsMatch(data, belowIdx, targetR, targetG, targetB, targetA)) {
            stack.push([i, y + 1]);
          }
        }
      }
    }
  }
  
  // Put the modified image data back
  ctx.putImageData(imageData, 0, 0);
  
  return true;
}
