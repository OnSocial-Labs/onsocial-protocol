import { describe, expect, it } from 'vitest';
import {
  getBoundedNoteFieldCounter,
  isBoundedNoteReady,
  normalizeBoundedNote,
} from '@/lib/bounded-note-field';

describe('bounded-note-field', () => {
  it('normalizes whitespace', () => {
    expect(normalizeBoundedNote('  hello   world  ')).toBe('hello world');
  });

  it('requires minimum length', () => {
    expect(isBoundedNoteReady('too short')).toBe(false);
    expect(
      isBoundedNoteReady('This is long enough for governance prose.')
    ).toBe(true);
  });

  it('formats counter labels', () => {
    expect(getBoundedNoteFieldCounter('short').label).toMatch(/\/ 20 min/);
    expect(
      getBoundedNoteFieldCounter('This is long enough for governance prose.')
        .label
    ).toMatch(/\/ 280$/);
  });
});
