import { describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import { runRichTextTool } from './os-rich-text-field.js';

function mockEditor(input: {
  empty: boolean;
  from?: number;
  to?: number;
  active?: boolean;
}): { editor: Editor; calls: string[] } {
  const calls: string[] = [];
  const from = input.from ?? 0;
  const chainApi = {
    focus: () => chainApi,
    toggleMark: (mark: string) => {
      calls.push(`toggleMark:${mark}`);
      return chainApi;
    },
    setMark: (mark: string) => {
      calls.push(`setMark:${mark}`);
      return chainApi;
    },
    unsetMark: (mark: string) => {
      calls.push(`unsetMark:${mark}`);
      return chainApi;
    },
    setTextSelection: (pos: number) => {
      calls.push(`setTextSelection:${pos}`);
      return chainApi;
    },
    liftListItem: () => chainApi,
    toggleBulletList: () => chainApi,
    setParagraph: () => chainApi,
    toggleHeading: () => chainApi,
    run: () => {
      calls.push('run');
      return true;
    },
  };
  const editor = {
    state: {
      selection: {
        empty: input.empty,
        from,
        to: input.to ?? from,
      },
    },
    chain: () => chainApi,
    isActive: vi.fn(() => Boolean(input.active)),
  } as unknown as Editor;
  return { editor, calls };
}

describe('runRichTextTool bold / italic', () => {
  it('turns Bold off at the caret without stripping typed text (no extend)', () => {
    const { editor, calls } = mockEditor({ empty: true, active: true });
    runRichTextTool(editor, 'bold');
    expect(calls).toEqual(['unsetMark:bold', 'run']);
  });

  it('turns Bold on at the caret for the next characters', () => {
    const { editor, calls } = mockEditor({ empty: true, active: false });
    runRichTextTool(editor, 'bold');
    expect(calls).toEqual(['setMark:bold', 'run']);
  });

  it('toggles only the real selection', () => {
    const { editor, calls } = mockEditor({
      empty: false,
      from: 7,
      to: 12,
      active: true,
    });
    runRichTextTool(editor, 'italic');
    expect(calls).toEqual(['toggleMark:italic', 'run']);
  });
});
