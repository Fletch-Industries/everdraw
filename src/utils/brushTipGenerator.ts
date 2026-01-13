/**
 * Brush Tip Texture Generator
 * 
 * Generates high-quality brush tip textures using Canvas 2D,
 * then uploads them to WebGL for efficient GPU-accelerated stamping.
 * Supports all brush types with proper bristle/scatter/flat rendering.
 */

import { BrushType } from '@/types/drawing';
import { CustomBrushPreset } from '@/types/customBrush';

// Texture resolution for brush tips (higher = better quality but more memory)
// PERFORMANCE: Use smaller textures on mobile for faster GPU sampling
const isMobileDevice = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const BRUSH_TIP_SIZE = isMobileDevice ? 64 : 128;

// Simple noise function for texture
const noise = (x: number, y: number): number => {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
};

// Smooth noise using bilinear interpolation
const smoothNoise = (x: number, y: number): number => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  
  const n00 = noise(x0, y0);
  const n10 = noise(x0 + 1, y0);
  const n01 = noise(x0, y0 + 1);
  const n11 = noise(x0 + 1, y0 + 1);
  
  const nx0 = n00 * (1 - fx) + n10 * fx;
  const nx1 = n01 * (1 - fx) + n11 * fx;
  
  return nx0 * (1 - fy) + nx1 * fy;
};

