import { describe, expect, it } from 'vitest';
import { messagesThreadChromeTitle } from '@/features/messages/messages-thread-chrome';

describe('messagesThreadChromeTitle', () => {
  it('joins display name and handle when they differ', () => {
    expect(messagesThreadChromeTitle('Ada Lovelace', 'ada.near')).toBe(
      'Ada Lovelace · @ada.near'
    );
  });

  it('uses display name alone when it matches the handle', () => {
    expect(messagesThreadChromeTitle('ada.near', 'ada.near')).toBe('ada.near');
  });

  it('falls back to handle or conversation', () => {
    expect(messagesThreadChromeTitle('', 'ada.near')).toBe('ada.near');
    expect(messagesThreadChromeTitle('', '')).toBe('Conversation');
  });
});
