# @onsocial/sdk

Gateway-first TypeScript SDK for OnSocial Protocol.

Use it to write social data, work with groups and governance, query indexed feeds and threads, upload media, mint Scarces, manage permissions, and call protocol services without dealing with raw contract payloads.

## Module index

Every module hangs off a single `OnSocial` instance. Use this table to find the namespace for what you want to do; full method docs live in JSDoc on hover.

| Namespace                | Purpose                                                                | Primary methods                                                             |
| ------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `os.profiles`            | Read & update profiles                                                 | `update`, `get`, `getMany`, `avatarUrl`, `bannerUrl`                        |
| `os.posts`               | Authoring posts, replies, quotes (top-level + group)                   | `create`, `reply`, `quote`, `groupPost`, `groupReply`, `groupQuote`         |
| `os.reactions`           | Add / remove / toggle reactions; counts                                | `add`, `remove`, `toggle`, `summary`                                        |
| `os.saves`               | Bookmarks                                                              | `add`, `remove`, `toggle`, `has`, `get`, `list`                             |
| `os.endorsements`        | Topic-scoped public vouches                                            | `add`, `upsert`, `remove`, `toggle`, `get`, `listGiven`, `listReceived`     |
| `os.attestations`        | Verifiable claims                                                      | `add`, `revoke`, `get`                                                      |
| `os.standings`           | Follow-style "stand with" edges                                        | `add`, `remove`, `toggle`, `has`, `listOutgoing`, `listIncoming`, `counts`  |
| `os.groups`              | Groups + group feeds, governance                                       | `create`, `join`, `leave`, `post`, `reply`, `quote`, `isMember`, `execute`  |
| `os.pages`               | Curated content collections                                            | `create`, `addItem`, `removeItem`, `setVisibility`, `setConfig`             |
| `os.permissions`         | Grant / check / revoke permissions                                     | `grant`, `revoke`, `get`, `hasGroupAdmin`, …                                |
| `os.scarces.tokens`      | Scarce (NFT) primitives                                                | `mint`, `transfer`, `burn`, `renew`, `redeem`, `revoke`, `claimRefund`      |
| `os.scarces.collections` | Drops, allowlists, refunds                                             | `create`, `mintFromCollection`, `purchaseFromCollection`, `setAllowlist`, … |
| `os.scarces.market`      | Secondary market                                                       | `list`, `delist`, `purchase`, `updatePrice`                                 |
| `os.scarces.auctions`    | English auctions                                                       | `list`, `placeBid`, `settle`, `cancel`                                      |
| `os.scarces.offers`      | Offers on tokens / collections                                         | `make`, `cancel`, `accept`, `makeCollectionOffer`, …                        |
| `os.scarces.lazy`        | Deferred-mint listings                                                 | `create`, `purchase`, `cancel`                                              |
| `os.scarces.apps`        | App pools, moderators, admin                                           | `register`, `setConfig`, `fundPool`, `addModerator`, …                      |
| `os.boost`               | Boost credits + booster state                                          | `purchase`, `boost`, `state`, `events`                                      |
| `os.rewards`             | Partner rewards                                                        | `claim`, `state`, `events`                                                  |
| `os.token`               | OnSocial token transfers + state                                       | `transfer`, `balance`, `events`                                             |
| `os.storageAccount`      | Storage balances, sponsorships, pools                                  | `balance`, `withdraw`, `tip`, `sponsor`, `fundPlatform`, …                  |
| `os.chain`               | On-chain reads (status, version, config)                               | `getContractStatus`, `getVersion`, `getGovernanceConfig`, `getContractInfo` |
| `os.query.*`             | Raw indexer (Hasura) reads — feed, threads, groups, scarces, events, … | `feed.*`, `threads.*`, `groups.*`, `scarces.*`, `events.*`                  |
| `os.social`              | Low-level NEAR-Social KV primitives                                    | `set`, `get`, `getOne`, `listKeys`, `countKeys`                             |
| `os.raw.*`               | Direct contract calls (escape hatch)                                   | varies                                                                      |

