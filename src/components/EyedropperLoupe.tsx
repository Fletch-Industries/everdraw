import { useEffect, useRef } from 'react';

interface EyedropperLoupeProps {
  position: { x: number; y: number };
  canvasPosition: { x: number; y: number };
  canvasRef: HTMLCanvasElement | null;
  sampledColor: string;
  visible: boolean;
}

const LOUPE_SIZE = 120;
const MAGNIFICATION = 4;
const OFFSET_Y = -100; // Distance above finger

export const EyedropperLoupe = ({
  position,
  canvasPosition,
  canvasRef,
  sampledColor,
  visible,
}: EyedropperLoupeProps) => {
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);

  // Render magnified view
  useEffect(() => {
    if (!visible || !canvasRef || !loupeCanvasRef.current) return;

    const loupeCanvas = loupeCanvasRef.current;
    const loupeCtx = loupeCanvas.getContext('2d');
    if (!loupeCtx) return;

    // Derive the backing-store ratio from the canvas itself — the drawing
    // canvas uses a budgeted DPR that can differ from devicePixelRatio,
    // which made the loupe magnify the wrong region.
    const cssWidth = canvasRef.clientWidth || parseFloat(canvasRef.style.width) || canvasRef.width;
    const dpr = cssWidth > 0 ? canvasRef.width / cssWidth : (window.devicePixelRatio || 1);
    const sourceSize = LOUPE_SIZE / MAGNIFICATION;

    // Clear loupe
    loupeCtx.clearRect(0, 0, loupeCanvas.width, loupeCanvas.height);

    // Create circular clip
    loupeCtx.save();
    loupeCtx.beginPath();
    loupeCtx.arc(LOUPE_SIZE / 2, LOUPE_SIZE / 2, LOUPE_SIZE / 2 - 4, 0, Math.PI * 2);
    loupeCtx.clip();

    // Draw magnified portion of canvas
    const sourceX = (canvasPosition.x - sourceSize / 2) * dpr;
    const sourceY = (canvasPosition.y - sourceSize / 2) * dpr;

    loupeCtx.imageSmoothingEnabled = false;
    loupeCtx.drawImage(
      canvasRef,
      sourceX,
      sourceY,
      sourceSize * dpr,
      sourceSize * dpr,
      0,
      0,
      LOUPE_SIZE,
      LOUPE_SIZE
    );

    loupeCtx.restore();

    // Draw crosshair
    const center = LOUPE_SIZE / 2;
    loupeCtx.strokeStyle = 'white';
    loupeCtx.lineWidth = 2;
    loupeCtx.shadowColor = 'rgba(0,0,0,0.5)';
    loupeCtx.shadowBlur = 2;

    // Outer circle
    loupeCtx.beginPath();
    loupeCtx.arc(center, center, 8, 0, Math.PI * 2);
    loupeCtx.stroke();

    // Center dot
    loupeCtx.fillStyle = 'white';
    loupeCtx.beginPath();
    loupeCtx.arc(center, center, 2, 0, Math.PI * 2);
    loupeCtx.fill();

  }, [visible, canvasRef, canvasPosition]);

  if (!visible) return null;

  // Calculate loupe position (above finger, clamped to viewport)
  const loupeX = Math.max(10, Math.min(window.innerWidth - LOUPE_SIZE - 10, position.x - LOUPE_SIZE / 2));
  const loupeY = Math.max(10, position.y + OFFSET_Y);

  return (
    <div
      className="fixed pointer-events-none z-50 transition-opacity duration-100"
      style={{
        left: loupeX,
        top: loupeY,
        width: LOUPE_SIZE,
        height: LOUPE_SIZE + 36,
        opacity: visible ? 1 : 0,
      }}
    >
      {/* Loupe circle */}
      <div
        className="relative rounded-full overflow-hidden border-4 border-white shadow-2xl"
        style={{
          width: LOUPE_SIZE,
          height: LOUPE_SIZE,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.2)',
        }}
      >
        <canvas
          ref={loupeCanvasRef}
          width={LOUPE_SIZE}
          height={LOUPE_SIZE}
          className="block"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>

      {/* Color preview bar */}
      <div
        className="mt-2 mx-auto flex items-center justify-center gap-2 px-3 py-1.5 rounded-full"
        style={{
          width: 'fit-content',
          backgroundColor: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div
          className="w-5 h-5 rounded-full border-2 border-white/50"
          style={{ backgroundColor: sampledColor }}
        />
        <span className="text-xs font-mono text-white uppercase">
          {sampledColor}
        </span>
      </div>
    </div>
  );
};
