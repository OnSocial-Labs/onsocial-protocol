import { describe, expect, it } from 'vitest';
import {
  SHEET_PULL_CONFIRM_PX,
  sheetBodyPullDirection,
  sheetPressActivatesClick,
} from './sheet-body-pull.js';
import { armSheetPullClickSwallow } from './use-sheet-surface-pull.js';

describe('sheet pull click', () => {
  it('keeps a slow press and a move under the confirm slop as a click', () => {
    expect(sheetPressActivatesClick({ phase: 'pending' })).toBe(true);
    expect(sheetPressActivatesClick({ phase: 'pending' })).toBe(true);
    expect(sheetBodyPullDirection(2, 8, SHEET_PULL_CONFIRM_PX)).toBe('pending');
  });

  it('swallows the click only after a downward pull is confirmed', () => {
    expect(sheetBodyPullDirection(2, 12, SHEET_PULL_CONFIRM_PX)).toBe('pull');
    expect(sheetPressActivatesClick({ phase: 'pull' })).toBe(false);
    expect(sheetPressActivatesClick({ phase: 'abort' })).toBe(true);
  });

  it('blocks only the click from this pull, then lets the next click through', () => {
    const listeners = new Map<string, Set<(event: Event) => void>>();
    const target = {
      addEventListener(type: string, listener: (event: Event) => void) {
        const set = listeners.get(type) ?? new Set();
        set.add(listener);
        listeners.set(type, set);
      },
      removeEventListener(type: string, listener: (event: Event) => void) {
        listeners.get(type)?.delete(listener);
      },
    };
    const emit = (type: string) => {
      const event = {
        defaultPrevented: false,
        stopped: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        stopPropagation() {
          this.stopped = true;
        },
      };
      for (const listener of listeners.get(type) ?? []) {
        listener(event as unknown as Event);
      }
      return event;
    };

    armSheetPullClickSwallow(target);

    const pulled = emit('click');
    expect(pulled.defaultPrevented).toBe(true);
    expect(pulled.stopped).toBe(true);

    const next = emit('click');
    expect(next.defaultPrevented).toBe(false);
    expect(next.stopped).toBe(false);
  });

  it('drops the guard on the next press when the pull never clicks', () => {
    const listeners = new Map<string, Set<(event: Event) => void>>();
    const target = {
      addEventListener(type: string, listener: (event: Event) => void) {
        const set = listeners.get(type) ?? new Set();
        set.add(listener);
        listeners.set(type, set);
      },
      removeEventListener(type: string, listener: (event: Event) => void) {
        listeners.get(type)?.delete(listener);
      },
    };
    const emit = (type: string) => {
      const event = {
        type,
        defaultPrevented: false,
        stopped: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        stopPropagation() {
          this.stopped = true;
        },
      };
      for (const listener of listeners.get(type) ?? []) {
        listener(event as unknown as Event);
      }
      return event;
    };

    armSheetPullClickSwallow(target);
    const press = emit('pointerdown');
    expect(press.defaultPrevented).toBe(false);
    const click = emit('click');
    expect(click.defaultPrevented).toBe(false);
    expect(click.stopped).toBe(false);
  });

  it('lets Enter reach its target after a pull that never clicked', () => {
    const listeners = new Map<string, Set<(event: Event) => void>>();
    const target = {
      addEventListener(type: string, listener: (event: Event) => void) {
        const set = listeners.get(type) ?? new Set();
        set.add(listener);
        listeners.set(type, set);
      },
      removeEventListener(type: string, listener: (event: Event) => void) {
        listeners.get(type)?.delete(listener);
      },
    };
    const emit = (type: string) => {
      const event = {
        type,
        defaultPrevented: false,
        stopped: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        stopPropagation() {
          this.stopped = true;
        },
      };
      for (const listener of [...(listeners.get(type) ?? [])]) {
        listener(event as unknown as Event);
      }
      return event;
    };

    armSheetPullClickSwallow(target);
    const key = emit('keydown');
    expect(key.defaultPrevented).toBe(false);
    expect(key.stopped).toBe(false);
    const click = emit('click');
    expect(click.defaultPrevented).toBe(false);
    expect(click.stopped).toBe(false);
  });
});