> Naming convention: data CRUD modules use `add` / `remove` / `toggle` / `get` / `list`. Authoring modules (`posts`, `profiles`, `pages`) use the natural verb (`create`, `update`, `setVisibility`).

See [docs/CHEATSHEET.md](./docs/CHEATSHEET.md) for a one-page noun → method lookup.

## Install

```bash
npm install @onsocial/sdk
```

## Initialize

Reads can work without authentication. Writes use the canonical OnSocial lane:
authenticate to the gateway with a JWT or OnAPI key, attach a NEP-366 session,
then let the SDK sign and submit through `${gatewayUrl}/relay/delegate`. The
gateway forwards the signed delegate to the private relayer; apps do not talk to
the relayer directly in normal production usage.

```ts
import { OnSocial } from '@onsocial/sdk';

const os = new OnSocial({
  network: 'testnet',
});
```

### Configuration

| Option             | Description                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `network`          | `mainnet` or `testnet`. Defaults to `mainnet`.                                                                                                |
| `gatewayUrl`       | Override the default gateway base URL.                                                                                                        |
| `apiKey`           | Server-side OnAPI key for gateway auth.                                                                                                       |
| `actorId`          | End-user account to write as when using API-key auth.                                                                                         |
| `appId`            | Default app namespace for notifications.                                                                                                      |
| `fetch`            | Custom fetch implementation.                                                                                                                  |
| `session`          | `Session` instance used to sign NEP-366 delegate writes.                                                                                      |
| `defaultBroadcast` | Advanced override. Leave unset for the canonical gateway delegate path. Direct relayer and wallet modes are for self-hosted/admin flows only. |
| `storage`          | `StorageProvider` (defaults to gateway-hosted IPFS upload).                                                                                   |

Per-call broadcast overrides are intentionally advanced. Regular apps should use
the default gateway path and only pass a wallet signer for explicit wallet-paid
or admin flows.

### Canonical write flow

```ts
import { OnSocial } from '@onsocial/sdk';

const os = new OnSocial({
  network: 'mainnet',
  apiKey: process.env.ONSOCIAL_API_KEY!,
  actorId: 'alice.near',
});

// Attach the Session returned by your one-time onboarding flow.
os.attachSession(session);

await os.posts.create({ text: 'Hello OnSocial' });
```

## Authentication

### Use an existing JWT

```ts
const os = new OnSocial({ network: 'mainnet' });
os.auth.setToken(process.env.ONSOCIAL_JWT!);
```

### Login with a NEAR signature

```ts
const session = await os.auth.login({
  accountId: 'alice.near',
  message: `OnSocial Auth: ${Date.now()}`,
  signature: signedMessage,
  publicKey: 'ed25519:...',
});

console.log(session.tier);
```

## Quick Start

### Profiles & posts

```ts
await os.profiles.update({ name: 'Alice', bio: 'Builder' });

await os.posts.create({ text: 'Hello OnSocial', tags: ['intro'] });
```

### Groups

```ts
await os.groups.create('dao', {
  owner: 'alice.near',
  memberDriven: true,
  isPrivate: false,
});

await os.groups.post('dao', {
  text: 'Welcome to the group feed',
});
```

### Query Indexed Data

```ts
const feed = await os.query.feed.fromAccounts({ accountId: 'alice.near' });
const posts = await os.query.feed.recent({ author: 'alice.near' });

console.log(feed.items.length, posts.items.length);
```

## Group Feeds And Threads

The SDK now has first-class helpers for group content reads and writes.

### Create a root group post

```ts
const root = {
  author: 'alice.near',
  groupId: 'dao',
  postId: 'root-123',
};

await os.groups.post(
  root.groupId,
  {
    text: 'Root post',
    channel: 'engineering',
    kind: 'announcement',
    audiences: ['members'],
  },
  root.postId
);
```

### Reply to a group post

```ts
await os.groups.replyToPost(root.groupId, root, {
  text: 'First reply',
});
```

### Quote a group post

