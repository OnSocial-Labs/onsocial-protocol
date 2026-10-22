import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  Boxes,
  GitBranch,
  Key,
  Layers3,
  Route,
  ShieldCheck,
} from 'lucide-react';
import { communityDappSnippet } from '@/features/onapi/community-dapp-snippet';
import type { PortalAccent } from '@/lib/portal-colors';

export type SdkBuildPath = {
  title: string;
  icon: LucideIcon;
  accent: PortalAccent;
  bestFor: string;
  steps: string[];
  href: string;
  hrefLabel: string;
};

export type SdkRecipe = {
  title: string;
  methods: string[];
  badges: string[];
  note: string;
  accent: PortalAccent;
  href: string;
};

export type SdkMethodFamily = {
  title: string;
  icon: LucideIcon;
  accent: PortalAccent;
  summary: string;
  methods: string[];
  href: string;
};

export type SdkPackage = {
  name: string;
  manager: string;
  command: string;
  status: string;
  accent: PortalAccent;
  href?: string;
};

export const SDK_BUILD_PATHS: SdkBuildPath[] = [
  {
    title: 'Create an app',
    icon: Boxes,
    accent: 'blue',
    bestFor:
      'A public https site on the launcher. Visitors sign in with OnSocial. No API key.',
    steps: [
      'List the https site on OnAPI → Apps. A key does not list the tile.',
      'Add @onsocial/sdk.',
      'Call os.auth.completeAppHandoff. The first visit goes to OnSocial.',
      'Write apps/<appId>/… or a post.',
    ],
    href: '/onapi/apps',
    hrefLabel: 'List a site',
  },
  {
    title: 'Use a key',
    icon: Key,
    accent: 'purple',
    bestFor:
      'A server. Rewards credit, private queries, webhooks, and archival RPC.',
    steps: [
      'Create a key on OnAPI → Keys.',
      'Keep the key on the server.',
      'Pass apiKey to OnSocial.',
      'Query, credit rewards, or call os.rpc.',
    ],
    href: '/onapi/keys',
    hrefLabel: 'Create a key',
  },
];

export const SDK_COMMUNITY_STARTER_CODE = communityDappSnippet({
  appId: 'tracker',
  osOrigin: 'https://testnet.onsocial.id',
  network: 'testnet',
});

export const SDK_KEY_STARTER_CODE = `import { OnSocial } from '@onsocial/sdk';

const os = new OnSocial({
  network: 'testnet',
  apiKey: process.env.ONSOCIAL_API_KEY,
});

await os.rewards.getBalance(accountId);
await os.query.feed.recent({ author: accountId, limit: 20 });`;

export const SDK_PLAYGROUND_RECIPES: SdkRecipe[] = [
  {
    title: 'Community dapp',
    methods: [
      'os.auth.completeAppHandoff',
      'os.social.set',
      'os.query.raw.byAppId',
    ],
    badges: ['Handoff', 'App JSON'],
    note: 'List the https site, then Continue with OnSocial. First visit throws AppHandoffRedirect.',
    accent: 'blue',
    href: '/onapi/apps',
  },
  {
    title: 'Create profile',
    methods: ['os.profiles.update', 'os.profiles.get'],
    badges: ['Write', 'Direct read'],
    note: 'Good first write because every app needs identity data.',
    accent: 'green',
    href: '/playground?example=create-profile',
  },
  {
    title: 'Create post',
    methods: ['os.posts.create', 'os.social.getOne'],
    badges: ['Write', 'Direct read'],
    note: 'Create a post, then read it back before the feed catches up.',
    accent: 'blue',
    href: '/playground?example=create-post',
  },
  {
    title: 'Mint a scarce',
    methods: ['os.scarces.fromPost.mint', 'os.query.scarces.mintsBy'],
    badges: ['Write', 'Indexed read'],
    note: 'Mint a post as a scarce, then read the mint.',
    accent: 'pink',
    href: '/playground?example=mint-scarce',
  },
  {
    title: 'Reply and thread',
    methods: ['os.posts.reply', 'os.social.getOne'],
    badges: ['Write', 'Direct read'],
    note: 'Reply to a post, then read the reply back.',
    accent: 'gold',
    href: '/playground?example=reply-to-post',
  },
  {
    title: 'Group lifecycle',
    methods: ['os.groups.create', 'os.groups.addMember', 'os.posts.groupPost'],
    badges: ['Write', 'Direct read', 'Indexed read'],
    note: 'Covers app-owned spaces, membership, and group content paths.',
    accent: 'purple',
    href: '/playground?example=create-group',
  },
  {
    title: 'Permissions',
    methods: ['os.permissions.grant', 'os.permissions.get'],
    badges: ['Write', 'Direct read'],
    note: 'Grant write on a path, then read the level.',
    accent: 'red',
    href: '/playground?example=grant-permission',
  },
  {
    title: 'Storage account',
    methods: ['os.storageAccount.balance', 'os.storageAccount.deposit'],
    badges: ['Read', 'Wallet deposit'],
    note: 'Explains the storage balance every real write depends on.',
    accent: 'neutral',
    href: '/playground?example=check-storage',
  },
];

