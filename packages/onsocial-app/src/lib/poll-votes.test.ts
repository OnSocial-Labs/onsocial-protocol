import { describe, expect, it } from 'vitest';
import {
  parsePollVotePath,
  parsePollVoteValue,
  pollVoteWritePath,
  distributePollPercents,
  tallyPollVotes,
} from './poll-votes';

describe('poll-votes', () => {
  it('builds and parses vote paths', () => {
    expect(pollVoteWritePath('alice.near', '42')).toBe(
      'pollvote/alice.near/post/42'
    );
    expect(
      parsePollVotePath('bob.near/pollvote/alice.near/post/42')
    ).toEqual({ owner: 'alice.near', postId: '42' });
    expect(parsePollVotePath('pollvote/alice.near/post/42')).toEqual({
      owner: 'alice.near',
      postId: '42',
    });
  });

  it('parses vote values from strings or objects', () => {
    expect(parsePollVoteValue('{"v":1,"optionIndex":2,"timestamp":9}')).toEqual(
      {
        v: 1,
        optionIndex: 2,
        timestamp: 9,
      }
    );
    expect(
      parsePollVoteValue({ v: 1, optionIndex: 1, timestamp: 4 })
    ).toEqual({
      v: 1,
      optionIndex: 1,
      timestamp: 4,
    });
    expect(parsePollVoteValue('{"optionIndex":-1}')).toBeNull();
  });

  it('tallies latest vote per voter and tracks viewer', () => {
    const tallies = tallyPollVotes(
      [
        {
          accountId: 'bob.near',
          path: 'bob.near/pollvote/alice.near/post/1',
          value: '{"optionIndex":0,"timestamp":1}',
          blockHeight: 10,
          operation: 'set',
        },
        {
          accountId: 'bob.near',
          path: 'bob.near/pollvote/alice.near/post/1',
          value: '{"optionIndex":1,"timestamp":2}',
          blockHeight: 20,
          operation: 'set',
        },
        {
          accountId: 'carol.near',
          path: 'carol.near/pollvote/alice.near/post/1',
          value: '{"optionIndex":1,"timestamp":3}',
          blockHeight: 15,
          operation: 'set',
        },
      ],
      [{ owner: 'alice.near', postId: '1', optionCount: 3 }],
      'bob.near'
    );

    expect(tallies['alice.near:1']).toEqual({
      counts: [0, 2, 0],
      total: 2,
      viewerOptionIndex: 1,
    });
  });

  it('distributes percents that sum to 100', () => {
    expect(distributePollPercents([1, 1, 1], 3)).toEqual([34, 33, 33]);
    expect(distributePollPercents([1, 0], 1)).toEqual([100, 0]);
    expect(distributePollPercents([0, 0], 0)).toEqual([0, 0]);
  });
});
