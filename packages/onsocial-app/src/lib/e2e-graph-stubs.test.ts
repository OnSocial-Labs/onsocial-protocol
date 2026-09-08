import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  e2eGraphStubsAllowed,
  e2eHubCatalogRows,
  e2eSeriesCatalogRows,
  e2eVaultCollectionRows,
  e2eVaultOwnedRows,
  extractGraphQuery,
  extractGraphRequest,
  isAppCatalogQuery,
  isCreatorCatalogQuery,
  isGraphQueryRequest,
  parseE2eGraphCookie,
  resolveE2eGraphStub,
  serializeE2eGraphCookie,
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

  it('reads vault=default and combined catalog+vault', () => {
    expect(parseE2eGraphCookie('vault=default')).toEqual({ vault: 'default' });
    expect(parseE2eGraphCookie('catalog=night-roads&vault=default')).toEqual({
      catalog: 'night-roads',
      vault: 'default',
    });
    expect(
      serializeE2eGraphCookie({ catalog: 'empty', vault: 'many-creators' })
    ).toBe('catalog=empty&vault=many-creators');
  });

  it('reads hub=catalog and hub=held', () => {
    expect(parseE2eGraphCookie('hub=catalog')).toEqual({ hub: 'catalog' });
    expect(parseE2eGraphCookie('hub=held')).toEqual({ hub: 'held' });
  });

  it('ignores missing or unknown values', () => {
    expect(parseE2eGraphCookie(null)).toEqual({});
    expect(parseE2eGraphCookie('catalog=vault')).toEqual({});
    expect(parseE2eGraphCookie('vault=catalog')).toEqual({});
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

  it('returns default vault owned + ByIds rows when opted in', () => {
    const ownedQuery = 'query ScarcesOwnedBy($ownerId: String!) { x }';
    expect(
      resolveE2eGraphStub({
        query: ownedQuery,
        cookieValue: 'vault=default',
      })?.data.scarcesTokenOwners
    ).toEqual(e2eVaultOwnedRows('default'));
    expect(
      resolveE2eGraphStub({
        query: byIdsQuery,
        cookieValue: 'vault=default',
      })?.data.scarcesCollectionsCurrent
    ).toEqual(e2eVaultCollectionRows('default'));
    expect(
      resolveE2eGraphStub({
        query: ownedQuery,
        cookieValue: 'catalog=night-roads',
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
    expect(
      extractGraphRequest(
        JSON.stringify({ query: catalogQuery, variables: { appId: 'e2e-hub' } })
      )
    ).toEqual({
      query: catalogQuery,
      variables: { appId: 'e2e-hub' },
    });
  });

  it('returns hub catalog rows for an appId collectionsCurrent query', () => {
    expect(
      resolveE2eGraphStub({
        query: catalogQuery,
        variables: { appId: 'e2e-hub' },
        cookieValue: 'hub=catalog',
      })?.data.scarcesCollectionsCurrent
    ).toEqual(e2eHubCatalogRows('catalog'));
    expect(isAppCatalogQuery(catalogQuery, { appId: 'e2e-hub' })).toBe(true);
    expect(
      resolveE2eGraphStub({
        query: catalogQuery,
        variables: { creatorId: 'alice.near' },
        cookieValue: 'catalog=night-roads&hub=catalog',
      })?.data.scarcesCollectionsCurrent
    ).toEqual(e2eSeriesCatalogRows('night-roads'));
  });

  it('returns the hub app row when opted in', () => {
    expect(
      resolveE2eGraphStub({
        query: 'query ScarcesAppRow($appId: String!) { x }',
        cookieValue: 'hub=catalog',
      })?.data.scarcesApps
    ).toHaveLength(1);
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
