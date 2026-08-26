import { describe, expect, it } from 'vitest';
import {
  clearWriteDockDraft,
  readWriteDockDraft,
  writeDockDraftIsDirty,
  writeWriteDockDraft,
} from '@/lib/os-write-dock-draft';

describe('write dock draft', () => {
  it('round-trips text and file, then clears', () => {
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    writeWriteDockDraft('post:a', { text: 'hello', file });
    expect(readWriteDockDraft('post:a')).toEqual({ text: 'hello', file });
    clearWriteDockDraft('post:a');
    expect(readWriteDockDraft('post:a')).toEqual({ text: '', file: null });
  });

  it('drops an empty draft instead of storing it', () => {
    writeWriteDockDraft('post:b', { text: 'keep', file: null });
    writeWriteDockDraft('post:b', { text: '   ', file: null });
    expect(readWriteDockDraft('post:b')).toEqual({ text: '', file: null });
  });

  it('keeps drafts isolated by key', () => {
    writeWriteDockDraft('post:one', { text: 'one', file: null });
    writeWriteDockDraft('dm:two', { text: 'two', file: null });
    expect(readWriteDockDraft('post:one').text).toBe('one');
    expect(readWriteDockDraft('dm:two').text).toBe('two');
    clearWriteDockDraft('post:one');
    clearWriteDockDraft('dm:two');
  });

  it('treats whitespace-only as empty', () => {
    expect(writeDockDraftIsDirty({ text: '  ', file: null })).toBe(false);
    expect(writeDockDraftIsDirty({ text: '', file: new File([], 'a') })).toBe(
      true
    );
  });
});
