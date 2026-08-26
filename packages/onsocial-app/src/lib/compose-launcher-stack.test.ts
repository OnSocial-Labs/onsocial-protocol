import { describe, expect, it } from 'vitest';
import {
  popComposeStack,
  topComposeStack,
  upsertComposeStack,
} from '@/lib/compose-launcher-stack';

describe('compose launcher stack', () => {
  it('pushes a new id to the top', () => {
    const stack = upsertComposeStack([{ id: 'home' }], { id: 'thread' });
    expect(stack.map((row) => row.id)).toEqual(['home', 'thread']);
    expect(topComposeStack(stack)?.id).toBe('thread');
  });

  it('updates an existing id in place so a child stays on top', () => {
    const stack = upsertComposeStack(
      [
        { id: 'home', kind: 'pen' },
        { id: 'enlarge', kind: 'write' },
      ],
      { id: 'home', kind: 'updated' }
    );
    expect(stack).toEqual([
      { id: 'home', kind: 'updated' },
      { id: 'enlarge', kind: 'write' },
    ]);
    expect(topComposeStack(stack)?.id).toBe('enlarge');
  });

  it('pops only the matching id', () => {
    const stack = popComposeStack(
      [{ id: 'home' }, { id: 'enlarge' }],
      'enlarge'
    );
    expect(stack.map((row) => row.id)).toEqual(['home']);
    expect(topComposeStack(stack)?.id).toBe('home');
  });

  it('returns null for an empty stack', () => {
    expect(topComposeStack([])).toBeNull();
  });
});
