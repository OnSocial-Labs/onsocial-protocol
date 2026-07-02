import { describe, expect, it } from 'vitest';
import { tryAddProfileEditorTag } from '@/lib/profile-tag-editor';

describe('tryAddProfileEditorTag', () => {
  it('adds a new tag', () => {
    expect(tryAddProfileEditorTag([], 'Builder')).toEqual({
      tags: ['builder'],
      hint: null,
    });
  });

  it('reports duplicate tags', () => {
    expect(tryAddProfileEditorTag(['builder'], 'Builder')).toEqual({
      tags: ['builder'],
      hint: 'Already added',
    });
  });

  it('reports max tags', () => {
    const tags = Array.from({ length: 8 }, (_, index) => `tag${index}`);
    expect(tryAddProfileEditorTag(tags, 'extra')).toEqual({
      tags,
      hint: 'Max 8 tags',
    });
  });
});
