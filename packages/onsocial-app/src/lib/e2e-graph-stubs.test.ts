import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  e2eGraphStubsAllowed,
  e2eSeriesCatalogRows,
  extractGraphQuery,
  isCreatorCatalogQuery,
  isGraphQueryRequest,
  parseE2eGraphCookie,
  resolveE2eGraphStub,
} from './e2e-graph-stubs';

describe('e2eGraphStubsAllowed', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows stubs outside production', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('E2E_GRAPH_STUBS', '');
    expect(e2eGraphStubsAllowed()).toBe(true);
  });

  it('blocks production without the server flag', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('E2E_GRAPH_STUBS', '');
    expect(e2eGraphStubsAllowed()).toBe(false);
  });

  it('allows production when CI sets E2E_GRAPH_STUBS=1', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('E2E_GRAPH_STUBS', '1');
    expect(e2eGraphStubsAllowed()).toBe(true);
  });
});

describe('parseE2eGraphCookie', () => {
  it('reads catalog=night-roads and catalog=empty', () => {
    expect(parseE2eGraphCookie('catalog=night-roads')).toEqual({
      catalog: 'night-roads',
    });
    expect(parseE2eGraphCookie('catalog=empty')).toEqual({ catalog: 'empty' });
  });

  it('ignores missing or unknown values', () => {
    expect(parseE2eGraphCookie(null)).toEqual({});
    expect(parseE2eGraphCookie('catalog=vault')).toEqual({});
    expect(parseE2eGraphCookie('')).toEqual({});
  });
});

describe('resolveE2eGraphStub', () => {
  const catalogQuery = 'query ScarcesCollectionsCurrent($limit: Int!) { x }';
  const byIdsQuery =
    'query ScarcesCollectionsCurrentByIds($ids: [String!]!) { x }';

  it('returns Night Roads rows for the creator catalog query', () => {
    const stub = resolveE2eGraphStub({
      query: catalogQuery,
      cookieValue: 'catalog=night-roads',
    });
    expect(stub?.data.scarcesCollectionsCurrent).toEqual(
      e2eSeriesCatalogRows('night-roads')
    );
  });

  it('returns an empty catalog when opted in', () => {
    expect(
      resolveE2eGraphStub({
        query: catalogQuery,
        cookieValue: 'catalog=empty',
      })
    ).toEqual({ data: { scarcesCollectionsCurrent: [] } });
  });

  it('does not stub ByIds or requests without a catalog cookie', () => {
    expect(
      resolveE2eGraphStub({
        query: byIdsQuery,
        cookieValue: 'catalog=night-roads',
      })
    ).toBeNull();
    expect(
      resolveE2eGraphStub({
        query: catalogQuery,
        cookieValue: null,
      })
    ).toBeNull();
  });

  it('matches creator catalog operation names the same way e2e routes do', () => {
    expect(isCreatorCatalogQuery(catalogQuery)).toBe(true);
    expect(isCreatorCatalogQuery(byIdsQuery)).toBe(false);
  });

  it('extracts the query string from a JSON body', () => {
    expect(extractGraphQuery(JSON.stringify({ query: catalogQuery }))).toBe(
      catalogQuery
    );
    expect(extractGraphQuery('')).toBe('');
  });

  it('recognizes gateway and BFF graph/query POSTs', () => {
    expect(
      isGraphQueryRequest('https://testnet.onsocial.id/graph/query', {
        method: 'POST',
      })
    ).toBe(true);
    expect(
      isGraphQueryRequest('http://localhost:3099/api/onapi/graph/query', {
        method: 'POST',
      })
    ).toBe(true);
    expect(
      isGraphQueryRequest('/api/onapi/graph/query', { method: 'GET' })
    ).toBe(false);
  });
});
