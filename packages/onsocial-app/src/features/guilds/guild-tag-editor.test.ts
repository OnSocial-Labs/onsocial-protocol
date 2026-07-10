import { describe, expect, it } from 'vitest';
import {
  guildEditorTagsEqual,
  normalizeGuildEditorTags,
  tryAddGuildEditorTag,
  removeGuildEditorTag,
} from '@/features/guilds/guild-tag-editor';

describe('guild-tag-editor', () => {
  it('normalizes and caps at two tags', () => {
    expect(
      normalizeGuildEditorTags(['Builders', '#Social', 'extra', 'noise'])
    ).toEqual(['builders', 'social']);
  });

  it('blocks a third tag with a clear hint', () => {
    const result = tryAddGuildEditorTag(['builders', 'social'], 'grants');
    expect(result.tags).toEqual(['builders', 'social']);
    expect(result.hint).toBe('Max 2 tags');
  });

  it('dedupes and removes tags', () => {
    expect(tryAddGuildEditorTag(['builders'], 'Builders').hint).toBe(
      'Already added'
    );
    expect(removeGuildEditorTag(['builders', 'social'], 'builders')).toEqual([
      'social',
    ]);
    expect(guildEditorTagsEqual(['a', 'b'], ['a', 'b'])).toBe(true);
  });
});