// Fractal noise for more organic textures
const fbmNoise = (x: number, y: number, octaves: number = 4): number => {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let maxValue = 0;
  
  for (let i = 0; i < octaves; i++) {
    value += smoothNoise(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  
  return value / maxValue;
};

export interface BrushTipTexture {
  canvas: HTMLCanvasElement;
  imageData: ImageData;
}

/**
 * Generate a soft round brush tip with configurable hardness
 * Enhanced with smoother falloff for better stamp blending
 */
function generateSoftRound(size: number, hardness: number = 0.5): BrushTipTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  
  const center = size / 2;
  const radius = size / 2 - 2;
  
  // Create radial gradient with enhanced hardness control for smoother blending
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
  
  // Smoother falloff curve - more intermediate stops for better blending
  const innerStop = Math.max(0, hardness * 0.5);  // Reduced inner stop for softer core
  const midPoint = innerStop + (1 - innerStop) * 0.4;
  const outerMid = innerStop + (1 - innerStop) * 0.7;
  
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(innerStop * 0.5, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(innerStop, 'rgba(255, 255, 255, 0.95)');
  gradient.addColorStop(midPoint, 'rgba(255, 255, 255, 0.7)');
  gradient.addColorStop(outerMid, 'rgba(255, 255, 255, 0.35)');
  gradient.addColorStop(outerMid + (1 - outerMid) * 0.5, 'rgba(255, 255, 255, 0.12)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  
  return {
    canvas,
    imageData: ctx.getImageData(0, 0, size, size),
  };
}

/**
 * Generate a bristle brush tip (paintbrush-like) with realistic bristle strands
 * Enhanced with softer edges and better blending characteristics
 */
function generateBristles(
  size: number, 
  bristleCount: number = 24,
  bristleVariation: number = 0.3,
  hardness: number = 0.4
): BrushTipTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  
  const center = size / 2;
  const radius = size / 2 - 4;
  
  // First, add a soft base layer for smoother blending between stamps
  const baseGradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
  baseGradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
  baseGradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.4)');
  baseGradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.15)');
  baseGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = baseGradient;
  ctx.fillRect(0, 0, size, size);
  
  // Draw multiple layers of bristles for depth
  for (let layer = 0; layer < 3; layer++) {
    const layerOpacity = 0.5 + layer * 0.2;  // Higher opacity for solid coverage
    const layerOffset = layer * 0.1;
    
    for (let b = 0; b < bristleCount; b++) {
      // Bristle angle with variation
      const baseAngle = (b / bristleCount) * Math.PI * 2;
      const angleVariation = (noise(b, layer) - 0.5) * bristleVariation * 0.5;
      const angle = baseAngle + angleVariation;
      
      // Bristle length with variation
      const lengthVariation = 0.6 + noise(b, layer + 10) * 0.4;  // More variation
      const length = radius * lengthVariation;
      
      // Bristle thickness - slightly thicker for better coverage
      const baseThickness = 2 + noise(b, layer + 20) * 3;
      const thickness = baseThickness * (1 - layerOffset);
      
      // Bristle path with natural curve
      const startR = radius * 0.15;  // Start further from center
      const startX = center + Math.cos(angle) * startR;
      const startY = center + Math.sin(angle) * startR;
      const endX = center + Math.cos(angle) * length;
      const endY = center + Math.sin(angle) * length;
      
      // Control point for natural bristle curve
      const curveFactor = (noise(b, layer + 30) - 0.5) * 0.4;
      const cpAngle = angle + curveFactor;
      const cpDist = length * 0.55;
      const cpX = center + Math.cos(cpAngle) * cpDist;
      const cpY = center + Math.sin(cpAngle) * cpDist;
      
      // Draw bristle with gradient opacity - softer for blending
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(cpX, cpY, endX, endY);
      
      // Bristle opacity varies along length - higher for solid paint
      const bristleAlpha = (0.4 + noise(b, layer + 40) * 0.4) * layerOpacity;
      ctx.strokeStyle = `rgba(255, 255, 255, ${bristleAlpha})`;
      ctx.lineWidth = thickness;
      ctx.lineCap = 'round';
      ctx.stroke();
      
      // Add softer bristle tip detail
      if (layer === 2) {
        ctx.beginPath();
        ctx.arc(endX, endY, thickness * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${bristleAlpha * 0.4})`;
        ctx.fill();
      }
    }
  }
  
  // Add solid center core based on hardness - larger and stronger
  const coreRadius = radius * (0.4 + hardness * 0.3);
  const coreGradient = ctx.createRadialGradient(center, center, 0, center, center, coreRadius);
  coreGradient.addColorStop(0, `rgba(255, 255, 255, ${0.7 + hardness * 0.25})`);
  coreGradient.addColorStop(0.4, `rgba(255, 255, 255, ${0.45 + hardness * 0.15})`);
  coreGradient.addColorStop(0.7, `rgba(255, 255, 255, ${0.2})`);
  coreGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = coreGradient;
  ctx.fillRect(0, 0, size, size);
  
  return {
    canvas,
    imageData: ctx.getImageData(0, 0, size, size),
  };
}

/**
 * Generate a pencil/graphite tip with realistic grain texture
 * Enhanced: directional grain, irregular edges, multiple particle layers, reduced core
 */
function generatePencilTip(size: number, grain: number = 0.4): BrushTipTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  
  const center = size / 2;
  const radius = size / 2 - 2;
  
  // --- Layer 0: Soft continuous base layer for smooth blending ---
  // This is critical to eliminate visible dots between stamps
  const baseGradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
  baseGradient.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
  baseGradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.45)');
  baseGradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.25)');
  baseGradient.addColorStop(0.9, 'rgba(255, 255, 255, 0.1)');
  baseGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = baseGradient;
  ctx.fillRect(0, 0, size, size);
  
  // Directional grain angle (simulates natural graphite crystal alignment)
  const grainAngle = Math.PI * 0.15; // Slight diagonal bias
  const cosGrain = Math.cos(grainAngle);
  const sinGrain = Math.sin(grainAngle);
  
  // --- Layer 1: Fine directional grain particles (reduced density since we have base) ---
  const particleDensity = 200 + Math.floor(grain * 150);
  
  for (let p = 0; p < particleDensity; p++) {
    // Golden angle distribution with directional bias
    const baseAngle = p * 2.39996;
    const r = Math.sqrt(p / particleDensity) * radius;
    
    // Apply directional stretch for graphite grain
    const stretchFactor = 1 + (Math.cos(baseAngle * 2 - grainAngle) * 0.2);
    const x = center + Math.cos(baseAngle) * r * stretchFactor;
    const y = center + Math.sin(baseAngle) * r;
    
    // Edge irregularity - use noise to erode the edge
    const distRatio = r / radius;
    const edgeNoise = fbmNoise(x * 0.15, y * 0.15, 2);
    const irregularEdge = distRatio + (edgeNoise - 0.5) * 0.25;
    const falloff = 1 - Math.pow(Math.max(0, Math.min(1, irregularEdge)), 1.8);
    
    // Skip if outside the irregular boundary
    if (falloff <= 0.05) continue;
    
    // Noise-based variation with directional component
    const noiseVal = fbmNoise(
      x * 0.12 * cosGrain + y * 0.12 * sinGrain, 
      y * 0.12 * cosGrain - x * 0.12 * sinGrain, 
      3
    );
    const alpha = falloff * (0.35 + noiseVal * 0.5) * (0.75 + grain * 0.25);
    
    // Elongated particles for graphite texture
    const particleSize = 0.3 + noise(p, 0) * (0.6 + grain * 0.5);
    const particleStretch = 1.5 + noise(p, 1) * 0.8;
    
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(grainAngle + (noise(p, 2) - 0.5) * 0.4);
    ctx.scale(particleStretch, 1);
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.arc(0, 0, particleSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  
  // --- Layer 2: Secondary sparse particles for depth ---
  const secondaryCount = Math.floor(particleDensity * 0.4);
  for (let p = 0; p < secondaryCount; p++) {
    const angle = noise(p + 1000, 0) * Math.PI * 2;
    const dist = Math.pow(noise(p + 1000, 1), 0.5) * radius * 0.85;
    const x = center + Math.cos(angle) * dist + (noise(p + 1000, 2) - 0.5) * 4;
    const y = center + Math.sin(angle) * dist + (noise(p + 1000, 3) - 0.5) * 4;
    
    const distRatio = dist / radius;
    const falloff = 1 - Math.pow(distRatio, 2);
    const alpha = falloff * (0.2 + noise(p + 1000, 4) * 0.25);
    
    const particleSize = 0.4 + noise(p + 1000, 5) * 0.5;
    
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.arc(x, y, particleSize, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // --- Layer 3: Stronger soft core for continuous coverage ---
  const coreRadius = radius * 0.45; // Larger core for better stamp blending
  const coreGradient = ctx.createRadialGradient(center, center, 0, center, center, coreRadius);
  coreGradient.addColorStop(0, 'rgba(255, 255, 255, 0.7)'); // Stronger center
  coreGradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.5)');
  coreGradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.25)');
  coreGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = coreGradient;
  ctx.fillRect(0, 0, size, size);
  
  return {
    canvas,
    imageData: ctx.getImageData(0, 0, size, size),
  };
}

/**
 * Generate a pencil bristle tip optimized for segment ribbon rendering
 * Creates an anisotropic, strand-like texture that blends smoothly when overlapped
 * The high aspect ratio in rendering stretches this into connected stroke segments
 */
function generatePencilBristleTip(size: number): BrushTipTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  
  const center = size / 2;
  const radius = size / 2 - 2;
  
  // Layer 0: Soft continuous base - ensures stamps blend without visible edges
  const baseGradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
  baseGradient.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
  baseGradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.6)');
  baseGradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.35)');
  baseGradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.12)');
  baseGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = baseGradient;
  ctx.fillRect(0, 0, size, size);
  
  // Layer 1: Directional grain scratches (aligned with X axis - stroke direction after rotation)
  // These create the authentic graphite strand texture
  const scratchCount = 40 + Math.floor(size * 0.3);
  for (let s = 0; s < scratchCount; s++) {
    // Scratches roughly aligned with X axis (pencil stroke direction)
    const scratchAngle = (noise(s, 50) - 0.5) * 0.5; // ±0.25 radians variation
    const yOffset = (noise(s, 51) - 0.5) * radius * 1.6;
    const scratchLength = radius * (0.4 + noise(s, 52) * 0.5);
    
    const startX = center - scratchLength * 0.5;
    const startY = center + yOffset;
    const endX = center + scratchLength * 0.5;
    const endY = center + yOffset + Math.sin(scratchAngle) * scratchLength;
    
    // Check if within bounds
    const midDist = Math.abs(yOffset);
    if (midDist > radius * 0.9) continue;
    
    const falloff = 1 - midDist / radius;
    const alpha = falloff * (0.15 + noise(s, 53) * 0.25);
    
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = 0.5 + noise(s, 54) * 1.0;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  
  // Layer 2: Fine grain particles for graphite texture
  const grainCount = 50;
  for (let g = 0; g < grainCount; g++) {
    const angle = noise(g, 100) * Math.PI * 2;
    const dist = Math.pow(noise(g, 101), 0.6) * radius * 0.8;
    const x = center + Math.cos(angle) * dist;
    const y = center + Math.sin(angle) * dist;
    
    const distRatio = dist / radius;
    const falloff = 1 - Math.pow(distRatio, 1.5);
    const alpha = falloff * (0.1 + noise(g, 102) * 0.18);
    
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.arc(x, y, 0.4 + noise(g, 103) * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Layer 3: Stronger core for solid marks at high pressure
  const coreRadius = radius * 0.4;
  const coreGradient = ctx.createRadialGradient(center, center, 0, center, center, coreRadius);
  coreGradient.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
  coreGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.35)');
  coreGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = coreGradient;
  ctx.fillRect(0, 0, size, size);
  
  return {
    canvas,
    imageData: ctx.getImageData(0, 0, size, size),
  };
}

/**
 * Generate a charcoal/scatter tip with organic dust particles
 */
function generateCharcoalTip(size: number, scatter: number = 0.5): BrushTipTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  
  const center = size / 2;
  const radius = size / 2 - 2;
  
  // Draw scattered dust particles with organic distribution
  const particleCount = 250 + Math.floor(scatter * 150);
  
  for (let p = 0; p < particleCount; p++) {
    // Organic distribution using noise
    const angle = noise(p, 0) * Math.PI * 2;
    const dist = Math.pow(noise(p, 1), 0.6) * radius;
    const x = center + Math.cos(angle) * dist;
    const y = center + Math.sin(angle) * dist;
    
    const falloff = 1 - (dist / radius);
    const noiseVal = fbmNoise(x * 0.05, y * 0.05, 2);
    const alpha = falloff * (0.3 + noiseVal * 0.4) * (0.7 + scatter * 0.3);
    
    // Larger, more irregular particles for charcoal
    const particleSize = 1 + noise(p, 3) * 3 * (0.8 + scatter * 0.4);
    
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.arc(x, y, particleSize, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Add solid smudge-like core
  const coreGradient = ctx.createRadialGradient(center, center, 0, center, center, radius * 0.5);
  coreGradient.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
  coreGradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.25)');
  coreGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = coreGradient;
  ctx.fillRect(0, 0, size, size);
  
  return {
    canvas,
    imageData: ctx.getImageData(0, 0, size, size),
  };
}

/**
 * Generate a marker tip (flat, uniform with slight edge softness)
 */
function generateMarkerTip(size: number, hardness: number = 0.85): BrushTipTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  
  const center = size / 2;
  const radius = size / 2 - 2;
  
  // Create hard-edged circle with configurable edge softness
  const edgeSoftness = (1 - hardness) * 0.2;
  
  // Main fill
  ctx.beginPath();
  ctx.arc(center, center, radius * (1 - edgeSoftness), 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 255, 255, ${0.95 + hardness * 0.05})`;
  ctx.fill();
  
  // Soft edge ring
  if (edgeSoftness > 0) {
    const edgeGradient = ctx.createRadialGradient(
      center, center, radius * (1 - edgeSoftness * 2),
      center, center, radius
    );
    edgeGradient.addColorStop(0, `rgba(255, 255, 255, ${0.6 + hardness * 0.2})`);
    edgeGradient.addColorStop(0.5, `rgba(255, 255, 255, ${0.3})`);
    edgeGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = edgeGradient;
    ctx.fillRect(0, 0, size, size);
  }
  
  return {
    canvas,
    imageData: ctx.getImageData(0, 0, size, size),
  };
}

/**
 * Generate a watercolor tip (wet, organic edges with pooling effect)
 */
function generateWatercolorTip(size: number): BrushTipTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  
  const center = size / 2;
  const radius = size / 2 - 4;
  
  // Multiple overlapping organic layers
  for (let layer = 0; layer < 6; layer++) {
    const layerNoise = fbmNoise(layer * 7.3, layer * 3.1, 2);
    const offsetX = (layerNoise - 0.5) * 8;
    const offsetY = (fbmNoise(layer * 5.7, layer * 9.2, 2) - 0.5) * 8;
    const layerRadius = radius * (0.5 + layer * 0.1);
    
    const gradient = ctx.createRadialGradient(
      center + offsetX, center + offsetY, 0,
      center + offsetX, center + offsetY, layerRadius
    );
    
    const baseAlpha = 0.1 + layer * 0.02;
    gradient.addColorStop(0, `rgba(255, 255, 255, ${baseAlpha})`);
    gradient.addColorStop(0.5, `rgba(255, 255, 255, ${baseAlpha * 0.7})`);
    gradient.addColorStop(0.8, `rgba(255, 255, 255, ${baseAlpha * 0.3})`);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  
  // Add edge pigment pooling effect
  const poolingCount = 40;
  for (let i = 0; i < poolingCount; i++) {
    const angle = (i / poolingCount) * Math.PI * 2 + noise(i, 5) * 0.3;
    const dist = radius * (0.65 + fbmNoise(i * 0.3, i * 0.7, 2) * 0.35);
    const x = center + Math.cos(angle) * dist;
    const y = center + Math.sin(angle) * dist;
    
    const poolSize = 2 + noise(i, 7) * 5;
    const poolAlpha = 0.04 + noise(i, 8) * 0.08;
    
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 255, 255, ${poolAlpha})`;
    ctx.arc(x, y, poolSize, 0, Math.PI * 2);
    ctx.fill();
  }
  
  return {
    canvas,
    imageData: ctx.getImageData(0, 0, size, size),
  };
}

/**
 * Generate a fountain pen tip with slight texture variation
 */
function generateFountainPenTip(size: number): BrushTipTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  
  const center = size / 2;
  const radius = size / 2 - 2;
  
  // Smooth gradient with high center opacity
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.85)');
  gradient.addColorStop(0.85, 'rgba(255, 255, 255, 0.4)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  
  // Add subtle ink texture
  for (let p = 0; p < 50; p++) {
    const angle = noise(p, 0) * Math.PI * 2;
    const dist = Math.pow(noise(p, 1), 0.5) * radius * 0.6;
    const x = center + Math.cos(angle) * dist;
    const y = center + Math.sin(angle) * dist;
    
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 255, 255, ${0.05 + noise(p, 2) * 0.1})`;
    ctx.arc(x, y, 0.5 + noise(p, 3) * 1, 0, Math.PI * 2);
    ctx.fill();
  }
  
  return {
    canvas,
    imageData: ctx.getImageData(0, 0, size, size),
  };
}

/**
 * Generate a flat/chisel brush tip
 */
function generateFlatTip(size: number, aspectRatio: number = 3, angle: number = 0): BrushTipTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  
  const center = size / 2;
  
  ctx.save();
  ctx.translate(center, center);
  ctx.rotate(angle);
  
  // Draw elongated ellipse
  const width = (size - 4) / 2;
  const height = width / aspectRatio;
  
  // Gradient across the short axis
  const gradient = ctx.createLinearGradient(0, -height, 0, height);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
  gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.9)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.9)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0.7)');
  
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Soft edges
  ctx.globalCompositeOperation = 'destination-out';
  const edgeGradient = ctx.createRadialGradient(0, 0, Math.min(width, height) * 0.8, 0, 0, Math.max(width, height));
  edgeGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  edgeGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0)');
  edgeGradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
  ctx.fillStyle = edgeGradient;
  ctx.beginPath();
  ctx.ellipse(0, 0, width * 1.1, height * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
  
  return {
    canvas,
    imageData: ctx.getImageData(0, 0, size, size),
  };
}

