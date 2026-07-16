import { describe, expect, it } from 'vitest';
import {
  extractMentionsFromText,
  findActiveMentionQuery,
  insertMentionAt,
  normalizeMentionAccountId,
  postMetaFromText,
} from '@/features/home/post-mentions';
import { splitComposerRichText, splitPostRichText } from '@/features/home/post-rich-segments';

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

  it('builds post meta with hashtags and mentions', () => {
    expect(postMetaFromText('hi @alice.testnet #NEAR')).toEqual({
      hashtags: ['near'],
      mentions: ['alice.testnet'],
    });
    expect(postMetaFromText('plain')).toEqual({});
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

  it('segments mentions and hashtags for rich text', () => {
    expect(splitPostRichText('hi @alice.testnet #gm')).toEqual([
      { type: 'text', value: 'hi ' },
      {
        type: 'mention',
        value: '@alice.testnet',
        accountId: 'alice.testnet',
      },
      { type: 'text', value: ' ' },
      { type: 'hashtag', value: '#gm' },
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