```ts
await os.groups.quotePost(root.groupId, root, {
  text: 'Quoting this into another group post',
});
```

### Read a group feed

```ts
const feed = await os.query.groups.feed({
  groupId: 'dao',
  limit: 20,
});

console.log(feed.items.map((post) => post.postId));
```

### Read a filtered group feed

```ts
const announcements = await os.query.groups.feedFiltered({
  groupId: 'dao',
  channel: 'engineering',
  kind: 'announcement',
});
```

### Read a single group post

```ts
const post = await os.query.groups.post(root);
console.log(post?.value);
```

### Read replies only

```ts
const replies = await os.query.groups.thread(root, { limit: 50 });
```

### Read quotes only

```ts
const quotes = await os.query.groups.quotes(root, { limit: 50 });
```

### Read the whole conversation

```ts
const conversation = await os.query.groups.conversation(root, {
  replyLimit: 50,
  quoteLimit: 50,
});

console.log(conversation.root?.postId);
console.log(conversation.replies.length);
console.log(conversation.quotes.length);
```

### Recommended canonical metadata

For shared group feeds, keep posts on the canonical path and add optional feed-slicing metadata on the post body instead of inventing alternate storage paths.

```ts
const post = {
  text: 'Quarterly roadmap update',
  channel: 'engineering',
  kind: 'announcement',
  audiences: ['members', 'employees'],
};
```

- `channel`: product-level feed slice like `engineering` or `all-hands`
- `kind`: content grouping like `announcement`, `discussion`, or `task`
- `audiences`: optional labels for UI or shared query filtering

Keep the canonical content path as `groups/{groupId}/content/post/{postId}`. Use UI filtering first, and only add indexed filtered views later if multiple apps need the same feed slices.

## Main Modules

The SDK is organised into three discoverable namespaces plus a few cross-cutting modules. Top-level shortcuts (`os.posts`, `os.scarces`, …) remain available — the namespaces are the same instances re-grouped for clarity.

### `os.content` — user-generated content

| Module         | Purpose                                                       |
| -------------- | ------------------------------------------------------------- |
| `profiles`     | Read / update profile data (with auto avatar / banner upload) |
| `posts`        | Create posts, replies, quotes — including group variants      |
| `reactions`    | `add` / `remove` / `toggle` / `summary`                       |
| `saves`        | Bookmark posts (`add` / `remove` / `toggle` / `has` / `list`) |
| `endorsements` | Directed contextual vouches                                   |
| `attestations` | Verifiable typed claims                                       |
| `standings`    | Account ↔ account "stand with" graph                         |
| `feed`         | Indexed GraphQL reads (alias of `os.query`)                   |

```ts
await os.content.profiles.update({ name: 'Alice' });
await os.content.posts.create({ text: 'gm' });
await os.content.reactions.toggle(post, 'like');
await os.content.saves.add(post, { folder: 'inspiration' });
const feed = await os.content.feed.fromAccounts({ accountId: 'alice.near' });
```

### `os.economy` — value flows

| Module    | Purpose                                |
| --------- | -------------------------------------- |
| `scarces` | Collections, mint, list, offers (NFTs) |
| `rewards` | Credit / claim / balance               |

```ts
await os.economy.scarces.tokens.mint({ title: 'Art', image: file });
await os.economy.rewards.claim(claimId);
```

### `os.platform` — dev-platform & integration

| Module          | Purpose                                 |
| --------------- | --------------------------------------- |
| `storage`       | IPFS file / JSON upload                 |
| `permissions`   | Account + key permission management     |
| `notifications` | Push + in-app notifications (pro tier+) |
| `webhooks`      | Outbound webhook endpoints (pro tier+)  |
| `pages`         | onsocial.id page configuration          |

```ts
const { cid } = await os.platform.storage.upload(file);
await os.platform.notifications.list();
```

### Cross-cutting

| Module      | Purpose                                                    |
| ----------- | ---------------------------------------------------------- |
| `os.auth`   | Login, refresh, session management                         |
| `os.groups` | Group lifecycle, membership, governance, group content     |
| `os.chain`  | On-chain storage balance, nonces, governance config        |
| `os.social` | Raw OnSocial KV (`set` / `get` / `listKeys` / `countKeys`) |

