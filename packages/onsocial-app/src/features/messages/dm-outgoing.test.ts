import { describe, expect, it, vi } from 'vitest';
import {
  createDmOutgoingLocalId,
  isLocalDmMessageId,
  revokeBlobUrls,
  shouldDecryptDmRecord,
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
