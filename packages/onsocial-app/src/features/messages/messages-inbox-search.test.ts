import { describe, expect, it } from 'vitest';
import {
  buildDmThreadId,
  excludePeersInInbox,
  filterInboxThreadsByQuery,
  isMessagesPeopleSearchActive,
  messagingBlockedCopy,
  normalizeMessagesSearchQuery,
  threadMatchesQuery,
} from './messages-inbox-search';

describe('normalizeMessagesSearchQuery', () => {
  it('trims and caps length', () => {
    expect(normalizeMessagesSearchQuery('  Ada  ')).toBe('Ada');
    expect(isMessagesPeopleSearchActive('a')).toBe(false);
    expect(isMessagesPeopleSearchActive('ad')).toBe(true);
  });
});

describe('threadMatchesQuery', () => {
  it('matches name, handle, account, and preview', () => {
    expect(
      threadMatchesQuery({
        peerAccountId: 'ada.near',
        query: 'ada',
        displayName: 'Ada Lovelace',
      })
    ).toBe(true);
    expect(
      threadMatchesQuery({
        peerAccountId: 'ghost.testnet',
        query: 'ghost',
      })
    ).toBe(true);
    expect(
      threadMatchesQuery({
        peerAccountId: 'peer.near',
        query: 'see you',
        preview: 'See you there',
      })
    ).toBe(true);
    expect(
      threadMatchesQuery({
        peerAccountId: 'peer.near',
        query: 'zzz',
        displayName: 'Ada',
        preview: 'Hello',
      })
    ).toBe(false);
  });
});

describe('filterInboxThreadsByQuery', () => {
  const threads = [
    { threadId: 'a::b', peerAccountId: 'ada.near' },
    { threadId: 'a::c', peerAccountId: 'bob.near' },
  ];

  it('returns all threads when the query is empty', () => {
    expect(
      filterInboxThreadsByQuery({ threads, query: '  ' }).map((t) => t.threadId)
    ).toEqual(['a::b', 'a::c']);
  });

  it('filters by preview keyed on thread id', () => {
    const next = filterInboxThreadsByQuery({
      threads,
      query: 'photo',
      names: { 'ada.near': 'Ada' },
      previews: { 'a::b': 'Photo or video', 'a::c': 'Hello' },
    });
    expect(next.map((t) => t.threadId)).toEqual(['a::b']);
  });
});

describe('excludePeersInInbox', () => {
  it('drops inbox peers and the viewer', () => {
    const people = [
      { accountId: 'ada.near' },
      { accountId: 'bob.near' },
      { accountId: 'me.near' },
    ];
    expect(
      excludePeersInInbox(people, ['ada.near'], 'me.near').map((p) => p.accountId)
    ).toEqual(['bob.near']);
  });
});

describe('buildDmThreadId', () => {
  it('sorts lowercase account ids', () => {
    expect(buildDmThreadId('Bob.near', 'ada.near')).toBe('ada.near::bob.near');
    expect(buildDmThreadId('ada.near', 'bob.near')).toBe('ada.near::bob.near');
  });
});

describe('messagingBlockedCopy', () => {
  it('uses profile Message voice', () => {
    expect(messagingBlockedCopy('block')).toBe('Messaging unavailable');
    expect(messagingBlockedCopy('muted')).toBe('Unmute to message');
    expect(messagingBlockedCopy(null)).toBeNull();
  });
});