## Going Lower-Level

The opinionated namespaces above cover the common app cases. When you need granular control — an action the SDK hasn't wrapped yet, a custom OnSocial KV path, or a direct gateway call — reach for `os.raw`.

```ts
// Any contract action via the configured broadcast path.
// Same as os.execute(...) at the top level.
await os.raw.execute({
  type: 'create_proposal',
  group_id: 'dao',
  proposal: { title: 'Promote Bob', kind: 'AddMember', member_id: 'bob.near' },
});

// Advanced: wallet-paid admin/fallback broadcast, no relayer/session required.
await os.raw.execute(
  { type: 'set', data: { 'profile/name': 'Alice' } },
  {
    broadcast: {
      kind: 'wallet',
      signer: wallet.signAndSendTransaction,
    },
  }
);

// Raw OnSocial KV.
await os.raw.social.set('alice.near/widget/myWidget', { code: '...' });
const entry = await os.raw.social.getOne('widget/myWidget', 'alice.near');

// Direct gateway HTTP if you need an endpoint we don't model yet.
const result = await os.raw.http.post('/data/custom', { ... });
```

For full protocol primitives — typed `Action` builders, NEP-366 session helpers, `paths`, and `CONTRACTS` — import from the `/advanced` entry point:

```ts
import {
  buildPostAction,
  buildCreateProposalAction,
  buildSignedDelegate,
  Session,
  paths,
  CONTRACTS,
} from '@onsocial/sdk/advanced';
});
```

See [`examples/`](./examples) for runnable samples covering feeds, groups, scarces, session keys, and webhooks.

## Build Any dApp

You're not constrained to the modelled domains (posts, groups, scarces, …). The protocol indexes **any** data you write under your own first-segment namespace, and the SDK gives you typed reads + writes for it without forking anything.

```ts
// 1. Pick your own namespace — the indexer auto-derives `data_type` from
//    the first path segment, so 'review' becomes its own queryable type.
await os.social.set(
  'review/item-001',
  JSON.stringify({
    rating: 5,
    reviewer: 'alice.near',
    timestamp: 1772668800,
  })
);

// 2. Read every entry of your custom type, scoped or unscoped by account.
const reviews = await os.query.raw.byType('review', {
  accountId: 'alice.near',
});

// 3. Or look up a single entry by full path.
const review = await os.query.raw.byPath('alice.near/review/item-001');

// 4. Need shapes the typed query helpers don't model? Drop to raw GraphQL.
const { data } = await os.query.graphql<{
  dataUpdates: { path: string; value: string }[];
}>({
  query: `query Recent($t: String!) {
    dataUpdates(where: {dataType: {_eq: $t}}, limit: 5, orderBy: [{blockHeight: DESC}]) {
      path value accountId blockTimestamp
    }
  }`,
  variables: { t: 'review' },
});

// 5. Batch your custom writes alongside built-in actions in one relayed tx.
import { buildCoreSetAction, buildPostAction } from '@onsocial/sdk/advanced';

await os.raw.execute([
  buildPostAction({ text: 'Just posted a new review' }),
  buildCoreSetAction({
    data: { 'review/item-001': { rating: 5 } },
  }),
]);
```

Substreams indexes every `Action::Set` write into the raw `data_updates` table keyed by `data_type` — no schema migration needed for your custom namespace to become queryable. Typed Hasura views (for SQL joins, derived counts, leaderboards over your shape) are an opt-in process: open a PR adding a view file and a substream module entry. The raw read path works from the moment your first write lands on chain.

## Notes

- Indexed reads come from gateway-backed GraphQL views, not direct contract state reads.
- Group content is read through indexed post/thread/quote surfaces, including group feeds and conversations.
- For server-side OnAPI writes, set `apiKey`, `actorId`, and attach a session before calling write methods.

## License

MIT — OnSocial Labs
