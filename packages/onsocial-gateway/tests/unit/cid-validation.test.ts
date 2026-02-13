import { describe, it, expect } from 'vitest';

/**
 * CID validation tests — mirrors the regex in services/storage/index.ts
 *
 * Validates that only well-formed IPFS CIDs (v0 and v1) are accepted,
 * preventing SSRF / path-traversal via crafted CID params.
 */

// Duplicated here rather than importing the non-exported function
const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|b[a-z2-7]{58,})$/;

function isValidCid(cid: string): boolean {
  return CID_PATTERN.test(cid);
}

describe('CID validation', () => {
  // Valid CIDs
  it('accepts CIDv0 (Qm…)', () => {
    expect(isValidCid('QmPK1s3pNYLi9ERiq3BDxKa4XosgWwFRQUydHUtz4YgpqB')).toBe(true);
  });

  it('accepts CIDv1 (bafy…)', () => {
    expect(
      isValidCid('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'),
    ).toBe(true);
  });

  // Invalid / malicious CIDs
  it('rejects empty string', () => {
    expect(isValidCid('')).toBe(false);
  });

  it('rejects path traversal', () => {
    expect(isValidCid('../../../etc/passwd')).toBe(false);
  });

  it('rejects URL-style attack', () => {
    expect(isValidCid('http://evil.com')).toBe(false);
  });

  it('rejects short Qm prefix without enough chars', () => {
    expect(isValidCid('Qm')).toBe(false);
    expect(isValidCid('QmShort')).toBe(false);
  });

  it('rejects non-alphanumeric injection', () => {
    expect(isValidCid('QmPK1s3pNYLi9ERiq3BDxKa4XosgWwFRQUydHUtz4YgpqB/../../etc/passwd')).toBe(
      false,
    );
  });

  it('rejects null bytes', () => {
    expect(isValidCid('QmPK1s3pNYLi9ERiq3B\x00xKa4XosgWwFRQUydHUtz4YgpqB')).toBe(false);
  });
});
