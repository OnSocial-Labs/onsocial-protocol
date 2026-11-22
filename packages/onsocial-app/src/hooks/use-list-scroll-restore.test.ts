// @vitest-environment jsdom
import { createElement } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRef } from 'react';
import { useListScrollRestore } from '@/hooks/use-list-scroll-restore';
import {
  createListScrollMemory,
  resetListScrollMemory,
  scrollTopToPersist,
  type ListScrollMemory,
} from '@/lib/list-scroll-restore';
import {
  readDiscoverTabScroll,
  rememberDiscoverTabScroll,
} from '@/lib/discover-tab-scroll';

function scroller(initialTop: number): HTMLDivElement {
  const node = document.createElement('div');
  let scrollTop = initialTop;
  Object.defineProperty(node, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = Number(value);
    },
  });
  Object.defineProperty(node, 'scrollHeight', {
    configurable: true,
    value: 4000,
  });
  Object.defineProperty(node, 'clientHeight', {
    configurable: true,
    value: 800,
  });
  return node;
}

function RestoreHarness({
  node,
  memory,
}: {
  node: HTMLDivElement;
  memory: ListScrollMemory;
}) {
  const scrollRootRef = useRef<HTMLElement | null>(node);
  const memoryRef = useRef(memory);
  useListScrollRestore(scrollRootRef, memoryRef, 'profiles');
  return createElement('div');
}

describe('discover profiles scroll restore', () => {
  it('opens Profiles at the top after Moving left the shared scroller offset', () => {
    const node = scroller(640);
    const memory = createListScrollMemory(640);
    memory.userAdjusted = true;
    memory.pending = null;
    memory.landed = 640;

    const tabScroll = rememberDiscoverTabScroll(
      {},
      'trending',
      scrollTopToPersist(memory, node.scrollTop)
    );
    resetListScrollMemory(memory, readDiscoverTabScroll(tabScroll, 'profiles'));
    expect(scrollTopToPersist(memory, node.scrollTop)).toBe(0);

    render(createElement(RestoreHarness, { node, memory }));

    expect(node.scrollTop).toBe(0);
  });
});
