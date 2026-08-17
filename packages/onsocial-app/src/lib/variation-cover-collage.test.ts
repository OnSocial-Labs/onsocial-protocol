import { describe, expect, it } from 'vitest';
import {
  COLLAGE_FRAME_RADIUS_RATIO,
  COLLAGE_STYLES,
  collageFetchUrl,
  collageLabelBand,
  collageRectBounds,
  collageSafePad,
  collageTileCornerRadius,
  collageTitleBand,
  expandCollageSrcsForStyle,
  layoutCollageRects,
  nextCollageStyle,
  resolveCollageInkColor,
  resolveCollagePaperColor,
  sampleCollageSeats,
  STYLE_PAPER,
  type CollageStyle,
} from '@/lib/variation-cover-collage';
import { parseCoverMeta } from '@/features/scarces/collections-data';

const SIZE = 1200;
const EPS = 0.75;
const SAFE = collageSafePad(SIZE);

describe('sampleCollageSeats', () => {
  it('keeps cover seat first and includes all when under max', () => {
    expect(sampleCollageSeats([1, 2, 3, 4], 3, 16)).toEqual([3, 1, 2, 4]);
  });

  it('samples without exceeding max and still leads with cover', () => {
    const seats = Array.from({ length: 40 }, (_, i) => i + 1);
    const picked = sampleCollageSeats(seats, 7, 12);
    expect(picked[0]).toBe(7);
    expect(picked).toHaveLength(12);
    expect(new Set(picked).size).toBe(12);
  });
});

describe('nextCollageStyle', () => {
  it('cycles styles', () => {
    expect(nextCollageStyle('pack', 1)).toBe('grid');
    expect(nextCollageStyle('single', -1)).toBe('film');
    expect(nextCollageStyle('duet', -1)).toBe('single');
  });
});

describe('collageFetchUrl', () => {
  it('rewrites OnSocial CDN to same-origin proxy', () => {
    expect(
      collageFetchUrl('https://cdn.testnet.onsocial.id/ipfs/bafyTest/3.png')
    ).toBe('/api/ipfs/bafyTest%2F3.png');
    expect(collageFetchUrl('ipfs://bafyTest/1.webp')).toBe(
      '/api/ipfs/bafyTest%2F1.webp'
    );
    expect(collageFetchUrl('blob:http://localhost/x')).toBe(
      'blob:http://localhost/x'
    );
  });
});

describe('expandCollageSrcsForStyle', () => {
  it('pads style-minimum layouts; pack/grid/mosaic keep real counts', () => {
    expect(expandCollageSrcsForStyle(['a'], 'duet')).toHaveLength(2);
    expect(expandCollageSrcsForStyle(['a', 'b'], 'single')).toEqual(['a']);
    expect(
      expandCollageSrcsForStyle(['a'], 'film').length
    ).toBeGreaterThanOrEqual(3);
    expect(
      expandCollageSrcsForStyle(['a'], 'orbit').length
    ).toBeGreaterThanOrEqual(4);
    expect(expandCollageSrcsForStyle(['a'], 'pack')).toEqual(['a']);
    expect(expandCollageSrcsForStyle(['a', 'b', 'c'], 'pack')).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(expandCollageSrcsForStyle(['a'], 'grid')).toEqual(['a']);
    expect(expandCollageSrcsForStyle(['a', 'b', 'c'], 'mosaic')).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(expandCollageSrcsForStyle(['a'], 'mosaic')).toEqual(['a']);
  });
});

