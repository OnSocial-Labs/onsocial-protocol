import { describe, expect, it } from 'vitest';
import { createElement, useMemo, useState } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useStableFeedBlockKeys } from '@/features/home/use-stable-feed-block-keys';
import type { CoalescedFeedBlock } from '@/lib/feed-threads';

function Probe({ blocks }: { blocks: readonly CoalescedFeedBlock[] }) {
  const keys = useStableFeedBlockKeys(blocks);
  return createElement('div', { 'data-keys': keys.join(',') });
}

describe('useStableFeedBlockKeys render stability', () => {
  it('does not loop when parent allocates a new empty array every render', () => {
    function Parent() {
      const [, bump] = useState(0);
      const blocks = [] as CoalescedFeedBlock[];
      return createElement(
        'button',
        {
          onClick: () => bump((n) => n + 1),
          type: 'button',
        },
        createElement(Probe, { blocks })
      );
    }
    let tree!: TestRenderer.ReactTestRenderer;
    expect(() => {
      act(() => {
        tree = TestRenderer.create(createElement(Parent));
      });
      act(() => {
        tree.root.findByType('button').props.onClick();
      });
    }).not.toThrow();
  });

  it('does not loop when parent memoizes empty blocks', () => {
    function Parent() {
      const blocks = useMemo(() => [] as CoalescedFeedBlock[], []);
      return createElement(Probe, { blocks });
    }
    expect(() => {
      act(() => {
        TestRenderer.create(createElement(Parent));
      });
    }).not.toThrow();
  });
});
