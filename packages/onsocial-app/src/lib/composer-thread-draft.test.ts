import { describe, expect, it } from 'vitest';
import { emptyComposerBeat } from '@/lib/composer-thread';
import {
  clearComposerThreadDraft,
  composerNewPostDraftKey,
  composerThreadDraftIsDirty,
  dropComposerThreadDraftMemory,
  readComposerThreadDraft,
  writeComposerThreadDraft,
} from '@/lib/composer-thread-draft';

describe('composer thread draft', () => {
  it('uses an isolated new-post key per scope', () => {
    expect(composerNewPostDraftKey()).toBe('post:new:personal');
    expect(composerNewPostDraftKey('builders')).toBe('post:new:builders');
  });

  it('round-trips filled beats and files, then clears', () => {
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    const key = composerNewPostDraftKey('round');
    writeComposerThreadDraft(key, [
      emptyComposerBeat({ text: 'one' }),
      emptyComposerBeat({ files: [file] }),
      emptyComposerBeat(),
    ]);
    const draft = readComposerThreadDraft(key);
    expect(draft.map((row) => row.text)).toEqual(['one', '']);
    expect(draft[1]?.files).toEqual([file]);
    clearComposerThreadDraft(key);
    expect(readComposerThreadDraft(key)).toEqual([]);
  });

  it('drops an empty draft instead of storing it', () => {
    const key = composerNewPostDraftKey('empty');
    writeComposerThreadDraft(key, [emptyComposerBeat({ text: 'keep' })]);
    writeComposerThreadDraft(key, [emptyComposerBeat()]);
    expect(readComposerThreadDraft(key)).toEqual([]);
  });

  it('rehydrates text after memory is gone, not files', () => {
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    const key = composerNewPostDraftKey('reload');
    writeComposerThreadDraft(key, [
      emptyComposerBeat({ text: 'keep me', files: [file] }),
      emptyComposerBeat({ text: 'two' }),
    ]);
    dropComposerThreadDraftMemory(key);
    const draft = readComposerThreadDraft(key);
    expect(draft.map((row) => row.text)).toEqual(['keep me', 'two']);
    expect(draft[0]?.files).toEqual([]);
    clearComposerThreadDraft(key);
  });

  it('keeps poll, place, and labels across restore', () => {
    const key = composerNewPostDraftKey('labels');
    const beat = emptyComposerBeat({ text: 'vote' });
    beat.pollEnabled = true;
    beat.pollOptions = ['yes', 'no'];
    beat.pollDurationMs = 86_400_000;
    beat.contentWarning = 'cw';
    beat.nsfw = true;
    beat.placeDraft = 'near';
    beat.placeOpen = true;
    writeComposerThreadDraft(key, [beat]);
    const draft = readComposerThreadDraft(key)[0];
    expect(draft?.pollEnabled).toBe(true);
    expect(draft?.pollOptions).toEqual(['yes', 'no']);
    expect(draft?.pollDurationMs).toBe(86_400_000);
    expect(draft?.contentWarning).toBe('cw');
    expect(draft?.nsfw).toBe(true);
    expect(draft?.placeDraft).toBe('near');
    expect(draft?.placeOpen).toBe(true);
    clearComposerThreadDraft(key);
  });

  it('keeps article cover craft across restore', () => {
    const key = composerNewPostDraftKey('cover');
    const beat = emptyComposerBeat({
      text: 'body',
      articleMode: true,
      articleTitle: 'Title',
    });
    beat.articleCoverTheme = {
      cardFormat: 'poster',
      cardPalette: 'noir',
      cardBg: 'poster-noir',
      cardMarkShape: 'bar',
      cardMarkColor: 'amber',
      cardTitleAlign: 'left',
    };
    writeComposerThreadDraft(key, [beat]);
    dropComposerThreadDraftMemory(key);
    const draft = readComposerThreadDraft(key)[0];
    expect(draft?.articleMode).toBe(true);
    expect(draft?.articleTitle).toBe('Title');
    expect(draft?.articleCoverTheme.cardBg).toBe('poster-noir');
    expect(draft?.articleCoverTheme.cardFormat).toBe('poster');
    expect(draft?.articleCoverTheme.cardMarkShape).toBe('bar');
    expect(draft?.articleCoverTheme.cardMarkColor).toBe('amber');
    clearComposerThreadDraft(key);
  });

  it('restores a follow-up as a post', () => {
    const key = composerNewPostDraftKey('follow-up');
    writeComposerThreadDraft(key, [
      emptyComposerBeat({ text: 'root' }),
      emptyComposerBeat({
        text: 'next',
        articleMode: true,
        articleTitle: 'Not a title',
      }),
    ]);
    const draft = readComposerThreadDraft(key);
    expect(draft[1]?.text).toBe('next');
    expect(draft[1]?.articleMode).toBe(false);
    expect(draft[1]?.articleTitle).toBe('');
    clearComposerThreadDraft(key);
  });

  it('treats any filled beat as dirty', () => {
    expect(composerThreadDraftIsDirty([emptyComposerBeat()])).toBe(false);
    expect(
      composerThreadDraftIsDirty([
        emptyComposerBeat(),
        emptyComposerBeat({ text: 'two' }),
      ])
    ).toBe(true);
  });
});
