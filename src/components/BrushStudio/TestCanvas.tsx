import { useRef, useEffect, useCallback } from 'react';
import { CustomBrushPreset } from '@/types/customBrush';
import { renderCustomBrush } from '@/utils/brushEngine';
import { Point } from '@/types/drawing';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

interface TestCanvasProps {
  preset: CustomBrushPreset;
  size: number;
}

export const TestCanvas = ({ preset, size }: TestCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const pointsRef = useRef<Point[]>([]);
  const dprRef = useRef(1);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    pointsRef.current = [];
  }, []);

  useEffect(() => {
    initCanvas();
  }, [initCanvas]);

  const getPoint = (e: React.PointerEvent): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 0.5,
      timestamp: Date.now(),
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    isDrawingRef.current = true;
    pointsRef.current = [getPoint(e)];
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawingRef.current) return;
    
    const point = getPoint(e);
    pointsRef.current.push(point);
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (pointsRef.current.length >= 2) {
      // Use white color (#FFFFFF) for test canvas
      renderCustomBrush(ctx, pointsRef.current, '#FFFFFF', size, preset);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDrawingRef.current = false;
    canvasRef.current?.releasePointerCapture(e.pointerId);
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground">Test Canvas</span>
        <Button variant="ghost" size="sm" onClick={clearCanvas}>
          <Trash2 className="w-3 h-3 mr-1" />
          Clear
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full h-32 rounded-lg bg-black border border-border cursor-crosshair touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
    </div>
  );
};
