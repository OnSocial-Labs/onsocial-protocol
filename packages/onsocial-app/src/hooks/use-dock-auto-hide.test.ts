import { describe, expect, it } from 'vitest';
import {
  DOCK_MIN_SCROLL_ROOM_PX,
  canDockAutoHide,
  scrollRoomOf,
} from './use-dock-auto-hide';

describe('dock auto-hide scroll room', () => {
  it('requires enough travel to hide so short pages stay visible', () => {
    expect(canDockAutoHide(0)).toBe(false);
    expect(canDockAutoHide(DOCK_MIN_SCROLL_ROOM_PX - 1)).toBe(false);
    expect(canDockAutoHide(DOCK_MIN_SCROLL_ROOM_PX)).toBe(true);
    expect(canDockAutoHide(400)).toBe(true);
  });

  it('reads overflow room from an element', () => {
    const el = {
      scrollHeight: 800,
      clientHeight: 600,
    } as Element;
    expect(scrollRoomOf(el)).toBe(200);
    expect(scrollRoomOf({ scrollHeight: 600, clientHeight: 600 } as Element)).toBe(
      0
    );
    expect(scrollRoomOf(null)).toBe(0);
  });
});
