import { describe, expect, it } from 'vitest';
import {
  formatProfileLinkForEditor,
  isProfileLinkEditorPreviewable,
  profileLinkEditorFieldErrors,
  profileLinkEditorInlineError,
  sanitizeOnSocialLinkInput,
} from '@/lib/profile-links';

describe('sanitizeOnSocialLinkInput', () => {
  it('preserves pasted OnSocial profile URLs for later normalize', () => {
    expect(
      sanitizeOnSocialLinkInput(
        'https://testnet.onsocial.id/@alice.testnet'
      )
    ).toBe('https://testnet.onsocial.id/@alice.testnet');
    expect(
      sanitizeOnSocialLinkInput('portal.onsocial.id/u/bob.testnet')
    ).toBe('portal.onsocial.id/u/bob.testnet');
  });

  it('still filters bare NEAR account typing', () => {
    expect(sanitizeOnSocialLinkInput('@Alice.Testnet')).toBe('alice.testnet');
    expect(sanitizeOnSocialLinkInput('Alice!!!Testnet')).toBe('alicetestnet');
  });

  it('lets formatProfileLinkForEditor extract accounts after sanitize', () => {
    const pasted = sanitizeOnSocialLinkInput(
      'https://testnet.onsocial.id/@carol.testnet'
    );
    expect(formatProfileLinkForEditor(pasted, 'onsocial')).toEqual({
      value: 'carol.testnet',
      error: null,
      valid: true,
    });
    const portalPaste = sanitizeOnSocialLinkInput(
      'https://portal.onsocial.id/u/dave.testnet'
    );
    expect(formatProfileLinkForEditor(portalPaste, 'onsocial')).toEqual({
      value: 'dave.testnet',
      error: null,
      valid: true,
    });
  });
});

describe('formatProfileLinkForEditor', () => {
  it('clears empty values', () => {
    expect(formatProfileLinkForEditor('  ', 'website')).toEqual({
      value: '',
      error: null,
      valid: true,
    });
  });

  it('normalizes website for editor display', () => {
    expect(formatProfileLinkForEditor('https://example.com/', 'website')).toEqual({
      value: 'example.com',
      error: null,
      valid: true,
    });
  });

  it('rejects invalid website hostnames', () => {
    const result = formatProfileLinkForEditor('localhost', 'website');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/domain/i);
  });

  it('normalizes OnSocial NEAR accounts and profile URLs', () => {
    expect(formatProfileLinkForEditor('Alice.Testnet', 'onsocial')).toEqual({
      value: 'alice.testnet',
      error: null,
      valid: true,
    });
    expect(
      formatProfileLinkForEditor('https://testnet.onsocial.id/@bob.testnet', 'onsocial')
    ).toEqual({
      value: 'bob.testnet',
      error: null,
      valid: true,
    });
  });

  it('rejects OnSocial accounts with the wrong network suffix', () => {
    const result = formatProfileLinkForEditor('alice.near', 'onsocial');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/testnet|\.near/i);
  });

  it('normalizes social handles', () => {
    expect(formatProfileLinkForEditor('@alice', 'x')).toEqual({
      value: 'alice',
      error: null,
      valid: true,
    });
  });

  it('rejects invalid social handles', () => {
    const result = formatProfileLinkForEditor('!!!', 'github');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/GitHub/i);
  });
});

describe('profileLinkEditorInlineError', () => {
  it('returns short copy for inline display', () => {
    expect(profileLinkEditorInlineError('website')).toBe('Invalid URL');
    expect(profileLinkEditorInlineError('onsocial')).toBe('Invalid account');
    expect(
      profileLinkEditorInlineError(
        'onsocial',
        'Account not found on this network'
      )
    ).toBe('Not found');
    expect(
      profileLinkEditorInlineError('onsocial', 'Could not verify account')
    ).toBe("Can't verify");
    expect(profileLinkEditorInlineError('x')).toBe('Invalid handle');
  });
});

describe('profileLinkEditorFieldErrors', () => {
  it('returns only invalid non-empty fields', () => {
    const errors = profileLinkEditorFieldErrors({
      website: 'example.com',
      onsocial: '',
      x: 'valid',
      telegram: '',
      github: '!!!',
      instagram: '',
      tiktok: '',
      linkedin: '',
      youtube: '',
      discord: '',
    });

    expect(errors.website).toBeUndefined();
    expect(errors.x).toBeUndefined();
    expect(errors.github).toBeDefined();
  });
});

describe('isProfileLinkEditorPreviewable', () => {
  it('hides invalid draft links from preview', () => {
    expect(isProfileLinkEditorPreviewable('example.com', 'website')).toBe(true);
    expect(isProfileLinkEditorPreviewable('not valid!!!', 'x')).toBe(false);
    expect(isProfileLinkEditorPreviewable('', 'x')).toBe(false);
  });
});
