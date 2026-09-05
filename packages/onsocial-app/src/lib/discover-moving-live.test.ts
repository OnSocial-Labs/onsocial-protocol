import { describe, expect, it } from 'vitest';
import { canRefreshMovingBoard } from './discover-moving-live';

describe('canRefreshMovingBoard', () => {
  it('waits when the tab is hidden or a fetch is already in flight', () => {
    expect(canRefreshMovingBoard({ hidden: false, inFlight: false })).toBe(
      true
    );
    expect(canRefreshMovingBoard({ hidden: true, inFlight: false })).toBe(
      false
    );
    expect(canRefreshMovingBoard({ hidden: false, inFlight: true })).toBe(
      false
    );
  });
});
