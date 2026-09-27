import { describe, expect, it } from 'vitest';
import {
  DOCK_HIDE_DELTA_PX,
  DOCK_MIN_SCROLL_ROOM_PX,
  DOCK_SHOW_DELTA_PX,
  DOCK_TOP_REVEAL_PX,
  canDockAutoHide,
  nextDockAutoHidden,
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
    expect(
      scrollRoomOf({ scrollHeight: 600, clientHeight: 600 } as Element)
    ).toBe(0);
    expect(scrollRoomOf(null)).toBe(0);
  });

  it('hides on a downward flick and stays visible near the top', () => {
    const room = DOCK_MIN_SCROLL_ROOM_PX + 40;
    expect(
      nextDockAutoHidden({
        scrollTop: DOCK_TOP_REVEAL_PX + 20,
        delta: DOCK_HIDE_DELTA_PX + 1,
        scrollRoom: room,
        hidden: false,
      })
    ).toBe(true);
    expect(
      nextDockAutoHidden({
        scrollTop: DOCK_TOP_REVEAL_PX,
        delta: DOCK_HIDE_DELTA_PX + 40,
        scrollRoom: room,
        hidden: true,
      })
    ).toBe(false);
    expect(
      nextDockAutoHidden({
        scrollTop: 180,
        delta: -(DOCK_SHOW_DELTA_PX + 1),
        scrollRoom: room,
        hidden: true,
      })
    ).toBe(false);
    expect(
      nextDockAutoHidden({
        scrollTop: 180,
        delta: 2,
        scrollRoom: room,
        hidden: true,
      })
    ).toBe(true);
    expect(
      nextDockAutoHidden({
        scrollTop: 180,
        delta: DOCK_HIDE_DELTA_PX + 1,
        scrollRoom: DOCK_MIN_SCROLL_ROOM_PX - 1,
        hidden: false,
      })
    ).toBe(false);
  });
});