/**
 * Generate brush tip texture for a given brush type with full custom brush support
 */
export function generateBrushTip(
  brushType: BrushType,
  size: number = BRUSH_TIP_SIZE,
  customBrush?: CustomBrushPreset
): BrushTipTexture {
  // Handle custom brushes with full property support
  if (customBrush || brushType === 'custom') {
    const shape = customBrush?.shape;
    const texture = customBrush?.texture;
    const baseType = shape?.baseType ?? 'round';
    const hardness = shape?.roundness ?? 0.5;
    const aspectRatio = shape?.aspectRatio ?? 1;
    const brushAngle = shape?.angle ?? 0;
    const bristleCount = texture?.bristleCount ?? 12;
    const bristleVariation = texture?.bristleVariation ?? 0.3;
    const grain = texture?.grain ?? 0;
    
    switch (baseType) {
      case 'bristle':
        return generateBristles(size, bristleCount, bristleVariation, hardness);
      case 'scatter':
        return generateCharcoalTip(size, grain);
      case 'flat':
        return generateFlatTip(size, aspectRatio, brushAngle);
      default:
        return generateSoftRound(size, hardness);
    }
  }
  
  // Built-in brush types
  switch (brushType) {
    case 'pencil':
      // Use pencil bristle tip for multi-bristle rendering approach
      return generatePencilBristleTip(size);
    case 'pen':
      return generateSoftRound(size, 0.85);
    case 'fountain_pen':
      return generateFountainPenTip(size);
    case 'paintbrush':
      return generateBristles(size, 18, 0.35, 0.4);
    case 'oil_paint':
      return generateBristles(size, 14, 0.4, 0.35);
    case 'acrylic':
      return generateBristles(size, 16, 0.3, 0.5);
    case 'charcoal':
      return generateCharcoalTip(size, 0.5);
    case 'watercolor':
      return generateWatercolorTip(size);
    case 'marker':
      return generateMarkerTip(size, 0.85);
    default:
      return generateSoftRound(size, 0.5);
  }
}

