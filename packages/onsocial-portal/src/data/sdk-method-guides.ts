import type { PortalAccent } from '@/lib/portal-colors';

export type SdkMethodGuideExample = {
  title: string;
  description: string;
  code: string;
};

export type SdkMethodGuide = {
  slug: string;
  title: string;
  badge: string;
  accent: PortalAccent;
  summary: string;
  bestFor: string[];
  buildOrder: string[];
  primaryMethods: string[];
  readMethods: string[];
  transactionModel: string[];
  examples: SdkMethodGuideExample[];
  notes: string[];
  playgroundHref?: string;
};

export const SDK_METHOD_GUIDES: SdkMethodGuide[] = [
  {
    slug: 'identity-content',
    title: 'Identity and content',
    badge: 'Content',
    accent: 'blue',
    summary:
      'Build profiles, posts, replies, quotes, reactions, saves, standings, endorsements, and attestations using the high-level social modules first.',
    bestFor: [
      'Profile setup and account identity surfaces.',
      'Feeds, thread composers, reactions, bookmarks, and social proof.',
      'Apps that need immediate post readback plus indexed discovery later.',
    ],
    buildOrder: [
      'Connect the wallet and create an OnSocial client with wallet broadcast for browser writes.',
      'Write through os.profiles, os.posts, os.reactions, os.saves, os.standings, os.endorsements, or os.attestations.',
      'Read the exact path back with os.social.getOne or os.social.get immediately after the write.',
      'Use os.query.feed, os.query.threads, or other indexed helpers for product lists once the indexer catches up.',
    ],
    primaryMethods: [
      'os.profiles.update(profile)',
      'os.profiles.get(accountId) and os.profiles.getMany(accountIds)',
      'os.posts.create(post, postId?)',
      'os.posts.reply(parent, reply, replyId?)',
      'os.posts.quote(ref, quote, quoteId?)',
      'os.posts.groupPost(groupId, post, postId?)',
      'os.reactions.add/remove/toggle/summary',
      'os.saves.add/remove/toggle/list',
      'os.standings.add/remove',
      'os.endorsements.* and os.attestations.*',
    ],
    readMethods: [
      'os.social.getOne("post/" + postId, authorId) for fresh source-of-truth reads.',
      'os.query.feed.recent({ author, limit }) for indexed feed surfaces.',
      'os.query.threads.replies(author, postId) and os.query.threads.tree(author, postId) for thread views.',
      'os.query.reactions.counts(author, path) for aggregate reaction counts.',
    ],
    transactionModel: [
      'Each high-level write is one contract action and therefore one wallet modal when defaultBroadcast is wallet.',
      'Use deterministic postId or replyId values when the UI may retry a write.',
      'When one user intent writes multiple paths, use os.social.set with builders so it becomes one atomic transaction.',
    ],
    examples: [
      {
        title: 'Create a profile, post, reply, and read the thread',
        description:
          'This assumes the client already has wallet broadcast configured for browser writes.',
        code: `const postId = Date.now().toString();

await os.profiles.update({
  name: 'Ada',
  bio: 'Building on OnSocial',
});

await os.posts.create(
  { text: 'gm OnSocial', access: 'public' },
  postId
);

const replyId = 'reply_' + Date.now().toString(36);
await os.posts.reply(
  { author: accountId, postId },
  { text: 'First reply on the thread', access: 'public' },
  replyId
);

const freshPost = await os.social.getOne('post/' + postId, accountId);
const indexedThread = await os.query.threads.tree(accountId, postId, {
  depth: 2,
  replyLimit: 20,
});`,
      },
    ],
    notes: [
      'Use os.posts.create/reply/quote for ordinary composers; they normalize schema fields for you.',
      'Direct social reads should drive immediate write confirmation because indexed reads can lag.',
      'Use os.social.set only when you intentionally need multiple canonical paths in the same transaction.',
    ],
    playgroundHref: '/playground?example=reply-to-post',
  },
  {
    slug: 'groups-governance',
    title: 'Groups and governance',
    badge: 'Spaces',
    accent: 'purple',
    summary:
      'Create group spaces, manage membership, write group content, and route member-driven changes through governance instead of direct admin mutation.',
    bestFor: [
      'Communities, clubs, teams, or app-owned content spaces.',
      'Group feeds with membership checks and moderation paths.',
      'Member-driven groups where permission changes should become proposals.',
    ],
    buildOrder: [
      'Create the group with os.groups.create and a v: 1 config.',
      'Add or approve members with os.groups.addMember, approveJoin, rejectJoin, join, and leave.',
      'Write group content with os.posts.groupPost, groupReply, or groupQuote.',
      'Read group config and membership directly, then read feeds through os.query.groups.',
      'For member-driven groups, use os.permissions.grantOrPropose or revokeOrPropose for group paths.',
    ],
    primaryMethods: [
      'os.groups.create(groupId, config)',
      'os.groups.join(groupId) and os.groups.leave(groupId)',
      'os.groups.addMember/removeMember/approveJoin/rejectJoin',
      'os.groups.getConfig/getStats/getMember/isMember/isMemberDriven',
      'os.posts.groupPost/groupReply/groupQuote',
      'os.groups.propose/vote/listProposals/getProposal',
      'os.permissions.grantOrPropose and os.permissions.revokeOrPropose',
    ],
    readMethods: [
      'os.groups.getConfig(groupId) for current group settings.',
      'os.groups.isMember(groupId, accountId) before showing member-only actions.',
      'os.query.groups.feed(groupId, { limit }) for indexed group timelines.',
      'os.query.groups.post(author, groupId, postId) for indexed group post rows.',
    ],
    transactionModel: [
      'Group lifecycle and member management writes are wallet or session signed contract actions.',
      'Direct admin grants require authority over the path; member-driven groups should file proposals.',
      'Group posts are social writes under group content paths and can be read directly after the transaction.',
    ],
    examples: [
      {
        title: 'Create a group and post into it',
        description:
          'Use deterministic group and post IDs if you need retry-safe setup flows.',
        code: `const groupId = 'builders_' + accountId.replace(/[^a-z0-9_-]/g, '_');
const postId = 'post_' + Date.now().toString(36);

await os.groups.create(groupId, {
  v: 1,
  name: 'Builder Room',
  description: 'A testnet group for app builders.',
  isPrivate: false,
  memberDriven: false,
  tags: ['dev'],
});

await os.groups.addMember(groupId, accountId);

await os.posts.groupPost(
  groupId,
  { text: 'Hello from the group feed', access: 'public' },
  postId
);

const config = await os.groups.getConfig(groupId);
const isMember = await os.groups.isMember(groupId, accountId);
const feed = await os.query.groups.feed(groupId, { limit: 20 });`,
      },
    ],
    notes: [
      'Treat group IDs as public namespace IDs; generate predictable, app-safe names.',
      'Member-driven governance changes are slower by design because they go through proposals.',
      'Keep group content reads split between direct confirmation and indexed timeline UI.',
    ],
    playgroundHref: '/playground?example=create-group',
  },
  {
    slug: 'permissions-storage',
    title: 'Permissions and storage',
    badge: 'Access',
    accent: 'green',
    summary:
      'Manage path-scoped permissions, key grants, IPFS uploads, and storage balances that keep write-heavy apps reliable.',
    bestFor: [
      'Delegating account-owned paths to another account or app key.',
      'Preflighting storage balance before writes, uploads, and group setup.',
      'Auditing grant history and explaining why an action is available.',
    ],
    buildOrder: [
      'Check os.storageAccount.balance before write-heavy flows.',
      'Top up with os.storageAccount.deposit when the account needs more storage.',
      'Grant account or key access with os.permissions.grant or grantKey.',
      'Check current access with os.permissions.has or os.permissions.get before showing privileged UI.',
      'Use os.query.permissions.* for history and audit screens, not current authority.',
    ],
    primaryMethods: [
      'PERMISSION.WRITE, PERMISSION.MODERATE, PERMISSION.MANAGE',
      'os.permissions.grant(grantee, path, level, expiresAt?)',
      'os.permissions.revoke(grantee, path)',
      'os.permissions.grantKey(publicKey, path, level, expiresAt?)',
      'os.permissions.revokeKey(publicKey, path)',
      'os.permissions.has(owner, grantee, path, level)',
      'os.permissions.get(owner, grantee, path)',
      'os.storage.upload/uploadJson/uploadMany/url',
      'os.storageAccount.balance/deposit/withdraw/tip/sponsor',
    ],
    readMethods: [
      'os.permissions.has(owner, grantee, path, level) for current on-chain authority.',
      'os.permissions.get(owner, grantee, path) for the current permission level.',
      'os.query.permissions.history(accountId) for indexed grant/revoke timelines.',
      'os.query.permissions.grantsBy/grantsTo/keyGrantsBy for audit tables.',
      'os.storageAccount.balance(accountId) for live storage balance checks.',
    ],
    transactionModel: [
      'Storage deposits attach value, so browser flows should use wallet broadcast.',
      'Direct permission grants are admin-style writes; use wait: true or confirmation in critical flows when available.',
      'Permission query helpers are indexed history and can lag; use os.permissions.has/get for decisions.',
    ],
    examples: [
      {
        title: 'Top up storage, grant a path, and verify access',
        description:
          'Use relative paths for grants, then use the current-state helpers for authorization checks.',
        code: `import { NEAR, PERMISSION } from '@onsocial/sdk';

const path = 'playground/permissions/write/';
const grantee = 'app.' + accountId;

const before = await os.storageAccount.balance(accountId);
if (!before || before.available === '0') {
  await os.storageAccount.deposit(NEAR('0.1'));
}

await os.permissions.grant(grantee, path, PERMISSION.WRITE);

const canWrite = await os.permissions.has(
  accountId,
  grantee,
  path,
  PERMISSION.WRITE
);

const level = await os.permissions.get(accountId, grantee, path);
const history = await os.query.permissions.history(accountId, { limit: 20 });`,
      },
    ],
    notes: [
      'Never put API keys in public browser code; storage uploads through the gateway should use user auth or server mediation.',
      'Grant the narrowest path that lets the app work.',
      'Keep permission checks separate from indexed audit history in UI copy and code.',
    ],
    playgroundHref: '/playground?example=grant-permission',
  },
  {
    slug: 'indexed-reads',
    title: 'Indexed reads',
    badge: 'Queries',
    accent: 'gold',
    summary:
      'Use typed query modules for feeds, threads, group timelines, reactions, permissions, storage events, discovery, and analytics once indexer lag is acceptable.',
    bestFor: [
      'Feed screens, search/discovery surfaces, history tables, and dashboards.',
      'Thread trees and reply lists that need aggregation or pagination.',
      'Server-side reporting and app analytics using GraphQL helpers.',
    ],
    buildOrder: [
      'Use direct reads for immediate confirmation after writes.',
      'Use os.query.* helpers for list and history views.',
      'Show a pending state when a direct read succeeds but the indexed read has not caught up.',
      'Use os.query.graphql or os.query.raw only when typed helpers do not cover the surface yet.',
    ],
    primaryMethods: [
      'os.query.feed.recent(opts)',
      'os.query.threads.replies(author, postId, opts)',
      'os.query.threads.tree(author, postId, opts)',
      'os.query.groups.feed(groupId, opts)',
      'os.query.groups.post(author, groupId, postId)',
      'os.query.profiles.*',
      'os.query.reactions.counts(author, path)',
      'os.query.permissions.* and os.query.governance.*',
      'os.query.storage.*',
      'os.query.graphql({ query, variables })',
    ],
    readMethods: [
      'os.social.getOne(path, accountId) when you need the current contract state.',
      'os.query.feed.recent for home, profile, or app feed lists.',
      'os.query.threads.tree for a full conversation shape.',
      'os.query.graphql for custom product queries backed by the same indexer.',
    ],
    transactionModel: [
      'Indexed reads do not sign transactions.',
      'API keys are appropriate on trusted servers for protected query lanes.',
      'A successful write does not guarantee the indexer has already produced the matching row.',
    ],
    examples: [
      {
        title: 'Read a post directly, then render indexed surfaces',
        description:
          'This is the pattern to use after any write that should appear in feeds or threads.',
        code: `const freshPost = await os.social.getOne('post/' + postId, authorId);

const [profileFeed, thread, reactions] = await Promise.all([
  os.query.feed.recent({ author: authorId, limit: 20 }),
  os.query.threads.tree(authorId, postId, {
    depth: 3,
    replyLimit: 20,
    quoteLimit: 20,
    includeQuotes: true,
  }),
  os.query.reactions.counts(authorId, 'post/' + postId),
]);

const pendingIndexer = Boolean(freshPost) && !thread.root;`,
      },
    ],
    notes: [
      'Do not block write success on indexed rows appearing immediately.',
      'Keep direct and indexed result labels visible in developer tools and examples.',
      'Prefer typed helpers before raw GraphQL so method names stay teachable.',
    ],
    playgroundHref: '/playground?example=query-post-thread',
  },
  {
    slug: 'economy',
    title: 'Economy',
    badge: 'Value',
    accent: 'pink',
    summary:
      'Mint scarces, run marketplace actions, inspect rewards, read token state, and connect social posts to collectible or reward flows.',
    bestFor: [
      'Collectible posts, scarce minting, marketplace listings, and receipts.',
      'Reward balances, partner credits, and claim surfaces.',
      'Token and boost state that needs read-only product UI.',
    ],
    buildOrder: [
      'Choose whether the asset starts as a post, uploaded media, or an existing IPFS CID.',
      'Use os.scarces.fromPost when the scarce should preserve source-post provenance.',
      'Use os.scarces.tokens for direct NFT mint, transfer, burn, renew, redeem, or refund flows.',
      'Use os.scarces.market, auctions, or offers for exchange flows.',
      'Use os.rewards, os.token, and os.boost for balances and related economy state.',
    ],
    primaryMethods: [
      'os.scarces.tokens.mint/get/transfer/batchTransfer/burn/renew/redeem',
      'os.scarces.fromPost.mint(post, opts)',
      'os.scarces.fromPost.list(post, priceNear, opts)',
      'os.scarces.market.sell/delist/purchase',
      'os.scarces.collections.create/mintFrom/purchaseFrom',
      'os.scarces.auctions.* and os.scarces.offers.*',
      'os.rewards.credit/claim/getBalance',
      'os.token.* and os.boost.* reads',
    ],
    readMethods: [
      'os.scarces.tokens.get(tokenId) for NEP-171 token metadata.',
      'os.query.scarces.* for indexed event and listing surfaces when available.',
      'os.rewards.getBalance(accountId) for partner reward balances.',
      'os.token.* and os.boost.* helpers for read-only token and boost state.',
    ],
    transactionModel: [
      'Minting, market, auction, offer, and reward claim flows are signed writes.',
      'Gateway upload flows may upload media before the signed transaction is relayed.',
      'Use wallet broadcast for browser flows that need user-paid deposits or wallet-native signing.',
    ],
    examples: [
      {
        title: 'Mint or lazy-list a post as a scarce',
        description:
          'fromPost can read the source post, reuse post media, and store source-post provenance in token metadata.',
        code: `const sourcePost = { author: accountId, postId };

const mint = await os.scarces.fromPost.mint(
  sourcePost,
  { copies: 10 }
);

const lazyListing = await os.scarces.fromPost.list(
  sourcePost,
  '5',
  { royalty: { [accountId]: 1000 } }
);

const recentMints = await os.query.scarces.mintsBy(accountId, {
  limit: 5,
});`,
      },
      {
        title: 'Mint directly from metadata and a CID',
        description:
          'Use direct minting when the scarce is not attached to an OnSocial post.',
        code: `await os.scarces.tokens.mint({
  title: 'Founders badge',
  description: 'A testnet collectible for early builders.',
  mediaCid: imageCid,
  mediaHash,
  copies: 100,
  appId: 'my-app',
});`,
      },
    ],
    notes: [
      'Use fromPost for provenance; use tokens.mint for standalone assets.',
      'Keep marketplace and reward flows behind explicit user confirmation.',
      'Server-side reward crediting should use trusted auth and should not expose API keys to browsers.',
    ],
  },
  {
    slug: 'advanced-control',
    title: 'Advanced control',
    badge: 'Low level',
    accent: 'slate',
    summary:
      'Drop below noun modules when you need atomic multi-path social writes, custom contract actions, raw reads, or self-hosted broadcast control.',
    bestFor: [
      'Atomic writes where one user intent spans multiple social paths.',
      'Custom contract actions that do not yet have high-level SDK helpers.',
      'Infrastructure teams wiring gateway, relayer, or wallet broadcast explicitly.',
    ],
    buildOrder: [
      'Start with high-level modules and identify the exact behavior they cannot express.',
      'Use builders plus os.social.set for atomic social data composition.',
      'Use os.execute for custom contract actions and pass wait: true when finality matters.',
      'Use os.raw.* for diagnostics, escape hatches, or infrastructure integrations.',
      'Keep broadcast target choices explicit in code review.',
    ],
    primaryMethods: [
      'os.social.set(entries)',
      'os.social.get/getOne/listKeys/countKeys/delete',
      'buildPostSetData/buildReplySetData/buildGroupPostSetData',
      'os.execute(action, opts?)',
      'os.raw.social, os.raw.http, os.raw.execute',
      'defaultBroadcast: { kind: "wallet" | "gateway" | "relayer" }',
      'os.auth.setToken(token) for browser gateway auth after NEP-413 login',
    ],
    readMethods: [
      'os.social.getOne for exact owner/path reads.',
      'os.social.get for multi-path social reads.',
      'os.raw.social when you need lower-level social contract access.',
      'os.query.graphql for custom indexed views after direct state is confirmed.',
    ],
    transactionModel: [
      'os.social.set batches many social entries into one Action::Set transaction.',
      'os.execute signs and relays a single custom action to the selected contract.',
      'Gateway/session writes require an attached session unless wallet broadcast is configured.',
      'Wallet broadcast keeps public browser writes user-signed and visible in the wallet modal.',
    ],
    examples: [
      {
        title: 'Batch root post and reply into one wallet transaction',
        description:
          'This is the pattern behind the playground reply example that avoids two wallet modals.',
        code: `import { buildPostSetData, buildReplySetData } from '@onsocial/sdk';

const rootPostId = 'root_' + Date.now().toString(36);
const replyId = 'reply_' + Date.now().toString(36);

await os.social.set({
  ...buildPostSetData(
    { text: 'Root post', access: 'public' },
    rootPostId
  ),
  ...buildReplySetData(
    accountId,
    rootPostId,
    { text: 'Reply in the same transaction', access: 'public' },
    replyId,
    Date.now() + 1
  ),
});

const root = await os.social.getOne('post/' + rootPostId, accountId);
const reply = await os.social.getOne('post/' + replyId, accountId);`,
      },
      {
        title: 'Execute a custom core action',
        description:
          'Use this when the contract supports an action before the SDK has a named module method.',
        code: `await os.execute(
  {
    type: 'create_group',
    group_id: 'builders',
    config: {
      v: 1,
      name: 'Builders',
      is_private: false,
      member_driven: false,
    },
  },
  { wait: true }
);`,
      },
    ],
    notes: [
      'Advanced APIs are powerful, but the high-level modules are the safer default for app teams.',
      'Batch only paths that belong to the same user intent and should succeed or fail together.',
      'Use wait: true for writes where an on-chain revert must immediately stop follow-up work.',
    ],
    playgroundHref: '/playground?example=reply-to-post',
  },
];

export function getSdkMethodGuide(slug: string) {
  return SDK_METHOD_GUIDES.find((guide) => guide.slug === slug);
}
