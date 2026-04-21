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
const feed = await os.query.getFeed({ accountId: 'alice.near' });
const posts = await os.query.getPosts({ author: 'alice.near' });

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
const feed = await os.query.getGroupFeed({
  groupId: 'dao',
  limit: 20,
});

console.log(feed.items.map((post) => post.postId));
```

### Read a filtered group feed

```ts
const announcements = await os.query.getFilteredGroupFeed({
  groupId: 'dao',
  channel: 'engineering',
  kind: 'announcement',
});
```

### Read a single group post

```ts
const post = await os.query.getGroupPost(root);
console.log(post?.value);
```

### Read replies only

```ts
const replies = await os.query.getGroupThread(root, { limit: 50 });
```

### Read quotes only

```ts
const quotes = await os.query.getQuotesForGroupPost(root, { limit: 50 });
```

### Read the whole conversation

```ts
const conversation = await os.query.getGroupConversation(root, {
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

| Module           | Purpose                                                       |
| ---------------- | ------------------------------------------------------------- |
| `os.auth`        | Login, refresh, session management                            |
| `os.social`      | Profiles, posts, replies, quotes, reactions, standings, saves |
| `os.groups`      | Group lifecycle, membership, governance, group content        |
| `os.query`       | Indexed GraphQL reads and convenience helpers                 |
| `os.scarces`     | Collections, minting, listings, offers                        |
| `os.rewards`     | Credit and claim reward flows                                 |
| `os.storage`     | File and JSON upload                                          |
| `os.permissions` | Account and key-level permission management                   |
| `os.chain`       | Storage balance and contract info                             |
| `os.pages`       | OnSocial page configuration                                   |

## Low-Level Builders

If you need explicit data payloads or path construction, the package also exports lower-level helpers such as:

- `buildPostSetData`
- `buildReplySetData`
- `buildQuoteSetData`
- `buildGroupPostSetData`
- `buildGroupReplySetData`
- `buildGroupQuoteSetData`
- `buildGroupPostPath`

## Notes

- Indexed reads come from gateway-backed GraphQL views, not direct contract state reads.
- Group content is read through indexed post/thread/quote surfaces, including group feeds and conversations.
- For server-side API-key writes, set both `apiKey` and `actorId`.

## License

MIT — OnSocial Labs
