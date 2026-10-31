import { describe, expect, it } from 'vitest';
import {
  WRITE_DOCK_ADD_REPLY_PLACEHOLDER,
  writeDockCanSend,
  writeDockDraftKey,
  writeDockInputHeightPx,
  writeDockInputLineHeightPx,
  writeDockInputMaxLines,
  writeDockIsThoughtEnlarge,
  writeDockReplyPlaceholder,
  writeDockReplyPreview,
  writeDockReplySpokenName,
  writeDockShouldClearReplyOnDismiss,
  writeDockShouldSendOnEnter,
  writeDockShowCompactBarTools,
  writeDockShowExpand,
  writeDockShowMedia,
  writeDockShowSend,
} from '@/lib/os-write-dock';

describe('os write dock helpers', () => {
  it('enables send when there is text or media', () => {
    expect(writeDockCanSend('', 0)).toBe(false);
    expect(writeDockCanSend('   ', 0)).toBe(false);
    expect(writeDockCanSend('hi', 0)).toBe(true);
    expect(writeDockCanSend('', 1)).toBe(true);
    expect(writeDockCanSend('hi', 1, true)).toBe(false);
  });

  it('shows send only when there is something to send or a send is pending', () => {
    expect(writeDockShowSend(false)).toBe(false);
    expect(writeDockShowSend(true)).toBe(true);
    expect(writeDockShowSend(false, true)).toBe(true);
  });

  it('shows expand in the footer once the compose session opens', () => {
    expect(writeDockShowExpand(true, false)).toBe(false);
    expect(writeDockShowExpand(true, true)).toBe(true);
    expect(writeDockShowExpand(false, true)).toBe(false);
  });

  it('shows media in the footer once the compose session opens', () => {
    expect(writeDockShowMedia(false)).toBe(false);
    expect(writeDockShowMedia(true)).toBe(true);
  });

  it('shows compact bar tools only while the footer is closed', () => {
    expect(writeDockShowCompactBarTools(false)).toBe(true);
    expect(writeDockShowCompactBarTools(true)).toBe(false);
  });

  it('does not send on Enter during SSR', () => {
    expect(writeDockShouldSendOnEnter()).toBe(false);
  });

  it('clears an empty reply on dismiss, and keeps a draft', () => {
    expect(
      writeDockShouldClearReplyOnDismiss({ text: '', fileCount: 0 })
    ).toBe(true);
    expect(
      writeDockShouldClearReplyOnDismiss({ text: '   ', fileCount: 0 })
    ).toBe(true);
    expect(
      writeDockShouldClearReplyOnDismiss({ text: 'hi', fileCount: 0 })
    ).toBe(false);
    expect(
      writeDockShouldClearReplyOnDismiss({ text: '', fileCount: 1 })
    ).toBe(false);
    expect(
      writeDockShouldClearReplyOnDismiss({
        text: '',
        fileCount: 0,
        pending: true,
      })
    ).toBe(false);
    expect(
      writeDockShouldClearReplyOnDismiss({
        text: '',
        fileCount: 0,
        hasError: true,
      })
    ).toBe(false);
    expect(
      writeDockShouldClearReplyOnDismiss({
        text: '',
        fileCount: 0,
        focusInsideDock: true,
      })
    ).toBe(false);
  });

  it('names a nested reply or falls back', () => {
    expect(WRITE_DOCK_ADD_REPLY_PLACEHOLDER).toBe('Add a reply…');
    expect(writeDockReplyPlaceholder(null)).toBe(WRITE_DOCK_ADD_REPLY_PLACEHOLDER);
    expect(writeDockReplyPlaceholder('  Ada  ')).toBe('Reply to Ada…');
    expect(writeDockReplySpokenName('alice.testnet')).toBe('Alice');
    expect(writeDockReplySpokenName('alice.testnet', 'Night')).toBe('Night');
    expect(writeDockReplySpokenName('alice.testnet', 'alice.testnet')).toBe(
      'Alice'
    );
  });

  it('previews the answered post as one truncated line', () => {
    expect(writeDockReplyPreview('')).toBe('');
    expect(writeDockReplyPreview('   ')).toBe('');
    expect(writeDockReplyPreview('plain words')).toBe('plain words');
    expect(
      writeDockReplyPreview(JSON.stringify({ text: 'that drop was unreal' }))
    ).toBe('that drop was unreal');
    expect(writeDockReplyPreview('line one\n\nline two')).toBe(
      'line one line two'
    );
    const long = writeDockReplyPreview('x'.repeat(140));
    expect(long.endsWith('…')).toBe(true);
    expect(long.length).toBeLessThanOrEqual(97);
  });

  it('namespaces draft keys by surface', () => {
    expect(writeDockDraftKey('post', 'a/1')).toBe('post:a/1');
    expect(writeDockDraftKey('dm', 'alice.near')).toBe('dm:alice.near');
  });

  it('treats thought enlarge as the viewer medium, not listen or read', () => {
    expect(writeDockIsThoughtEnlarge(true, 'viewer')).toBe(true);
    expect(writeDockIsThoughtEnlarge(true, 'audio')).toBe(false);
    expect(writeDockIsThoughtEnlarge(true, 'writing')).toBe(false);
    expect(writeDockIsThoughtEnlarge(false, 'viewer')).toBe(false);
  });

  it('snaps compose height to full lines', () => {
    const line = writeDockInputLineHeightPx(16);
    expect(writeDockInputMaxLines(false)).toBe(4);
    expect(writeDockInputMaxLines(true)).toBe(3);
    expect(writeDockInputHeightPx(line, 4)).toBe(line);
    expect(writeDockInputHeightPx(line * 2.1, 4)).toBe(line * 3);
    expect(writeDockInputHeightPx(line * 5, 3)).toBe(line * 3);
  });
});