/**
 * Cache for brush tip textures
 */
const textureCache = new Map<string, BrushTipTexture>();

/**
 * Get or generate a brush tip texture (cached)
 */
export function getBrushTipTexture(
  brushType: BrushType,
  customBrush?: CustomBrushPreset
): BrushTipTexture {
  // Create cache key that includes relevant custom brush properties
  let cacheKey: string = brushType;
  if (customBrush) {
    const shape = customBrush.shape;
    const texture = customBrush.texture;
    cacheKey = `custom:${customBrush.id}:${shape?.baseType}:${shape?.roundness}:${texture?.bristleCount}:${texture?.bristleVariation}`;
  }
  
  let tipTexture = textureCache.get(cacheKey);
  if (!tipTexture) {
    tipTexture = generateBrushTip(brushType, BRUSH_TIP_SIZE, customBrush);
    textureCache.set(cacheKey, tipTexture);
  }
  
  return tipTexture;
}

/**
 * Clear the texture cache
 */
export function clearBrushTipCache(): void {
  textureCache.clear();
}

/**
 * Upload a brush tip texture to WebGL
 */
export function uploadBrushTipToGL(
  gl: WebGL2RenderingContext,
  texture: BrushTipTexture
): WebGLTexture | null {
  const glTexture = gl.createTexture();
  if (!glTexture) return null;
  
  gl.bindTexture(gl.TEXTURE_2D, glTexture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    texture.canvas
  );
  
  // Use linear filtering for smooth scaling
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  
  gl.bindTexture(gl.TEXTURE_2D, null);
  
  return glTexture;
}
