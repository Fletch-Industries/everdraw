import { useRef, useEffect, useCallback } from 'react';
import { CustomBrushPreset } from '@/types/customBrush';
import { renderCustomBrush } from '@/utils/brushEngine';
import { Point } from '@/types/drawing';

interface BrushPreviewProps {
  preset: CustomBrushPreset;
  color: string;
  size?: number;
  width?: number;
  height?: number;
}

export const BrushPreview = ({ 
  preset, 
  color, 
  size = 20,
  width = 200, 
  height = 80 
}: BrushPreviewProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Generate a sample wavy stroke path with pressure
    const startX = 20;
    const endX = width - 20;
    const centerY = height / 2;
    
    const points: Point[] = [];
    const steps = 50;
    const baseTime = Date.now();
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = startX + (endX - startX) * t;
      const y = centerY + Math.sin(t * Math.PI * 2) * 15;
      // Pressure curve: start light, build up, end light
      const pressure = Math.sin(t * Math.PI) * 0.7 + 0.3;
      points.push({ 
        x, 
        y, 
        pressure,
        timestamp: baseTime + i * 10 // Simulate timing
      });
    }

    // Use the same renderCustomBrush function as the test canvas
    renderCustomBrush(ctx, points, color, size, preset);
  }, [preset, color, size, width, height]);

  useEffect(() => {
    drawPreview();
  }, [drawPreview]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="rounded-lg bg-black border border-border"
    />
  );
};
