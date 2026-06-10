# Social graph reads (standings & endorsements)

How to build discover, profile stands, mutual lists, and endorsement UIs with
`@onsocial/sdk` — same patterns the OnSocial portal uses.

## Mental model

| Layer | Use for |
| --- | --- |
| `os.standings` / `os.endorsements` | App-facing reads and writes (prefer this in product code) |
| `os.query.standings` / `os.query.endorsements` / `os.query.profiles` | Batch lookups, filtered search-in-list, raw pagination |
| `os.query.graphql` | Escape hatch only |

**Do not** load a user's full outgoing graph (`limit: 1000`) for UI. Use
indexed counts + paginated lists (`limit` 24, `offset` += 24).

The portal **network map** (`/u/:id/network`) shows a capped orbit sample
(mutuals first, then newest incoming/outgoing, max 36 nodes) with chain
totals on filters and stand list links for the full graph.

With a search query (`q`, min 2 chars), the map loads **index matches**
via `profiles.search` + filtered standing reads (`incomingFilteredPage`,
`outgoingFilteredPage`, `mutualFilteredDetailed`) and replaces orbit nodes
with up to 36 hits for the active filter. **View all** opens the stand list
with the same `q`. The network API caches the default sample (`s-maxage` 60s);
search uses shorter private cache. The portal client reuses stale responses
while revalidating in the background.

## Discover (logged-in)

One entry point batches profile search with viewer graph context for **the
current page only**:

```ts
const page = await os.query.profiles.discoverPage({
  query: 'alice',       // optional; empty = trending by standing signal
  limit: 24,
  offset: 0,
  viewerAccountId: 'bob.near',
});

for (const row of page.profiles) {
  const stands = page.viewer?.outgoing.some(
    (e) => e.targetAccount === row.accountId
  );
  const theyStand = page.viewer?.incomingAccountIds.includes(row.accountId);
  const endorsedViewer = page.viewer?.endorsementIssuers.includes(
    row.accountId
  );
}
```

## Profile counts

```ts
const { incoming, outgoing } = await os.standings.counts('alice.near');
const mutual = await os.standings.mutualCount('alice.near');
const { received, given } = await os.endorsements.counts('alice.near');
```

Counts come from indexed `profile_search` / aggregate views (O(1), not graph scans).

## Paginated lists (infinite scroll)

```ts
const PAGE = 24;

// Stands with me / I stand with
const incoming = await os.standings.listIncomingDetailed('alice.near', {
  limit: PAGE,
  offset: 0,
});
const outgoing = await os.standings.listOutgoingDetailed('alice.near', {
  limit: PAGE,
  offset: PAGE,
});

// Mutual (reciprocal) — requires `mutual_standings_current` on your environment
const mutual = await os.standings.mutualList('alice.near', {
  limit: PAGE,
  offset: 0,
});

// Endorsements
const received = await os.endorsements.listReceived('alice.near', {
  limit: PAGE,
  offset: 0,
});
const given = await os.endorsements.listGiven('alice.near', {
  limit: PAGE,
  offset: 0,
});
```

Load more: increase `offset` by `PAGE` until `offset + rows.length >= total`.

## Viewer context on a row

```ts
// Does the logged-in user stand with this profile?
const stands = await os.standings.viewerStandsWith('bob.near', 'alice.near');

// Endorsements bob gave to alice (topics), not "scan 100 received + filter"
const topics = await os.endorsements.listFromViewerToTarget(
  'bob.near',
  'alice.near'
);
```

## Search inside a standing / endorsement list

When the user filters by name inside a list, resolve matching account ids
(profile search), then use filtered page helpers (aggregate totals, no full-table fetch):

```ts
const ids = ['carol.near', 'dave.near']; // from your profile search step

const incomingPage = await os.query.standings.incomingFilteredPage(
  'alice.near',
  ids,
  { limit: 24, offset: 0 }
);

const mutualPage = await os.query.standings.mutualFilteredDetailed(
  'alice.near',
  ids,
  { limit: 24, offset: 0 }
);
const mutualTotal = await os.query.standings.mutualFilteredCount(
  'alice.near',
  ids
);

const endorsePage = await os.query.endorsements.receivedFilteredPage(
  'alice.near',
  ids,
  { limit: 24, offset: 0 }
);
```

## Enrich list rows with profile stats

```ts
const stats = await os.query.profiles.statsForAccounts([
  'bob.near',
  'carol.near',
]);
// standingCount, mutualStandingCount, endorsementsReceivedCount, …
```

## Auth & rate limits

- Server apps: `apiKey` on `OnSocial` (tier = key owner's subscription).
- Per-user reads can use JWT (`os.auth.setToken`) so limits apply per wallet.
- Avoid N+1: batch with `discoverPage`, `outgoingTargetsAmong`, `issuersAmong`,
  `statsForAccounts` — see `os.query.standings` / `os.query.endorsements`.

## Environment requirements

| Feature | Indexed view / field |
| --- | --- |
| Mutual count | `profile_search.mutualStandingCount` |
| Mutual list | `mutual_standings_current` → GraphQL `mutualStandingsCurrent` |
| Stand / endorse lists | `standings_current`, `endorsements_current` |

If `mutualStandingsCurrent` is missing in GraphQL introspection, mutual **lists**
fail until gateway Hasura permissions include `mutual_standings_current`.

See [CHEATSHEET.md](./CHEATSHEET.md) for a one-line lookup table.
