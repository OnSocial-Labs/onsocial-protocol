import { describe, expect, it } from 'vitest';
import {
  canDeleteDrop,
  canPauseDrop,
  canResumeDrop,
} from '@/features/scarces/drop-owner-actions';

describe('drop owner action gates', () => {
  it('pause only while live or upcoming', () => {
    expect(canPauseDrop('live')).toBe(true);
    expect(canPauseDrop('upcoming')).toBe(true);
    expect(canPauseDrop('paused')).toBe(false);
    expect(canPauseDrop('sold_out')).toBe(false);
  });

  it('resume only while paused', () => {
    expect(canResumeDrop('paused')).toBe(true);
    expect(canResumeDrop('live')).toBe(false);
  });

  it('delete only when nothing minted', () => {
    expect(canDeleteDrop(0, 'live')).toBe(true);
    expect(canDeleteDrop(0, 'paused')).toBe(true);
    expect(canDeleteDrop(1, 'live')).toBe(false);
    expect(canDeleteDrop(0, 'cancelled')).toBe(false);
  });
});