export const SDK_METHOD_FAMILIES: SdkMethodFamily[] = [
  {
    title: 'Profiles and posts',
    icon: Layers3,
    accent: 'blue',
    summary:
      'Profiles, posts, stand, reactions, and saves. Feeds and threads are on this page.',
    methods: [
      'os.profiles.update/get/getMany/avatarUrl/bannerUrl',
      'os.posts.create/reply/quote/groupPost/groupReply/groupQuote',
      'os.reactions.add/remove/toggle/summary',
      'os.standings.add/remove',
      'os.saves.add/remove/toggle/list',
      'os.endorsements.* and os.attestations.*',
      'os.query.feed.recent/fromAccounts/pulse/byHashtag/byTicker/byPlace',
      'os.query.threads.replies/tree',
    ],
    href: '/sdk/identity-content',
  },
  {
    title: 'Groups',
    icon: GitBranch,
    accent: 'purple',
    summary:
      'Members, roles, posts, and proposals. Group feeds are on this page.',
    methods: [
      'os.groups.create/join/leave',
      'os.groups.addMember/removeMember/approveJoin/rejectJoin',
      'os.groups.getConfig/getStats/getMember/isMember',
      'os.groups.propose/vote/listProposals/getProposal',
      'os.permissions.grantOrPropose for member-driven group paths',
      'os.query.groups.feed/post/membersOf/memberCountsFor',
    ],
    href: '/sdk/groups-governance',
  },
  {
    title: 'Permissions and storage',
    icon: ShieldCheck,
    accent: 'green',
    summary:
      'Path-scoped access control plus the storage balance operations needed for reliable writes.',
    methods: [
      'PERMISSION.WRITE/MODERATE/MANAGE',
      'os.permissions.grant/revoke/grantKey/revokeKey',
      'os.permissions.has/get',
      'os.query.permissions.forPath/grantsBy/grantsTo',
      'os.storage.upload',
      'os.storageAccount.balance/deposit/withdraw/tip/sponsor',
    ],
    href: '/sdk/permissions-storage',
  },
  {
    title: 'Scarces',
    icon: Boxes,
    accent: 'pink',
    summary:
      'Art, books, music, and tickets. Market, rewards, token, and boost reads are on this page.',
    methods: [
      'os.scarces.tokens.mint/transfer/batchTransfer/burn',
      'os.scarces.collections.create/mintFrom/purchaseFrom',
      'os.scarces.market.sell/delist/purchase',
      'os.scarces.auctions.* and os.scarces.offers.*',
      'os.scarces.fromPost.mint/list',
      'os.query.scarces.*',
      'os.rewards.credit/claim/getBalance',
      'os.token.* and os.boost.* reads',
    ],
    href: '/sdk/economy',
  },
  {
    title: 'Low-level',
    icon: Route,
    accent: 'neutral',
    summary:
      'os.social.set, os.execute, and os.rpc. Use these when the noun methods do not cover the call.',
    methods: [
      'os.social.set/get/getOne/listKeys/countKeys',
      'buildPostSetData/buildReplySetData/buildGroupPostSetData',
      'os.execute({ type: ... })',
      'os.raw.social, os.raw.http, os.raw.execute',
      'os.rpc.* — NEAR JSON-RPC on the same host and OnAPI key',
      'defaultBroadcast: gateway, relayer, or wallet',
    ],
    href: '/sdk/advanced-control',
  },
  {
    title: 'Auth and services',
    icon: Bell,
    accent: 'amber',
    summary: 'Handoff and login, then inbox, DMs, webhooks, pages, and jobs.',
    methods: [
      'os.auth.login/refresh/me/logout and completeAppHandoff',
      'os.notifications.list/markRead + subscribePush',
      'os.webhooks.create/list/delete',
      'os.dm.listThreads/send/markRead',
      'os.mutes.add/remove/list/has',
      'os.pages.get/setConfig/setMood and os.jobs.create/openFor',
      'os.offers.list/create/remove',
    ],
    href: '/sdk/platform-services',
  },
];

export const SDK_PRODUCTION_CHECKS = [
  'Use direct reads after writes, then show indexed reads as eventually consistent.',
  'Use deterministic IDs for retryable writes such as posts, replies, and group setup.',
  'Batch related social paths when one user intent should be one transaction.',
  'Check storage balance before write-heavy flows and surface deposit actions clearly.',
  'Use grantOrPropose for member-driven group paths instead of forcing direct admin grants.',
  'Keep app data under clear account-owned or group content namespaces.',
  'Use API keys only on trusted servers, never in public browser code.',
];

export const SDK_PACKAGES: SdkPackage[] = [
  {
    name: '@onsocial/sdk',
    manager: 'pnpm',
    command: 'pnpm add @onsocial/sdk',
    status:
      'Client for the graph, scarces, and queries. Publishes to npm with the public launch.',
    accent: 'blue',
  },
  {
    name: '@onsocial/text-card',
    manager: 'pnpm',
    command: 'pnpm add @onsocial/text-card',
    status:
      'Pure SVG text-card generator + theme catalog. Ships alongside @onsocial/sdk.',
    accent: 'gold',
  },
  {
    name: '@onsocial-id/rewards',
    manager: 'npm',
    command: 'npm install @onsocial-id/rewards',
    status: 'Partner package',
    href: 'https://www.npmjs.com/package/@onsocial-id/rewards',
    accent: 'green',
  },
];
