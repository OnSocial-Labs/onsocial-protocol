import { describe, expect, it } from 'vitest';
import {
  autolinkDisplayHost,
  normalizeAutolinkUrl,
  splitRichText,
} from './rich-text.js';

describe('splitRichText', () => {
  it('segments mentions, tickers, hashtags, and urls', () => {
    expect(splitRichText('hi @alice.testnet $SOCIAL #gm')).toEqual([
      { type: 'text', value: 'hi ' },
      {
        type: 'mention',
        value: '@alice.testnet',
        accountId: 'alice.testnet',
      },
      { type: 'text', value: ' ' },
      { type: 'ticker', value: '$SOCIAL', slug: 'social' },
      { type: 'text', value: ' ' },
      { type: 'hashtag', value: '#gm', slug: 'gm' },
    ]);
  });

  it('keeps url fragments from becoming hashtags', () => {
    expect(
      splitRichText('see https://onsocial.id/#topics not a hashtag')
    ).toEqual([
      { type: 'text', value: 'see ' },
      {
        type: 'url',
        value: 'https://onsocial.id/#topics',
        href: 'https://onsocial.id/#topics',
      },
      { type: 'text', value: ' not a hashtag' },
    ]);
  });

  it('formats autolink hosts and peels trailing punct', () => {
    expect(autolinkDisplayHost('https://www.onsocial.id/path')).toBe(
      'onsocial.id'
    );
    expect(normalizeAutolinkUrl('https://onsocial.id/.')).toBe(
      'https://onsocial.id/'
    );
  });
});
