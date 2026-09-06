import { describe, expect, it } from 'vitest';
import {
  appendComposerThreadBeat,
  beatToComposerSubmit,
  canAddComposerThreadBeat,
  collapseComposerThreadToFirst,
  collapseTrailingEmptyComposerBeat,
  composerBeatHasContent,
  composerBeatsToSubmit,
  composerSubmitHasContent,
  emptyComposerBeat,
  splitComposerThread,
  threadPartialCopy,
} from '@/lib/composer-thread';

describe('composer thread', () => {
  it('starts as one empty beat and blocks plus', () => {
    const beats = [emptyComposerBeat()];
    expect(composerBeatHasContent(beats[0]!)).toBe(false);
    expect(canAddComposerThreadBeat(beats)).toBe(false);
    expect(appendComposerThreadBeat(beats)).toHaveLength(1);
  });

  it('enables plus after the last beat has text or media', () => {
    const withText = [emptyComposerBeat({ text: 'hello' })];
    expect(canAddComposerThreadBeat(withText)).toBe(true);
    const withFile = [
      emptyComposerBeat({ files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] }),
    ];
    expect(canAddComposerThreadBeat(withFile)).toBe(true);
  });

  it('appends an empty beat and collapses it when focus leaves', () => {
    const started = appendComposerThreadBeat([emptyComposerBeat({ text: 'one' })]);
    expect(started).toHaveLength(2);
    expect(composerBeatHasContent(started[1]!)).toBe(false);
    const collapsed = collapseTrailingEmptyComposerBeat(started, 0);
    expect(collapsed.beats).toHaveLength(1);
    expect(collapsed.focus).toBe(0);
    expect(collapsed.beats[0]?.text).toBe('one');
  });

  it('keeps a filled second beat when focusing the first', () => {
    const beats = [
      emptyComposerBeat({ text: 'one' }),
      emptyComposerBeat({ text: 'two' }),
    ];
    const next = collapseTrailingEmptyComposerBeat(beats, 0);
    expect(next.beats).toHaveLength(2);
    expect(next.focus).toBe(0);
  });

  it('packs a thread submit from filled beats only', () => {
    const payload = composerBeatsToSubmit([
      emptyComposerBeat({ text: 'root' }),
      emptyComposerBeat(),
      emptyComposerBeat({ text: 'two' }),
    ]);
    expect(payload?.text).toBe('root');
    expect(payload?.thread).toEqual([{ text: 'two' }]);
    expect(splitComposerThread(payload!)).toHaveLength(2);
  });

  it('strips nested thread when splitting', () => {
    expect(
      splitComposerThread({
        text: 'a',
        thread: [{ text: 'b' }, { text: '' }],
      }).map((row) => row.text)
    ).toEqual(['a', 'b']);
    expect(composerSubmitHasContent({ text: '   ' })).toBe(false);
  });

  it('maps beat media and drops onto submit', () => {
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    const submit = beatToComposerSubmit(
      emptyComposerBeat({
        text: 'drop',
        files: [file],
        drop: { collectionId: 'c1', title: 'Night' },
      })
    );
    expect(submit.files).toEqual([file]);
    expect(submit.drop?.collectionId).toBe('c1');
  });

  it('collapses extras back to a single post', () => {
    expect(
      collapseComposerThreadToFirst([
        emptyComposerBeat({ text: 'one' }),
        emptyComposerBeat({ text: 'two' }),
      ])
    ).toHaveLength(1);
  });

  it('uses the locked partial copy', () => {
    expect(threadPartialCopy(2, 5)).toBe('Posted 2 of 5.');
  });
});
