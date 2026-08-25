import { describe, expect, it, vi } from 'vitest';
import {
  createDmOutgoingLocalId,
  isLocalDmMessageId,
  retainOutgoingAgainstArchive,
  revokeBlobUrls,
  shouldDecryptDmRecord,
  shouldRetainOutgoing,
  type DmOutgoingDraft,
} from './dm-outgoing';

describe('shouldDecryptDmRecord', () => {
  it('skips local ids and empty envelopes', () => {
    expect(
      shouldDecryptDmRecord({ id: 'local:1', ciphertext: 'c' })
    ).toBe(false);
    expect(shouldDecryptDmRecord({ id: 'real', ciphertext: '' })).toBe(false);
    expect(shouldDecryptDmRecord({ id: 'real', ciphertext: '  ' })).toBe(false);
    expect(shouldDecryptDmRecord({ id: 'real', ciphertext: 'sealed' })).toBe(
      true
    );
  });
});

describe('revokeBlobUrls', () => {
  it('revokes each blob url once', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    revokeBlobUrls(['blob:a', 'blob:a', 'https://x', null, 'blob:b']);
    expect(revoke.mock.calls.map((call) => call[0])).toEqual(['blob:a', 'blob:b']);
    revoke.mockRestore();
  });
});

describe('createDmOutgoingLocalId', () => {
  it('prefixes local ids', () => {
    expect(isLocalDmMessageId(createDmOutgoingLocalId())).toBe(true);
  });
});

const draft = (
  status: DmOutgoingDraft['status'],
  messageId?: string
): DmOutgoingDraft => ({
  localId: 'local:1',
  threadId: 'a::b',
  peerAccountId: 'b',
  text: 'hi',
  createdAt: '2026-08-25T00:00:00.000Z',
  status,
  messageId,
});

describe('shouldRetainOutgoing', () => {
  it('keeps pending and failed overlays', () => {
    expect(shouldRetainOutgoing(draft('pending'), [{ id: 'm1', ciphertext: 'c' }])).toBe(
      true
    );
    expect(shouldRetainOutgoing(draft('failed', 'm1'), [{ id: 'm1', ciphertext: 'c' }])).toBe(
      true
    );
  });

  it('keeps confirmed overlay until mailbox has ciphertext', () => {
    expect(shouldRetainOutgoing(draft('confirmed', 'm1'), [])).toBe(true);
    expect(
      shouldRetainOutgoing(draft('confirmed', 'm1'), [{ id: 'm1', ciphertext: '' }])
    ).toBe(true);
    expect(
      shouldRetainOutgoing(draft('confirmed', 'm1'), [{ id: 'other', ciphertext: 'c' }])
    ).toBe(true);
  });

  it('drops confirmed overlay once mailbox returns a decryptable row', () => {
    expect(
      shouldRetainOutgoing(draft('confirmed', 'm1'), [{ id: 'm1', ciphertext: 'sealed' }])
    ).toBe(false);
  });
});

describe('retainOutgoingAgainstArchive', () => {
  it('prunes only confirmed items the archive can decrypt', () => {
    const pending = draft('pending');
    const confirmed = draft('confirmed', 'm1');
    expect(
      retainOutgoingAgainstArchive([pending, confirmed], [
        { id: 'm1', ciphertext: 'sealed' },
      ])
    ).toEqual([pending]);
  });
});
