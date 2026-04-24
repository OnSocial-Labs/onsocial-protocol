# @onsocial/sdk

Gateway-first TypeScript SDK for OnSocial Protocol.

Use it to write social data, work with groups and governance, query indexed feeds and threads, upload media, mint Scarces, manage permissions, and call protocol services without dealing with raw contract payloads.

## Install

```bash
npm install @onsocial/sdk
```

## Initialize

Reads can work without authentication. Writes require either a JWT session or API-key auth.

```ts
import { OnSocial } from '@onsocial/sdk';

const os = new OnSocial({
  network: 'testnet',
});
```

### Configuration

| Option       | Description                                    |
| ------------ | ---------------------------------------------- |
| `network`    | `mainnet` or `testnet`. Defaults to `mainnet`. |
| `gatewayUrl` | Override the default gateway base URL.         |
| `apiKey`     | Server-side API key for gateway auth.          |
| `actorId`    | Account to write as when using API-key auth.   |
| `appId`      | Default app namespace for notifications.       |
| `fetch`      | Custom fetch implementation.                   |

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

### Social

```ts
await os.social.setProfile({
  name: 'Alice',
  bio: 'Builder',
});

await os.social.post({
  text: 'Hello OnSocial',
  tags: ['intro'],
});
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

| Module          | Purpose                                                    |
| --------------- | ---------------------------------------------------------- |
| `profiles`      | Read / update profile data (with auto avatar / banner upload) |
| `posts`         | Create posts, replies, quotes — including group variants   |
| `reactions`     | `add` / `remove` / `toggle` / `summary`                    |
| `saves`         | Bookmark posts (`add` / `remove` / `toggle` / `has` / `list`) |
| `endorsements`  | Weighted directed vouches                                  |
| `attestations`  | Verifiable typed claims                                    |
| `standings`     | Account ↔ account "stand with" graph                       |
| `feed`          | Indexed GraphQL reads (alias of `os.query`)                |

```ts
await os.content.profiles.update({ name: 'Alice' });
await os.content.posts.create({ text: 'gm' });
await os.content.reactions.toggle(post, 'like');
await os.content.saves.add(post, { folder: 'inspiration' });
const feed = await os.content.feed.fromAccounts({ accountId: 'alice.near' });
```

### `os.economy` — value flows

| Module    | Purpose                                       |
| --------- | --------------------------------------------- |
| `scarces` | Collections, mint, list, offers (NFTs)        |
| `rewards` | Credit / claim / balance                      |

```ts
await os.economy.scarces.tokens.mint({ title: 'Art', image: file });
await os.economy.rewards.claim(claimId);
```

### `os.platform` — dev-platform & integration

| Module          | Purpose                                |
| --------------- | -------------------------------------- |
| `storage`       | IPFS file / JSON upload                |
| `permissions`   | Account + key permission management    |
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
| `os.social` | Raw NEAR Social KV (`set` / `get` / `listKeys` / `countKeys`) |

## Going Lower-Level

The opinionated namespaces above cover the common app cases. When you need granular control — an action the SDK hasn't wrapped yet, a custom NEAR Social path, a pre-signed payload from a wallet, or a direct gateway call — reach for `os.raw`.

```ts
// Any contract action via the gateway relayer (intent auth — gasless).
// Same as os.execute(...) at the top level.
await os.raw.execute({
  type: 'create_proposal',
  group_id: 'dao',
  proposal: { title: 'Promote Bob', kind: 'AddMember', member_id: 'bob.near' },
});

// Submit a pre-signed payload (e.g. from a wallet signature).
import { buildPostAction, buildSigningPayload, buildSigningMessage }
  from '@onsocial/sdk/advanced';

const action  = buildPostAction({ text: 'gm' });
const payload = buildSigningPayload({ targetAccount, publicKey, nonce, expiresAtMs, action });
const message = buildSigningMessage(targetAccount, payload);
const signature = await wallet.signMessage(message);

await os.raw.submit(action, {
  targetAccount,
  auth: {
    type: 'signed_payload',
    public_key: publicKey,
    nonce: String(nonce),
    expires_at_ms: String(expiresAtMs),
    signature,
  },
});

// Raw NEAR Social KV.
await os.raw.social.set('alice.near/widget/myWidget', { code: '...' });
const entry = await os.raw.social.getOne('widget/myWidget', 'alice.near');

// Direct gateway HTTP if you need an endpoint we don't model yet.
const result = await os.raw.http.post('/relay/custom', { ... });
```

For full protocol primitives — typed `Action` builders, signing helpers, the `DirectRelay` (bypass the gateway entirely), `paths`, and `CONTRACTS` — import from the `/advanced` entry point:

```ts
import {
  buildPostAction,
  buildCreateProposalAction,
  buildSigningPayload,
  DirectRelay,
  paths,
  CONTRACTS,
} from '@onsocial/sdk/advanced';
```

See [`examples/`](./examples) for runnable samples covering feeds, groups, scarces, signed payloads, and webhooks.

## Build Any dApp

You're not constrained to the modelled domains (posts, groups, scarces, …). The protocol indexes **any** data you write under your own first-segment namespace, and the SDK gives you typed reads + writes for it without forking anything.

```ts
// 1. Pick your own namespace — the indexer auto-derives `data_type` from
//    the first path segment, so 'review' becomes its own queryable type.
await os.social.set('review/item-001', JSON.stringify({
  rating: 5,
  reviewer: 'alice.near',
  timestamp: 1772668800,
}));

// 2. Read every entry of your custom type, scoped or unscoped by account.
const reviews = await os.query.raw.byType('review', { accountId: 'alice.near' });

// 3. Or look up a single entry by full path.
const review = await os.query.raw.byPath('alice.near/review/item-001');

// 4. Need shapes the typed query helpers don't model? Drop to raw GraphQL.
const { data } = await os.query.graphql<{ dataUpdates: { path: string; value: string }[] }>({
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
- For server-side API-key writes, set both `apiKey` and `actorId`.

## License

MIT — OnSocial Labs
