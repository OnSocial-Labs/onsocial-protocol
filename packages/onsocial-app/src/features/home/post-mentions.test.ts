import { describe, expect, it } from 'vitest';
import {
  extractMentionsFromText,
  findActiveMentionQuery,
  insertMentionAt,
  normalizeMentionAccountId,
  postMetaFromText,
} from '@/features/home/post-mentions';
import { splitComposerRichText, splitPostRichText, autolinkDisplayHost } from '@/features/home/post-rich-segments';

describe('post-mentions', () => {
  it('normalizes account ids', () => {
    expect(normalizeMentionAccountId('@Alice.Testnet')).toBe('alice.testnet');
    expect(normalizeMentionAccountId('bob.near')).toBe('bob.near');
  });

  it('extracts unique mentions from body text', () => {
    expect(
      extractMentionsFromText('hey @Alice.Testnet and @bob.testnet @alice.testnet')
    ).toEqual(['alice.testnet', 'bob.testnet']);
    expect(extractMentionsFromText('no mentions here')).toEqual([]);
    expect(extractMentionsFromText('email user@host.com stays plain')).toEqual(
      []
    );
  });

  it('builds post meta with hashtags, tickers, and mentions', () => {
    expect(postMetaFromText('hi @alice.testnet #NEAR $SOCIAL')).toEqual({
      hashtags: ['near'],
      tickers: ['social'],
      mentions: ['alice.testnet'],
    });
    expect(postMetaFromText('plain')).toEqual({});
    expect(postMetaFromText('price is $100 not a ticker')).toEqual({});
  });

  it('finds active mention query at caret', () => {
    expect(findActiveMentionQuery('hi @ali', 7)).toEqual({
      start: 3,
      end: 7,
      query: 'ali',
    });
    expect(findActiveMentionQuery('hi @', 4)).toEqual({
      start: 3,
      end: 4,
      query: '',
    });
    expect(findActiveMentionQuery('hi @ali there', 7)).toEqual({
      start: 3,
      end: 7,
      query: 'ali',
    });
    expect(findActiveMentionQuery('user@host', 9)).toBeNull();
    expect(findActiveMentionQuery('hi @ali there', 13)).toBeNull();
  });

  it('inserts a completed mention at the active range', () => {
    expect(insertMentionAt('hi @ali', { start: 3, end: 7 }, 'alice.testnet')).toEqual(
      {
        text: 'hi @alice.testnet ',
        caret: 18,
      }
    );
    expect(
      insertMentionAt('hi @ali!', { start: 3, end: 7 }, 'alice.testnet')
    ).toEqual({
      text: 'hi @alice.testnet!',
      caret: 17,
    });
    expect(
      insertMentionAt('hi @ali next', { start: 3, end: 7 }, 'alice.testnet')
    ).toEqual({
      text: 'hi @alice.testnet next',
      caret: 17,
    });
  });

  it('segments mentions, tickers, hashtags, and urls for rich text', () => {
    expect(splitPostRichText('hi @alice.testnet $SOCIAL #gm')).toEqual([
      { type: 'text', value: 'hi ' },
      {
        type: 'mention',
        value: '@alice.testnet',
        accountId: 'alice.testnet',
      },
      { type: 'text', value: ' ' },
      { type: 'ticker', value: '$SOCIAL', slug: 'social' },
      { type: 'text', value: ' ' },
      { type: 'hashtag', value: '#gm' },
    ]);
    expect(
      splitPostRichText('build at https://onsocial.id/ with #near.')
    ).toEqual([
      { type: 'text', value: 'build at ' },
      {
        type: 'url',
        value: 'https://onsocial.id/',
        href: 'https://onsocial.id/',
      },
      { type: 'text', value: ' with ' },
      { type: 'hashtag', value: '#near' },
      { type: 'text', value: '.' },
    ]);
    expect(
      splitPostRichText('see https://onsocial.id/#topics not a hashtag')
    ).toEqual([
      { type: 'text', value: 'see ' },
      {
        type: 'url',
        value: 'https://onsocial.id/#topics',
        href: 'https://onsocial.id/#topics',
      },
      { type: 'text', value: ' not a hashtag' },
    ]);
    expect(splitPostRichText('# Title stays prose')).toEqual([
      { type: 'text', value: '# Title stays prose' },
    ]);
  });

  it('formats autolink host labels', () => {
    expect(autolinkDisplayHost('https://onsocial.id/')).toBe('onsocial.id');
    expect(autolinkDisplayHost('https://www.onsocial.id/path')).toBe(
      'onsocial.id'
    );
  });

  it('autolinks www and bare domains in posts', () => {
    expect(splitPostRichText('go www.onsocial.id now')).toEqual([
      { type: 'text', value: 'go ' },
      {
        type: 'url',
        value: 'www.onsocial.id',
        href: 'https://www.onsocial.id',
      },
      { type: 'text', value: ' now' },
    ]);
  });

  it('highlights in-progress @query in composer even when incomplete', () => {
    expect(
      splitComposerRichText('hi @green', {
        start: 3,
        end: 9,
        query: 'green',
      })
    ).toEqual([
      { type: 'text', value: 'hi ' },
      { type: 'mention', value: '@green', accountId: 'green' },
    ]);
    expect(
      splitComposerRichText('hi @g', { start: 3, end: 5, query: 'g' })
    ).toEqual([
      { type: 'text', value: 'hi ' },
      { type: 'mention', value: '@g', accountId: '' },
    ]);
  });
});
