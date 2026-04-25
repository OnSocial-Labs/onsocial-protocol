# Custom Data Types — Build Any dApp on OnSocial

Devs can ship a dApp with their own data shapes without forking the SDK,
modifying the substream, or running their own indexer. This guide explains
the three tiers of flexibility.

> Convention: every `os.social.set(<account>/<dataType>/<rest>, value)` write
> is auto-indexed by the substream into `data_updates`, keyed by the **first
> path segment** as `data_type`. Pick whatever name you want.

---

## Tier 1 — Just write & read (zero setup)

Works the moment your write lands on chain.

```ts
// Write under your own namespace — pick any name
await os.social.set('mygame/score-42', JSON.stringify({
  player: 'alice.near',
  points: 9000,
  level: 7,
}));

// Read every entry of your namespace
const scores = await os.query.raw.byType('mygame');

// Read one entry by its full path
const score = await os.query.raw.byPath('alice.near/mygame/score-42');

// Optionally scope by account
const aliceScores = await os.query.raw.byType('mygame', { accountId: 'alice.near' });
```

Returns `DataRow[]` with `{ path, value, accountId, blockHeight, blockTimestamp, operation }`.
Parse `value` client-side with `JSON.parse(row.value)`.

**Good for**: prototypes, low-volume data, MVPs.

---

## Tier 2 — Filter on inner fields, fast (no schema needed)

Every JSON value is auto-mirrored into a `value_json jsonb` sidecar column
with a GIN index. Use `os.query.graphql` with JSONB containment operators —
**no view definition, no PR**.

```ts
// Server-side filter on inner field
const fiveStars = await os.query.graphql<{
  dataUpdates: { path: string; value: string; accountId: string }[];
}>({
  query: `query Top($t: String!) {
    dataUpdates(
      where: {
        dataType: { _eq: $t },
        valueJson: { _contains: { rating: 5 } }
      },
      orderBy: [{ blockHeight: DESC }],
      limit: 50
    ) { path value accountId blockTimestamp }
  }`,
  variables: { t: 'review' },
});

// Other JSONB operators
where: { valueJson: { _has_key: "verified" } }
where: { valueJson: { _contains: { tags: ["urgent"] } } }
where: { valueJson: { _has_keys_any: ["a", "b", "c"] } }
```

Rows whose `value` is not a JSON object/array (legacy follows, plain strings)
are skipped — `valueJson` is NULL for those and the partial GIN index keeps
the table lean.

**Good for**: 95% of production dApps.

---

## Tier 3 — Typed GraphQL fields (opt-in YAML)

When your shape is stable and you want typed columns + autocomplete, add
one Hasura logical-model PR. **Pick whatever name you want** — there is no
naming convention enforced.

### Step 1 — Write a SQL view

Create a view file in `indexers/substreams/custom/<your-app>.sql` (or PR
into `core_schema_views.sql` if it's broadly useful):

```sql
-- indexers/substreams/custom/mygame.sql
CREATE OR REPLACE VIEW mygame_scores AS
SELECT
  account_id,
  split_part(path, '/', 2)            AS score_id,
  value_json->>'player'               AS player,
  (value_json->>'points')::int        AS points,
  (value_json->>'level')::int         AS level,
  block_height,
  block_timestamp
FROM data_updates
WHERE data_type = 'mygame'
  AND operation = 'set'
  AND value_json IS NOT NULL;
```

### Step 2 — Track it in Hasura

After the SQL view exists, the existing
`indexers/substreams/scripts/sync-hasura-substreams-metadata.sh` flow picks
it up automatically on next sync. Hasura will expose:

```graphql
query { mygameScores(where: {points: {_gt: 5000}}) { player points level } }
```

### Step 3 — Use it from the SDK

```ts
const top = await os.query.graphql<{ mygameScores: Array<{
  player: string; points: number; level: number;
}> }>({
  query: `{ mygameScores(where: {points: {_gt: 5000}}, limit: 10) {
    player points level
  } }`,
});
```

**Good for**: shipped dApps with a stable schema, leaderboards, codegenable types.

---

## Path conventions

The substream extracts `data_type` from the **first path segment**:

```
alice.near/mygame/score-42
└─────┬────┘└──┬──┘└────┬─────┘
   account    │      rest of path
              │
        data_type ('mygame')
```

You may use any further path segments for sharding (`mygame/level-7/score-42`),
but only the first segment becomes `data_type`. Use `os.query.raw.byPath` for
exact-path lookups.

### Reserved prefixes (don't use as your `data_type`)

These are owned by the protocol and have built-in typed views or contract
semantics:

| Prefix | Owner |
|---|---|
| `profile`, `post`, `standing`, `reaction`, `settings` | Built-in core domains |
| `groups` | Group lifecycle, content & governance |

Pick anything else — `mygame`, `myAppName`, `org-x-poll`, `crmContact`, etc.

---

## Capabilities by tier

| Capability | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Write any custom shape | ✅ | ✅ | ✅ |
| Read all entries of a type | ✅ | ✅ | ✅ |
| Read by exact path | ✅ | ✅ | ✅ |
| Filter on inner fields | ❌ client-side | ✅ indexed | ✅ indexed |
| Sort server-side | ❌ | ✅ | ✅ |
| Aggregates (count, sum, avg) | ❌ | ✅ | ✅ |
| Typed GraphQL columns | ❌ | ❌ | ✅ |
| Codegenable TS types | ❌ | ❌ | ✅ |

---

## Limits

- `value` length: bounded by the relayer's payload limit (~256 KiB).
- Write throughput: gateway-tier rate limits apply.
- Reorgs: substream re-emits on rollback; reads are eventually consistent
  within ~2 blocks of the head.
- Quota: per-account storage usage is enforced on chain by the core contract.

---

## See also

- [`packages/onsocial-sdk/README.md`](../packages/onsocial-sdk/README.md) — "Build Any dApp" section
- [`packages/onsocial-sdk/src/query/raw.ts`](../packages/onsocial-sdk/src/query/raw.ts) — `os.query.raw` API
- [`indexers/substreams/core_schema.sql`](../indexers/substreams/core_schema.sql) — `data_updates` schema
- [`indexers/substreams/core_schema_views.sql`](../indexers/substreams/core_schema_views.sql) — built-in typed views (reference patterns)
