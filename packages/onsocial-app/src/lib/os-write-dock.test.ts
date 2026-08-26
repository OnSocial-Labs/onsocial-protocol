import { describe, expect, it } from 'vitest';
import {
  writeDockCanSend,
  writeDockDraftKey,
  writeDockIsThoughtEnlarge,
  writeDockReplyPlaceholder,
  writeDockShouldSendOnEnter,
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

  it('shows expand only after the dock is open', () => {
    expect(writeDockShowExpand(true, false)).toBe(false);
    expect(writeDockShowExpand(true, true)).toBe(true);
    expect(writeDockShowExpand(false, true)).toBe(false);
  });

  it('shows media only after the dock is open', () => {
    expect(writeDockShowMedia(false)).toBe(false);
    expect(writeDockShowMedia(true)).toBe(true);
  });

  it('does not send on Enter during SSR', () => {
    expect(writeDockShouldSendOnEnter()).toBe(false);
  });

  it('names a nested reply or falls back', () => {
    expect(writeDockReplyPlaceholder(null)).toBe('Add a reply…');
    expect(writeDockReplyPlaceholder('  Ada  ')).toBe('Reply to Ada…');
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
});
