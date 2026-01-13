import { useRef, useCallback, useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PressureCurve, PRESSURE_CURVE_PRESETS, PressureCurvePresetName } from '@/types/customBrush';

interface PressureCurveEditorProps {
  curve: PressureCurve;
  onChange: (curve: PressureCurve) => void;
  label: string;
}

export const PressureCurveEditor = ({ curve, onChange, label }: PressureCurveEditorProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<number | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<PressureCurvePresetName>('linear');
  const [canvasSize, setCanvasSize] = useState({ width: 280, height: 160 });

  // Check if current curve matches a preset
  useEffect(() => {
    for (const [name, preset] of Object.entries(PRESSURE_CURVE_PRESETS)) {
      if (curvesMatch(curve, preset)) {
        setSelectedPreset(name as PressureCurvePresetName);
        return;
      }
    }
    setSelectedPreset('linear'); // Default if custom
  }, []);

  // Handle high-DPI displays
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const width = rect.width || 280;
    const height = 160;

    // Set display size
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Set actual size in memory (scaled for retina)
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    setCanvasSize({ width: canvas.width, height: canvas.height });

    // Scale context to match DPR
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
  }, []);

  const curvesMatch = (a: PressureCurve, b: PressureCurve): boolean => {
    if (a.points.length !== b.points.length) return false;
    return a.points.every((p, i) => 
      Math.abs(p.x - b.points[i].x) < 0.01 && Math.abs(p.y - b.points[i].y) < 0.01
    );
  };

  const drawCurve = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const padding = 16;
    const graphWidth = width - padding * 2;
    const graphHeight = height - padding * 2;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(padding, padding, graphWidth, graphHeight);

    // Grid lines
    ctx.strokeStyle = '#2a2a4e';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    
    for (let i = 0; i <= 4; i++) {
      const x = padding + (graphWidth / 4) * i;
      const y = padding + (graphHeight / 4) * i;
      
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, height - padding);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Diagonal reference line
    ctx.strokeStyle = '#4a4a6e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(width - padding, padding);
    ctx.stroke();

    // Draw the curve
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    const points = curve.points;
    if (points.length >= 2) {
      ctx.moveTo(
        padding + points[0].x * graphWidth,
        height - padding - points[0].y * graphHeight
      );

      for (let i = 1; i < points.length; i++) {
        const curr = points[i];
        const endX = padding + curr.x * graphWidth;
        const endY = height - padding - curr.y * graphHeight;
        ctx.lineTo(endX, endY);
      }
    }
    ctx.stroke();

    // Draw control points
    points.forEach((point, index) => {
      const x = padding + point.x * graphWidth;
      const y = height - padding - point.y * graphHeight;

      // Outer glow
      ctx.beginPath();
      ctx.fillStyle = 'rgba(124, 58, 237, 0.3)';
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();

      // Point fill
      ctx.fillStyle = isDragging === index ? '#7c3aed' : '#0f0f1a';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();

      // Point stroke
      ctx.strokeStyle = '#7c3aed';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Labels
    ctx.fillStyle = '#a0a0b0';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Input Pressure', width / 2, height - 2);
    
    ctx.save();
    ctx.translate(10, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Output', 0, 0);
    ctx.restore();
  }, [curve, isDragging]);

  useEffect(() => {
    drawCurve();
  }, [drawCurve, canvasSize]);

  const getPointFromEvent = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    
    const padding = 16;
    const graphWidth = width - padding * 2;
    const graphHeight = height - padding * 2;

    const mouseX = (e.clientX - rect.left) * (width / rect.width);
    const mouseY = (e.clientY - rect.top) * (height / rect.height);

    const x = (mouseX - padding) / graphWidth;
    const y = 1 - (mouseY - padding) / graphHeight;

    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }, []);

  const findNearestPoint = useCallback((x: number, y: number): number | null => {
    const threshold = 0.08;
    let nearest: number | null = null;
    let minDist = Infinity;

    curve.points.forEach((point, index) => {
      const dist = Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2);
      if (dist < threshold && dist < minDist) {
        minDist = dist;
        nearest = index;
      }
    });

    return nearest;
  }, [curve.points]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = getPointFromEvent(e);
    if (!point) return;

    const nearestIndex = findNearestPoint(point.x, point.y);
    
    if (nearestIndex !== null) {
      // Start dragging existing point
      setIsDragging(nearestIndex);
    } else {
      // Add new point
      const newPoints = [...curve.points, point].sort((a, b) => a.x - b.x);
      onChange({ ...curve, points: newPoints });
      setSelectedPreset('linear'); // Mark as custom
    }
  }, [curve, onChange, getPointFromEvent, findNearestPoint]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging === null) return;

    const point = getPointFromEvent(e);
    if (!point) return;

    const newPoints = [...curve.points];
    
    // Don't allow moving first (0,0) and last (1,1) points on x-axis for endpoints
    if (isDragging === 0) {
      newPoints[isDragging] = { x: 0, y: Math.max(0, Math.min(1, point.y)) };
    } else if (isDragging === curve.points.length - 1) {
      newPoints[isDragging] = { x: 1, y: Math.max(0, Math.min(1, point.y)) };
    } else {
      // Middle points can move freely but stay within bounds of neighbors
      const minX = curve.points[isDragging - 1].x + 0.02;
      const maxX = curve.points[isDragging + 1].x - 0.02;
      newPoints[isDragging] = {
        x: Math.max(minX, Math.min(maxX, point.x)),
        y: Math.max(0, Math.min(1, point.y)),
      };
    }

    onChange({ ...curve, points: newPoints });
    setSelectedPreset('linear'); // Mark as custom when manually edited
  }, [isDragging, curve, onChange, getPointFromEvent]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(null);
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = getPointFromEvent(e);
    if (!point) return;

    const nearestIndex = findNearestPoint(point.x, point.y);
    
    // Remove point (but not first or last)
    if (nearestIndex !== null && nearestIndex > 0 && nearestIndex < curve.points.length - 1) {
      const newPoints = curve.points.filter((_, i) => i !== nearestIndex);
      onChange({ ...curve, points: newPoints });
    }
  }, [curve, onChange, getPointFromEvent, findNearestPoint]);

  const handlePresetChange = useCallback((presetName: PressureCurvePresetName) => {
    setSelectedPreset(presetName);
    onChange({ ...PRESSURE_CURVE_PRESETS[presetName] });
  }, [onChange]);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <Label className="text-sm font-medium">{label}</Label>
        <Select value={selectedPreset} onValueChange={handlePresetChange}>
          <SelectTrigger className="w-32 h-8">
            <SelectValue placeholder="Preset" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="linear">Linear</SelectItem>
            <SelectItem value="lightTouch">Light Touch</SelectItem>
            <SelectItem value="heavy">Heavy</SelectItem>
            <SelectItem value="sCurve">S-Curve</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div ref={containerRef} className="relative border border-border rounded-md overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full cursor-crosshair"
          style={{ height: '160px' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
        />
      </div>
      
      <p className="text-xs text-muted-foreground">
        Click to add points. Drag to adjust. Double-click to remove.
      </p>
    </div>
  );
};
