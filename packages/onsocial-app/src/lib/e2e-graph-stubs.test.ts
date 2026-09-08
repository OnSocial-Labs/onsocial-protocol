import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  e2eGraphStubsAllowed,
  e2eGuildCurrentRows,
  e2eGuildMemberRows,
  e2eHubCatalogRows,
  e2eMarketShopCatalogRows,
  e2eSeriesCatalogRows,
  e2eVaultCollectionRows,
  e2eVaultOwnedRows,
  extractGraphQuery,
  extractGraphRequest,
  isAppCatalogQuery,
  isCreatorCatalogQuery,
  isGraphQueryRequest,
  isGroupsByIdsQuery,
  isMarketShopCatalogQuery,
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

  it('reads market=shop and combined catalog+market', () => {
    expect(parseE2eGraphCookie('market=shop')).toEqual({ market: 'shop' });
    expect(parseE2eGraphCookie('market=live-first')).toEqual({
      market: 'live-first',
    });
    expect(serializeE2eGraphCookie({ catalog: 'empty', market: 'shop' })).toBe(
      'catalog=empty&market=shop'
    );
  });

  it('reads guild=empty and combined hub+guild', () => {
    expect(parseE2eGraphCookie('guild=empty')).toEqual({ guild: 'empty' });
    expect(parseE2eGraphCookie('guild=owner')).toEqual({ guild: 'owner' });
    expect(parseE2eGraphCookie('hub=catalog&guild=empty')).toEqual({
      hub: 'catalog',
      guild: 'empty',
    });
    expect(serializeE2eGraphCookie({ catalog: 'empty', guild: 'member' })).toBe(
      'catalog=empty&guild=member'
    );
  });

  it('ignores missing or unknown values', () => {
    expect(parseE2eGraphCookie(null)).toEqual({});
    expect(parseE2eGraphCookie('catalog=vault')).toEqual({});
    expect(parseE2eGraphCookie('vault=catalog')).toEqual({});
    expect(parseE2eGraphCookie('guild=catalog')).toEqual({});
    expect(parseE2eGraphCookie('market=catalog')).toEqual({});
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

  it('returns Audit Guild rows for GroupsByIds when opted in', () => {
    const groupsQuery = 'query GroupsByIds($ids: [String!]!, $limit: Int!) { x }';
    expect(isGroupsByIdsQuery(groupsQuery)).toBe(true);
    expect(
      resolveE2eGraphStub({
        query: groupsQuery,
        cookieValue: 'guild=empty',
      })?.data.groupsCurrent
    ).toEqual(e2eGuildCurrentRows('empty'));
    expect(
      resolveE2eGraphStub({
        query: groupsQuery,
        cookieValue: 'guild=missing',
      })
    ).toEqual({ data: { groupsCurrent: [] } });
    expect(
      resolveE2eGraphStub({
        query: groupsQuery,
        cookieValue: null,
      })
    ).toBeNull();
    expect(
      resolveE2eGraphStub({
        query: 'query GroupMembersOf($groupId: String!) { x }',
        cookieValue: 'guild=member',
      })?.data.groupMembersCurrent
    ).toEqual(e2eGuildMemberRows('member'));
  });

  it('returns Night Drive shop rows for the market creator catalog', () => {
    const catalogQuery = 'query ScarcesCollectionsCurrent($limit: Int!) { x }';
    expect(
      isMarketShopCatalogQuery(catalogQuery, {
        creatorId: 'e2e.market.testnet',
      })
    ).toBe(true);
    expect(
      resolveE2eGraphStub({
        query: catalogQuery,
        variables: { creatorId: 'e2e.market.testnet' },
        cookieValue: 'market=shop',
      })?.data.scarcesCollectionsCurrent
    ).toEqual(e2eMarketShopCatalogRows('shop'));
    expect(
      resolveE2eGraphStub({
        query: catalogQuery,
        variables: { creatorId: 'alice.near' },
        cookieValue: 'market=shop',
      })
    ).toBeNull();
    expect(
      resolveE2eGraphStub({
        query: 'query ScarcesActiveListings($limit: Int!) { x }',
        cookieValue: 'market=shop-empty',
      })
    ).toEqual({ data: { scarcesActiveListings: [] } });
    expect(
      resolveE2eGraphStub({
        query: 'query ScarcesActiveListings($limit: Int!) { x }',
        cookieValue: 'market=live-first',
      })?.data.scarcesActiveListings
    ).toHaveLength(2);
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