describe('layoutCollageRects — all styles stay clean in the square', () => {
  const styleCounts: Record<CollageStyle, number[]> = {
    single: [1],
    duet: [1, 2],
    orbit: [1, 2, 3, 4, 5, 6],
    pack: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    grid: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    mosaic: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16],
    film: [1, 2, 3, 4],
  };

  for (const style of COLLAGE_STYLES) {
    for (const n of styleCounts[style]) {
      it(`${style} × ${n} — positive finite rects inside canvas`, () => {
        const rects = layoutCollageRects(style, n, SIZE);
        expect(rects).toHaveLength(n);
        for (const r of rects) {
          expect(Number.isFinite(r.x)).toBe(true);
          expect(Number.isFinite(r.y)).toBe(true);
          expect(r.w).toBeGreaterThan(1);
          expect(r.h).toBeGreaterThan(1);
          const b = collageRectBounds(r);
          expect(b.minX).toBeGreaterThanOrEqual(-EPS);
          expect(b.minY).toBeGreaterThanOrEqual(-EPS);
          expect(b.maxX).toBeLessThanOrEqual(SIZE + EPS);
          expect(b.maxY).toBeLessThanOrEqual(SIZE + EPS);
        }
      });

      it(`${style} × ${n} — seats clear frame-radius safe pad`, () => {
        const rects = layoutCollageRects(style, n, SIZE);
        for (const r of rects) {
          const b = collageRectBounds(r);
          expect(b.minX).toBeGreaterThanOrEqual(SAFE - EPS);
          expect(b.minY).toBeGreaterThanOrEqual(SAFE - EPS);
          expect(b.maxX).toBeLessThanOrEqual(SIZE - SAFE + EPS);
          expect(b.maxY).toBeLessThanOrEqual(SIZE - SAFE + EPS);
        }
      });
    }
  }

  it('film gates are square (art fills cleanly)', () => {
    for (const n of [3, 4]) {
      const rects = layoutCollageRects('film', n, SIZE);
      for (const r of rects) {
        expect(Math.abs(r.w - r.h)).toBeLessThan(EPS);
      }
    }
  });

  it('duet panels share full inner height', () => {
    const [a, b] = layoutCollageRects('duet', 2, SIZE);
    expect(a?.h).toBeCloseTo(b?.h ?? 0, 5);
    expect(a?.y).toBeCloseTo(b?.y ?? 0, 5);
  });

  it('single is one full packaging face', () => {
    const rects = layoutCollageRects('single', 1, SIZE);
    expect(rects).toHaveLength(1);
    const r = rects[0]!;
    expect(r.w).toBeGreaterThan(SIZE * 0.5);
    expect(r.h).toBeGreaterThan(SIZE * 0.5);
    expect(r.rot ?? 0).toBe(0);
  });

  it('covers every registered style', () => {
    expect(Object.keys(styleCounts).sort()).toEqual([...COLLAGE_STYLES].sort());
  });

  it('grid seats are equal squares', () => {
    const rects = layoutCollageRects('grid', 4, SIZE);
    expect(rects).toHaveLength(4);
    const side = rects[0]!.w;
    for (const r of rects) {
      expect(Math.abs(r.w - side)).toBeLessThan(EPS);
      expect(Math.abs(r.h - side)).toBeLessThan(EPS);
      expect(r.rot ?? 0).toBe(0);
    }
  });

  it('grid centers incomplete last rows (odd counts)', () => {
    const rects = layoutCollageRects('grid', 5, SIZE);
    expect(rects).toHaveLength(5);
    const top = rects.slice(0, 3);
    const bottom = rects.slice(3);
    const topMid =
      (Math.min(...top.map((r) => r.x)) +
        Math.max(...top.map((r) => r.x + r.w))) /
      2;
    const bottomMid =
      (Math.min(...bottom.map((r) => r.x)) +
        Math.max(...bottom.map((r) => r.x + r.w))) /
      2;
    expect(Math.abs(topMid - bottomMid)).toBeLessThan(EPS);
    expect(bottom).toHaveLength(2);
  });

  it('mosaic fills the content box with no dead paper under hero', () => {
    for (const n of [3, 5, 7, 9]) {
      const rects = layoutCollageRects('mosaic', n, SIZE);
      expect(rects).toHaveLength(n);
      const top = collageTitleBand(SIZE);
      const bottom = collageLabelBand(SIZE);
      const boxY = Math.max(SAFE, top);
      const boxBottom = SIZE - Math.max(SAFE, bottom);
      const padX = Math.max(SIZE * 0.028, SAFE);
      // Union of axis-aligned rects should reach near box edges (filled layout).
      const minX = Math.min(...rects.map((r) => r.x));
      const maxX = Math.max(...rects.map((r) => r.x + r.w));
      const minY = Math.min(...rects.map((r) => r.y));
      const maxY = Math.max(...rects.map((r) => r.y + r.h));
      expect(minX).toBeLessThanOrEqual(padX + EPS);
      expect(maxX).toBeGreaterThanOrEqual(SIZE - padX - EPS);
      expect(minY).toBeLessThanOrEqual(boxY + EPS);
      expect(maxY).toBeGreaterThanOrEqual(boxBottom - EPS);
    }
  });

  it('pack odd fans stay balanced around the hero', () => {
    for (const n of [3, 5, 7, 9]) {
      const rects = layoutCollageRects('pack', n, SIZE);
      const hero = rects[0]!;
      const mid = SIZE / 2;
      expect(Math.abs(hero.x + hero.w / 2 - mid)).toBeLessThan(SIZE * 0.04);
      expect(hero.rot ?? 0).toBe(0);
      const left = rects.filter((r) => r.x + r.w / 2 < mid - 1);
      const right = rects.filter((r) => r.x + r.w / 2 > mid + 1);
      expect(left.length).toBe(right.length);
    }
  });

  it('title/label bands keep seats on the paper outside type', () => {
    const top = collageTitleBand(SIZE);
    const bottom = collageLabelBand(SIZE);
    for (const style of COLLAGE_STYLES) {
      const rects = layoutCollageRects(style, 4, SIZE);
      expect(rects.length).toBeGreaterThan(0);
      for (const r of rects) {
        const b = collageRectBounds(r);
        expect(b.minY).toBeGreaterThanOrEqual(top - EPS);
        expect(b.maxY).toBeLessThanOrEqual(SIZE - bottom + EPS);
      }
    }
  });

  it('toggling chrome opts does not reflow seats', () => {
    const off = layoutCollageRects('pack', 5, SIZE, {
      showTitle: false,
      showLabel: false,
    });
    const on = layoutCollageRects('pack', 5, SIZE, {
      showTitle: true,
      showLabel: true,
    });
    expect(off).toEqual(on);
  });

  it('pack fans hero front-center with soft rotate', () => {
    const rects = layoutCollageRects('pack', 5, SIZE);
    const hero = rects[0]!;
    const mid = SIZE / 2;
    const heroCx = hero.x + hero.w / 2;
    expect(Math.abs(heroCx - mid)).toBeLessThan(SIZE * 0.04);
    expect(hero.rot ?? 0).toBe(0);
    expect(rects.slice(1).some((r) => (r.rot ?? 0) !== 0)).toBe(true);
  });
});

