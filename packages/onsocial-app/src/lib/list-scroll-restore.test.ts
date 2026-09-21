import { describe, expect, it } from 'vitest';
import {
  applyListScrollRestore,
  createListScrollMemory,
  listScrollRestoreLanded,
  scrollTopToPersist,
} from './list-scroll-restore';

function scroller(input: {
  scrollHeight: number;
  clientHeight: number;
  scrollTop?: number;
}): HTMLElement {
  return {
    scrollHeight: input.scrollHeight,
    clientHeight: input.clientHeight,
    scrollTop: input.scrollTop ?? 0,
    dataset: {},
  } as unknown as HTMLElement;
}

describe('list scroll restore', () => {
  it('does not treat a tall list stuck at the top as restored', () => {
    const node = scroller({
      scrollHeight: 4000,
      clientHeight: 800,
      scrollTop: 0,
    });
    expect(listScrollRestoreLanded(node, 640)).toBe(false);
    expect(applyListScrollRestore(node, 640)).toBe(true);
    expect(node.scrollTop).toBe(640);
  });

  it('keeps waiting when the list is not tall enough for the saved line', () => {
    const node = scroller({
      scrollHeight: 900,
      clientHeight: 800,
      scrollTop: 0,
    });
    expect(applyListScrollRestore(node, 640)).toBe(false);
    expect(node.dataset.osScrollRestore).toBe('640');
  });

  it('does not write the top over a line this mount never reached', () => {
    const memory = createListScrollMemory(640);
    expect(scrollTopToPersist(memory, 0)).toBe(640);
  });

  it('trusts a real scroll back to the top', () => {
    const memory = createListScrollMemory(640);
    memory.userAdjusted = true;
    memory.pending = null;
    expect(scrollTopToPersist(memory, 0)).toBe(0);
  });
});
