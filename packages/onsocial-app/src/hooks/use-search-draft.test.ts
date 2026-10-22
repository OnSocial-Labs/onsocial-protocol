import { describe, expect, it } from 'vitest';
import {
  initialSearchDraft,
  reduceSearchDraft,
  type SearchDraftState,
} from './use-search-draft';

const DEBOUNCE = 200;

function type(state: SearchDraftState, value: string, now: number) {
  return reduceSearchDraft(state, {
    type: 'type',
    value,
    now,
    debounceMs: DEBOUNCE,
  });
}

describe('reduceSearchDraft', () => {
  it('keeps spaces in the field and publishes the trimmed text after a pause', () => {
    let state = type(initialSearchDraft(), '2', 0);
    expect(state.draft).toBe('2');
    expect(state.committed).toBe('');

    state = reduceSearchDraft(state, { type: 'flush', now: DEBOUNCE });
    expect(state.committed).toBe('2');

    state = type(state, '2 ', 300);
    expect(state.draft).toBe('2 ');
    expect(state.committed).toBe('2');

    state = type(state, '2 b', 400);
    expect(state.draft).toBe('2 b');
    expect(state.committed).toBe('2');

    state = reduceSearchDraft(state, { type: 'flush', now: 400 + DEBOUNCE });
    expect(state.draft).toBe('2 b');
    expect(state.committed).toBe('2 b');
  });

  it('clears the list immediately', () => {
    let state = type(initialSearchDraft(), 'near', 0);
    state = reduceSearchDraft(state, { type: 'flush', now: DEBOUNCE });
    state = type(state, '', 500);
    expect(state.draft).toBe('');
    expect(state.committed).toBe('');
    expect(state.commitAt).toBeNull();
  });

  it('ignores a URL echo of the text it already published', () => {
    let state = type(initialSearchDraft(), '2 be ', 0);
    state = reduceSearchDraft(state, { type: 'flush', now: DEBOUNCE });
    expect(state.written).toBe('2 be');

    const echoed = reduceSearchDraft(state, {
      type: 'external',
      external: '2 be',
      adopt: true,
    });
    expect(echoed.draft).toBe('2 be ');
    expect(echoed.committed).toBe('2 be');
  });

  it('keeps keystrokes while the field is focused', () => {
    let state = type(initialSearchDraft(), '2 be', 0);
    state = reduceSearchDraft(state, { type: 'flush', now: DEBOUNCE });
    state = reduceSearchDraft(state, { type: 'focus' });
    state = type(state, '2 bet', 500);

    const stale = reduceSearchDraft(state, {
      type: 'external',
      external: '2 be',
      adopt: true,
    });
    expect(stale.draft).toBe('2 bet');
  });

  it('adopts an outside query when the field is idle', () => {
    let state = type(initialSearchDraft(), '2 be', 0);
    state = reduceSearchDraft(state, { type: 'flush', now: DEBOUNCE });
    state = reduceSearchDraft(state, {
      type: 'external',
      external: '',
      adopt: true,
    });
    expect(state.draft).toBe('');
    expect(state.committed).toBe('');
  });

  it('replace applies Back even while focused', () => {
    let state = reduceSearchDraft(initialSearchDraft('album'), { type: 'focus' });
    state = reduceSearchDraft(state, { type: 'replace', value: 'quiet' });
    expect(state.draft).toBe('quiet');
    expect(state.committed).toBe('quiet');
    expect(state.focused).toBe(true);
  });
});
