import { describe, expect, it } from 'vitest';
import {
  EMPTY_COLLECTIBLES_PAGE_QUERY,
  collectiblesQueryPath,
  collectiblesSeedParamsKey,
  parseCollectiblesPageQuery,
} from '@/lib/load-collectibles-page';

describe('parseCollectiblesPageQuery', () => {
  it('defaults to empty search / All', () => {
    expect(parseCollectiblesPageQuery({})).toEqual(EMPTY_COLLECTIBLES_PAGE_QUERY);
  });

  it('reads discovery URL params', () => {
    const query = parseCollectiblesPageQuery({
      q: '  night  ',
      kind: 'audio',
      audioFormat: 'album',
      facets: 'jazz',
    });
    expect(query.q).toBe('night');
    expect(query.kind).toBe('audio');
    expect(query.audioFormat).toBe('album');
    expect(collectiblesSeedParamsKey(query)).toContain('audio');
    expect(collectiblesQueryPath('alice.near', query)).toBe(
      '/@alice.near/collectibles?q=night&kind=audio&facets=jazz&audioFormat=album'
    );
  });

  it('drops audio format when medium is not audio', () => {
    expect(
      parseCollectiblesPageQuery({ kind: 'writing', audioFormat: 'album' })
    ).toMatchObject({ kind: 'writing', audioFormat: null });
  });

  it('omits defaults from the vault path', () => {
    expect(collectiblesQueryPath('alice.near', EMPTY_COLLECTIBLES_PAGE_QUERY)).toBe(
      '/@alice.near/collectibles'
    );
    expect(collectiblesQueryPath(null, EMPTY_COLLECTIBLES_PAGE_QUERY)).toBe(
      '/collectibles'
    );
    expect(
      collectiblesQueryPath(null, parseCollectiblesPageQuery({ kind: 'writing' }))
    ).toBe('/collectibles?kind=writing');
  });

  it('aliases music to audio', () => {
    expect(parseCollectiblesPageQuery({ kind: 'music' }).kind).toBe('audio');
  });
});
