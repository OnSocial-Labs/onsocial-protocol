import { describe, expect, it } from 'vitest';
import {
  MEDIA_FRAME_PAN_CENTER,
  isMediaFramePanCentered,
  mediaFrameCoverSourceRect,
  mediaFramePanStyle,
  panMediaFrameByDelta,
} from '@/lib/media-frame-pan';

describe('mediaFrameCoverSourceRect', () => {
  it('centers a wide image in a square frame', () => {
    const rect = mediaFrameCoverSourceRect(200, 100, 100, 100);
    expect(rect.sw).toBeCloseTo(100);
    expect(rect.sh).toBeCloseTo(100);
    expect(rect.sx).toBeCloseTo(50);
    expect(rect.sy).toBeCloseTo(0);
  });

  it('shifts left when pan x is 0', () => {
    const rect = mediaFrameCoverSourceRect(
      200,
      100,
      100,
      100,
      { x: 0, y: 50 }
    );
    expect(rect.sx).toBeCloseTo(0);
  });

  it('shifts right when pan x is 100', () => {
    const rect = mediaFrameCoverSourceRect(
      200,
      100,
      100,
      100,
      { x: 100, y: 50 }
    );
    expect(rect.sx).toBeCloseTo(100);
  });
});

describe('panMediaFrameByDelta', () => {
  it('moves pan left when dragging right on a wide image', () => {
    const next = panMediaFrameByDelta(
      MEDIA_FRAME_PAN_CENTER,
      50,
      0,
      100,
      100,
      200,
      100
    );
    expect(next.x).toBeLessThan(50);
    expect(next.y).toBe(50);
  });

  it('is a no-op when the image already fits', () => {
    const next = panMediaFrameByDelta(
      MEDIA_FRAME_PAN_CENTER,
      40,
      40,
      100,
      100,
      100,
      100
    );
    expect(next).toEqual(MEDIA_FRAME_PAN_CENTER);
  });
});

describe('mediaFramePan helpers', () => {
  it('treats missing pan as centered', () => {
    expect(isMediaFramePanCentered(undefined)).toBe(true);
    expect(isMediaFramePanCentered(MEDIA_FRAME_PAN_CENTER)).toBe(true);
    expect(isMediaFramePanCentered({ x: 12, y: 50 })).toBe(false);
  });

  it('formats object-position', () => {
    expect(mediaFramePanStyle({ x: 20, y: 80 }).objectPosition).toBe('20% 80%');
  });
});
