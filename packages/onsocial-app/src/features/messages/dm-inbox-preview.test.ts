import { describe, expect, it } from 'vitest';
import {
  DM_INBOX_PREVIEW_MAX_CHARS,
  DM_INBOX_PREVIEW_MEDIA,
  formatDmInboxPreview,
  inboxPreviewFromDecrypted,
} from './dm-inbox-preview';

describe('formatDmInboxPreview', () => {
  it('collapses whitespace and trims', () => {
    expect(formatDmInboxPreview({ text: '  hello   \n world  ' })).toBe(
      'hello world'
    );
  });

  it('ellipsizes long text at 72 characters including the mark', () => {
    const text = 'x'.repeat(80);
    const out = formatDmInboxPreview({ text });
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBe(DM_INBOX_PREVIEW_MAX_CHARS);
  });

  it('uses a media fallback when text is empty', () => {
    expect(formatDmInboxPreview({ text: '', hasMedia: true })).toBe(
      DM_INBOX_PREVIEW_MEDIA
    );
    expect(formatDmInboxPreview({ text: '   ', hasMedia: true })).toBe(
      DM_INBOX_PREVIEW_MEDIA
    );
  });

  it('returns empty when there is nothing to show', () => {
    expect(formatDmInboxPreview({ text: '' })).toBe('');
    expect(formatDmInboxPreview({ text: null })).toBe('');
    expect(formatDmInboxPreview({ text: undefined })).toBe('');
  });
});

describe('inboxPreviewFromDecrypted', () => {
  it('skips decrypt-failure placeholders', () => {
    expect(
      inboxPreviewFromDecrypted({
        text: 'Unable to decrypt on this device.',
      })
    ).toBe('');
  });

  it('keeps a media label when decrypt fails but media exists', () => {
    expect(
      inboxPreviewFromDecrypted({
        text: 'Unable to decrypt on this device.',
        hasMedia: true,
      })
    ).toBe(DM_INBOX_PREVIEW_MEDIA);
  });

  it('formats opened text', () => {
    expect(inboxPreviewFromDecrypted({ text: 'See you there' })).toBe(
      'See you there'
    );
  });
});
