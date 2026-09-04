import { describe, expect, it } from 'vitest';
import {
  autolinkDisplayHost,
  isAutolinkableHostname,
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

  it('does not chip bare @handles without a named-account root', () => {
    expect(splitRichText('hi @alice and @bob.testnet')).toEqual([
      { type: 'text', value: 'hi @alice and ' },
      {
        type: 'mention',
        value: '@bob.testnet',
        accountId: 'bob.testnet',
      },
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

  it('autolinks www and bare domains with https href', () => {
    expect(splitRichText('visit www.onsocial.id please')).toEqual([
      { type: 'text', value: 'visit ' },
      {
        type: 'url',
        value: 'www.onsocial.id',
        href: 'https://www.onsocial.id',
      },
      { type: 'text', value: ' please' },
    ]);
    expect(splitRichText('see onsocial.id/docs.')).toEqual([
      { type: 'text', value: 'see ' },
      {
        type: 'url',
        value: 'onsocial.id/docs',
        href: 'https://onsocial.id/docs',
      },
      { type: 'text', value: '.' },
    ]);
  });

  it('does not autolink a bare domain glued to more letters', () => {
    expect(splitRichText('see onsocial.idand later')).toEqual([
      { type: 'text', value: 'see onsocial.idand later' },
    ]);
    expect(splitRichText('see onsocial.id later')).toEqual([
      { type: 'text', value: 'see ' },
      {
        type: 'url',
        value: 'onsocial.id',
        href: 'https://onsocial.id',
      },
      { type: 'text', value: ' later' },
    ]);
  });

  it('does not autolink near account-like bare hosts', () => {
    expect(splitRichText('talk to alice.near later')).toEqual([
      { type: 'text', value: 'talk to alice.near later' },
    ]);
  });

  it('waits for a 2+ letter TLD before coloring www / https hosts', () => {
    expect(splitRichText('www.onsocial')).toEqual([
      { type: 'text', value: 'www.onsocial' },
    ]);
    expect(splitRichText('www.onsocial.i')).toEqual([
      { type: 'text', value: 'www.onsocial.i' },
    ]);
    expect(splitRichText('https://onsocial.i')).toEqual([
      { type: 'text', value: 'https://onsocial.i' },
    ]);
    expect(splitRichText('www.onsocial.id')).toEqual([
      {
        type: 'url',
        value: 'www.onsocial.id',
        href: 'https://www.onsocial.id',
      },
    ]);
  });
});

describe('isAutolinkableHostname', () => {
  it('requires tld length >= 2', () => {
    expect(isAutolinkableHostname('onsocial.i')).toBe(false);
    expect(isAutolinkableHostname('onsocial.id')).toBe(true);
    expect(isAutolinkableHostname('www.onsocial.co')).toBe(true);
  });
});
