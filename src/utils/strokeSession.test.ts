import { describe, expect, it } from 'vitest';
import type { BrushType, Point } from '@/types/drawing';
import { BRUSH_GROUPS } from './brushPresets';
import { StrokeSession, type PixelSampler, type StrokeSessionConfig } from './strokeSession';

const points: Point[] = Array.from({ length: 72 }, (_, index) => {
  const t = index / 71;
  return {
    x: 20 + t * 420,
    y: 110 + Math.sin(t * Math.PI * 3) * 42,
    pressure: 0.1 + Math.sin(t * Math.PI) * 0.9,
    timestamp: 1_000 + index * 8,
    tiltX: 18,
    tiltY: 9,
    altitude: Math.PI / 3,
  };
});

const configFor = (brushType: BrushType): StrokeSessionConfig => ({
  brushType,
  color: '#315f9c',
  size: 32,
  opacity: 0.82,
});

describe('StrokeSession release invariants', () => {
  it('renders every built-in brush deterministically with finite stamps', () => {
    const brushes = BRUSH_GROUPS.flatMap(group => group.ids) as BrushType[];
    expect(brushes.length).toBeGreaterThan(10);

    for (const brush of brushes) {
      const first = StrokeSession.processFullStroke(configFor(brush), points).stamps;
      const replay = StrokeSession.processFullStroke(configFor(brush), points).stamps;

      expect(first.length, brush).toBeGreaterThan(3);
      expect(replay, brush).toEqual(first);
      for (const stamp of first) {
        expect(Number.isFinite(stamp.x), brush).toBe(true);
        expect(Number.isFinite(stamp.y), brush).toBe(true);
        expect(Number.isFinite(stamp.size), brush).toBe(true);
        expect(Number.isFinite(stamp.opacity), brush).toBe(true);
        expect(stamp.size, brush).toBeGreaterThan(0);
        expect(stamp.opacity, brush).toBeGreaterThanOrEqual(0);
        expect(stamp.opacity, brush).toBeLessThanOrEqual(1);
      }
    }
  });

  it('leaves a visible mark for a tap', () => {
    const result = StrokeSession.processFullStroke(configFor('pen'), [points[0]]);
    expect(result.stamps).toHaveLength(1);
    expect(result.stamps[0].size).toBeGreaterThan(0);
  });

  it('records and replays wet-mix color samples', () => {
    const pixels = new Uint8Array(128 * 128 * 4);
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = 210;
      pixels[index + 1] = 45;
      pixels[index + 2] = 35;
      pixels[index + 3] = 255;
    }
    const sampler: PixelSampler = { width: 128, height: 128, pixels, scale: 0.25 };
    const wetConfig: StrokeSessionConfig = {
      ...configFor('oil_paint'),
      color: '#2457c5',
      wetMix: { dilution: 0.7, charge: 0.2, pull: 0.8 },
    };

    const mixed = StrokeSession.processFullStroke(wetConfig, points, sampler);
    expect(mixed.mixSamples.length).toBeGreaterThan(0);
    expect(mixed.mixSamples.some(sample => sample.r > 36)).toBe(true);

    const replayed = StrokeSession.processFullStroke({ ...wetConfig, mixSamples: mixed.mixSamples }, points);
    expect(replayed.stamps).toEqual(mixed.stamps);
  });
});
