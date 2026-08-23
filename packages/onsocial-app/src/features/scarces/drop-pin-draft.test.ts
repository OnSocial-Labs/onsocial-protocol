import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  clearDropPinDraft,
  fileFingerprint,
  loadDropPinDraft,
  musicPinFingerprint,
  saveDropPinDraft,
  DROP_PIN_DRAFT_TTL_MS,
} from './drop-pin-draft';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  vi.stubGlobal('window', { localStorage });
  return localStorage;
}

describe('drop-pin-draft', () => {
  beforeEach(() => {
    installMemoryLocalStorage().clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('fingerprints files by name, size, and lastModified', () => {
    const file = new File(['x'], 'cover.png', { type: 'image/png' });
    expect(fileFingerprint(file)).toContain('cover.png');
    expect(fileFingerprint(file)).toContain(String(file.size));
  });

  it('saves and loads a music draft for the same account', () => {
    const cover = new File(['c'], 'cover.png', { type: 'image/png' });
    const track = new File(['t'], 'song.mp3', { type: 'audio/mpeg' });
    const fingerprint = musicPinFingerprint({
      format: 'single',
      tracks: [track],
      lyrics: [''],
      cover,
    });
    saveDropPinDraft({
      kind: 'music',
      templateId: 'audio',
      musicFormat: 'single',
      accountId: 'alice.near',
      fingerprint,
      savedAt: Date.now(),
      pinned: {
        playable: [{ cid: 'bafyTrack', mime: 'audio/mpeg', title: 'song' }],
        coverCid: 'bafyCover',
        coverHash: 'hash',
      },
    });
    const loaded = loadDropPinDraft('alice.near');
    expect(loaded?.kind).toBe('music');
    if (loaded?.kind === 'music') {
      expect(loaded.templateId).toBe('audio');
      expect(loaded.musicFormat).toBe('single');
      expect(loaded.pinned.coverCid).toBe('bafyCover');
      expect(loaded.fingerprint).toBe(fingerprint);
    }
    expect(loadDropPinDraft('bob.near')).toBeNull();
  });

  it('requires templateId and pieceCount for large-set drafts', () => {
    saveDropPinDraft({
      kind: 'large-set',
      templateId: 'art',
      accountId: 'alice.near',
      fingerprint: 'large-set::a',
      savedAt: Date.now(),
      pinned: { cid: 'bafySet', ext: 'png', pieceCount: 120 },
    });
    const loaded = loadDropPinDraft('alice.near');
    expect(loaded?.kind).toBe('large-set');
    if (loaded?.kind === 'large-set') {
      expect(loaded.templateId).toBe('art');
      expect(loaded.pinned.pieceCount).toBe(120);
    }

    // Missing templateId is rejected by the v2 reader.
    window.localStorage.setItem(
      'onsocial.drop-pin-draft.v2',
      JSON.stringify({
        kind: 'large-set',
        accountId: 'alice.near',
        fingerprint: 'large-set::b',
        savedAt: Date.now(),
        pinned: { cid: 'bafySet', ext: 'png', pieceCount: 3 },
      })
    );
    expect(loadDropPinDraft('alice.near')).toBeNull();
  });

  it('saves and loads a generate-job draft', () => {
    saveDropPinDraft({
      kind: 'generate-job',
      templateId: 'art',
      accountId: 'alice.near',
      fingerprint: 'generate-job::job-1',
      savedAt: Date.now(),
      jobId: 'job-1',
    });
    const loaded = loadDropPinDraft('alice.near');
    expect(loaded?.kind).toBe('generate-job');
    if (loaded?.kind === 'generate-job') {
      expect(loaded.jobId).toBe('job-1');
      expect(loaded.templateId).toBe('art');
    }

    window.localStorage.setItem(
      'onsocial.drop-pin-draft.v2',
      JSON.stringify({
        kind: 'generate-job',
        templateId: 'art',
        accountId: 'alice.near',
        fingerprint: 'generate-job::empty',
        savedAt: Date.now(),
        jobId: '   ',
      })
    );
    expect(loadDropPinDraft('alice.near')).toBeNull();
  });

  it('expires drafts past the TTL', () => {
    vi.useFakeTimers();
    saveDropPinDraft({
      kind: 'large-set',
      templateId: 'custom',
      accountId: 'alice.near',
      fingerprint: 'large-set::a',
      savedAt: Date.now(),
      pinned: { cid: 'bafySet', ext: 'png', pieceCount: 50 },
    });
    vi.advanceTimersByTime(DROP_PIN_DRAFT_TTL_MS + 1);
    expect(loadDropPinDraft('alice.near')).toBeNull();
  });

  it('clears drafts', () => {
    saveDropPinDraft({
      kind: 'writing',
      templateId: 'writing',
      writingFormat: 'book',
      accountId: 'alice.near',
      fingerprint: 'writing::a',
      savedAt: Date.now(),
      pinned: {
        writingManifestCid: 'bafyMan',
        writingFormat: 'book',
        chapterCount: 2,
        coverCid: 'bafyCover',
        coverHash: 'hash',
        hasBookPdf: true,
      },
    });
    const loaded = loadDropPinDraft('alice.near');
    expect(loaded?.kind).toBe('writing');
    if (loaded?.kind === 'writing') {
      expect(loaded.pinned.hasBookPdf).toBe(true);
    }
    clearDropPinDraft();
    expect(loadDropPinDraft('alice.near')).toBeNull();
  });
});
