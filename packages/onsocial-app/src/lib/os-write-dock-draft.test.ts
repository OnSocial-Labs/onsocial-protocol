import { describe, expect, it } from 'vitest';
import {
  clearWriteDockDraft,
  dropWriteDockDraftMemory,
  readWriteDockDraft,
  writeDockDraftFromComposer,
  writeDockDraftIsDirty,
  writeDockExpandSeed,
  writeDockToComposerSeed,
  writeWriteDockDraft,
} from '@/lib/os-write-dock-draft';

describe('write dock draft', () => {
  it('round-trips text and files, then clears', () => {
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    writeWriteDockDraft('post:a', { text: 'hello', files: [file] });
    expect(readWriteDockDraft('post:a')).toEqual({ text: 'hello', files: [file] });
    clearWriteDockDraft('post:a');
    expect(readWriteDockDraft('post:a')).toEqual({ text: '', files: [] });
  });

  it('drops an empty draft instead of storing it', () => {
    writeWriteDockDraft('post:b', { text: 'keep', files: [] });
    writeWriteDockDraft('post:b', { text: '   ', files: [] });
    expect(readWriteDockDraft('post:b')).toEqual({ text: '', files: [] });
  });

  it('keeps drafts isolated by key', () => {
    writeWriteDockDraft('post:one', { text: 'one', files: [] });
    writeWriteDockDraft('dm:two', { text: 'two', files: [] });
    expect(readWriteDockDraft('post:one').text).toBe('one');
    expect(readWriteDockDraft('dm:two').text).toBe('two');
    clearWriteDockDraft('post:one');
    clearWriteDockDraft('dm:two');
  });

  it('treats whitespace-only as empty', () => {
    expect(writeDockDraftIsDirty({ text: '  ', files: [] })).toBe(false);
    expect(
      writeDockDraftIsDirty({ text: '', files: [new File([], 'a')] })
    ).toBe(true);
  });

  it('rehydrates text from storage after memory is gone', () => {
    writeWriteDockDraft('post:reload', { text: 'keep me', files: [] });
    dropWriteDockDraftMemory('post:reload');
    expect(readWriteDockDraft('post:reload')).toEqual({
      text: 'keep me',
      files: [],
    });
    clearWriteDockDraft('post:reload');
    dropWriteDockDraftMemory('post:reload');
    expect(readWriteDockDraft('post:reload')).toEqual({ text: '', files: [] });
  });

  it('does not persist files — only text survives a reload', () => {
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    writeWriteDockDraft('post:file', { text: 'caption', files: [file] });
    expect(readWriteDockDraft('post:file').files).toEqual([file]);
    dropWriteDockDraftMemory('post:file');
    expect(readWriteDockDraft('post:file')).toEqual({
      text: 'caption',
      files: [],
    });
    clearWriteDockDraft('post:file');
  });

  it('seeds the full composer from a dock draft and back', () => {
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    const seed = writeDockToComposerSeed({ text: 'hello', files: [file] });
    expect(seed).toEqual({ initialText: 'hello', initialFiles: [file] });
    expect(
      writeDockDraftFromComposer({ text: 'hello', files: [file] })
    ).toEqual({ text: 'hello', files: [file] });
    expect(writeDockDraftFromComposer({ text: '', files: [] })).toEqual({
      text: '',
      files: [],
    });
  });

  it('prefers payload files over text-only stored draft on expand', () => {
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    writeWriteDockDraft('post:expand', { text: 'stored line', files: [] });
    dropWriteDockDraftMemory('post:expand');
    expect(
      writeDockExpandSeed('post:expand', { text: '', files: [file] })
    ).toEqual({ initialText: 'stored line', initialFiles: [file] });
    clearWriteDockDraft('post:expand');
  });

  it('round-trips payload files when draft memory still holds them', () => {
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    writeWriteDockDraft('post:expand', { text: 'hello', files: [file] });
    expect(
      writeDockExpandSeed('post:expand', { text: 'hello', files: [file] })
    ).toEqual({ initialText: 'hello', initialFiles: [file] });
    clearWriteDockDraft('post:expand');
  });
});