describe('collageSafePad', () => {
  it('clears 0.75rem radius on mid-size covers (10% of square)', () => {
    expect(COLLAGE_FRAME_RADIUS_RATIO).toBe(0.1);
    expect(collageSafePad(1200)).toBe(120);
    expect(collageSafePad(120)).toBe(12);
  });
});

describe('collageTileCornerRadius', () => {
  it('uses soft photo corners on paper styles; film stays square', () => {
    expect(collageTileCornerRadius('duet', 500, 500, 1200)).toBeCloseTo(
      27.5,
      5
    );
    expect(collageTileCornerRadius('pack', 400, 400, 1200)).toBeCloseTo(22, 5);
    expect(collageTileCornerRadius('film', 200, 200, 1200)).toBe(0);
  });
});

describe('resolveCollagePaperColor', () => {
  it('uses style default when paper omitted', () => {
    expect(resolveCollagePaperColor('duet', null)).toBe(STYLE_PAPER.duet);
    expect(resolveCollagePaperColor('film')).toBe(STYLE_PAPER.film);
  });

  it('prefers explicit Finish hex', () => {
    expect(resolveCollagePaperColor('duet', '#FAFAF6')).toBe('#FAFAF6');
  });
});

describe('resolveCollageInkColor', () => {
  it('uses Finish ink when provided', () => {
    expect(resolveCollageInkColor('#0D1914', '#EDF4EC')).toBe('#EDF4EC');
  });

  it('picks dark ink on light paper', () => {
    expect(resolveCollageInkColor('#F3EEE6')).toBe('#0B0B0F');
  });

  it('picks light ink on dark paper', () => {
    expect(resolveCollageInkColor('#050505')).toBe('#F5F0E8');
  });
});

describe('parseCoverMeta', () => {
  it('reads packaging url and seat', () => {
    expect(
      parseCoverMeta(
        JSON.stringify({
          cover: {
            seat: 4,
            url: 'https://example.com/cover.png',
            style: 'orbit',
            label: true,
          },
        })
      )
    ).toEqual({
      seat: 4,
      url: 'https://example.com/cover.png',
      style: 'orbit',
      label: true,
      showTitle: null,
      paper: null,
      font: null,
    });
  });

  it('reads showTitle and paper when present', () => {
    expect(
      parseCoverMeta(
        JSON.stringify({
          cover: {
            seat: 1,
            showTitle: false,
            label: false,
            paper: 'night',
            font: 'poster',
          },
        })
      )
    ).toMatchObject({
      showTitle: false,
      label: false,
      seat: 1,
      paper: 'night',
      font: 'poster',
    });
  });
});
