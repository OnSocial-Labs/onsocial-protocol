import type { LucideIcon } from 'lucide-react';
import {
  Boxes,
  Database,
  GitBranch,
  Layers3,
  Route,
  ShieldCheck,
  Terminal,
  Wallet,
} from 'lucide-react';
import { communityDappSnippet } from '@/features/onapi/community-dapp-snippet';
import type { PortalAccent } from '@/lib/portal-colors';

export type SdkOnRamp = {
  title: string;
  badge: string;
  body: string;
  steps: string[];
  accent: PortalAccent;
  icon: LucideIcon;
  href: string;
  hrefLabel: string;
};

export type SdkDecision = {
  choice: string;
  use: string;
  wallet: string;
  auth: string;
  method: string;
  accent: PortalAccent;
};

export type SdkBuildPath = {
  title: string;
  icon: LucideIcon;
  accent: PortalAccent;
  bestFor: string;
  steps: string[];
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

export const SDK_ON_RAMPS: SdkOnRamp[] = [
  {
    title: 'Community dapp',
    badge: 'Listed site',
    body: 'Your https site on launcher page two. Visitors stay signed in with OnSocial. You never hold the OS session key.',
    steps: [
      'List the site on Portal → OnAPI → Apps (name, icon, https URL). An OnAPI key does not list a tile.',
      'On load call os.auth.completeAppHandoff({ osOrigin, appId }). First visit throws AppHandoffRedirect and goes to OS to grant apps/<appId>/. Later visits restore a stored refresh token — no bounce.',
      'Write apps/<appId>/… or os.posts / os.profiles. Query with byAppId.',
    ],
    accent: 'blue',
    icon: Boxes,
    href: '/onapi/apps',
    hrefLabel: 'List a site',
  },
  {
    title: 'Wallet or playground',
    badge: 'Connected wallet',
    body: 'A first-party app or this playground, where the visitor’s wallet signs writes and the OnAPI challenge.',
    steps: [
      'Connect a NEAR wallet, sign the gateway challenge, then os.auth.setToken.',
      'Write with wallet broadcast. Read fresh state with os.social.getOne, then os.query after the indexer catches up.',
    ],
    accent: 'green',
    icon: Wallet,
    href: '/playground',
    hrefLabel: 'Open playground',
  },
];

export const SDK_DECISIONS: SdkDecision[] = [
  {
    choice: 'Community handoff',
    use: 'Listed public site. Sign-in and apps/<appId>/ writes without a wallet on your origin.',
    wallet: 'Once on OS, then none',
    auth: 'os.auth.completeAppHandoff',
    method: 'os.auth.completeAppHandoff, os.query.raw.byAppId',
    accent: 'blue',
  },
  {
    choice: 'Direct contract read',
    use: 'Fresh readback after a write or current on-chain state.',
    wallet: 'No transaction',
    auth: 'Usually none',
    method: 'os.social.getOne, os.groups.getConfig',
    accent: 'green',
  },
  {
    choice: 'Indexed query',
    use: 'Feeds, threads, history, search, analytics, and app lists.',
    wallet: 'No transaction',
    auth: 'OnAPI JWT or API key',
    method: 'os.query.feed, os.query.threads, os.query.groups',
    accent: 'blue',
  },
  {
    choice: 'Normal SDK write',
    use: 'Most app actions where one user intent maps to one protocol write.',
    wallet: 'One approval in wallet-broadcast mode',
    auth: 'Wallet plus OnAPI compose auth',
    method: 'os.posts.create, os.profiles.update, os.groups.create',
    accent: 'purple',
  },
  {
    choice: 'Batched social set',
    use: 'Atomic multi-path writes such as setup plus reply in one transaction.',
    wallet: 'One approval for the whole batch',
    auth: 'Wallet/session capable of the write',
    method: 'os.social.set({ ...buildPostSetData(), ...buildReplySetData() })',
    accent: 'gold',
  },
  {
    choice: 'Backend/API key flow',
    use: 'Server jobs, partner rewards, admin lanes, and private infrastructure.',
    wallet: 'No user wallet',
    auth: 'API key',
    method: 'os.rewards.credit, os.query.graphql, direct service calls',
    accent: 'neutral',
  },
];

export const SDK_BUILD_PATHS: SdkBuildPath[] = [
  {
    title: 'Community dapp',
    icon: Boxes,
    accent: 'blue',
    bestFor:
      'A public https site on launcher page two that reuses OnSocial sign-in and apps/<appId> JSON.',
    steps: [
      'Create a namespace on OnAPI → Apps and list the https site.',
      'Call os.auth.completeAppHandoff({ osOrigin, appId }). Catch AppHandoffRedirect — first visit goes to OS. Later visits restore the refresh token.',
      'Write apps/<appId>/… or os.posts. Keep OnAPI keys on the server. Teams with their own wallet connect can still grant a session themselves.',
    ],
  },
  {
    title: 'Browser app',
    icon: Wallet,
    accent: 'green',
    bestFor:
      'User-owned apps where the connected wallet signs writes and auth messages.',
    steps: [
      'Connect a NEAR wallet.',
      'Request an OnAPI challenge and sign it with NEP-413 message signing.',
      'Exchange the signature for a JWT and call os.auth.setToken(token).',
      'Configure wallet broadcast for writes that should open a wallet transaction modal.',
      'Use direct reads for fresh confirmation and os.query for app views.',
    ],
  },
  {
    title: 'Backend service',
    icon: Terminal,
    accent: 'blue',
    bestFor:
      'Server-rendered apps, cron jobs, partner integrations, and private API surfaces.',
    steps: [
      'Keep the OnAPI key on the server only.',
      'Create the SDK client with apiKey for indexed reads, rewards, and trusted service endpoints.',
      'Use wallet or session signing for normal user-owned writes, even from apps with a backend.',
      'Use direct service lanes only for server-authorized admin or partner flows.',
      'Never ship API keys or privileged relayer credentials to browser code.',
    ],
  },
  {
    title: 'Advanced session or relayer',
    icon: Route,
    accent: 'gold',
    bestFor:
      'Apps that want lower-friction repeat actions, custom relayers, or atomic composition.',
    steps: [
      'Start with normal wallet broadcast until the product flow is proven.',
      'Introduce session keys for repeated 0-deposit user actions.',
      'Use os.social.set batches when one user intent writes multiple canonical paths.',
      'Use os.execute only when the noun modules do not model the action yet.',
    ],
  },
];

export const SDK_COMMUNITY_STARTER_CODE = communityDappSnippet({
  appId: 'tracker',
  osOrigin: 'https://testnet.onsocial.id',
  network: 'testnet',
});

export const SDK_BROWSER_STARTER_CODE = `import { OnSocial } from '@onsocial/sdk';

const network = 'testnet';
const gatewayUrl = 'https://testnet.onsocial.id';

async function getOnApiJwt(wallet, accountId) {
  const challengeRes = await fetch(\`\${gatewayUrl}/auth/challenge\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId }),
  });
  const { challenge } = await challengeRes.json();

  const signed = await wallet.signMessage({
    network,
    signerId: accountId,
    message: challenge.message,
    recipient: challenge.recipient,
    nonce: Uint8Array.from(atob(challenge.nonce), (char) => char.charCodeAt(0)),
  });

  const loginRes = await fetch(\`\${gatewayUrl}/auth/login\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      accountId: signed.accountId,
      message: challenge.message,
      signature: signed.signature,
      publicKey: signed.publicKey,
    }),
  });
  const { token } = await loginRes.json();
  return token;
}

export async function createOnSocialForWallet(wallet, accountId) {
  const os = new OnSocial({
    network,
    gatewayUrl,
    defaultBroadcast: {
      kind: 'wallet',
      signer: ({ receiverId, actions }) =>
        wallet.signAndSendTransaction({
          network,
          signerId: accountId,
          receiverId,
          actions: actions.map((action) => ({
            type: 'FunctionCall',
            params: {
              methodName: action.methodName,
              args: action.args,
              gas: action.gas,
              deposit: action.deposit,
            },
          })),
        }),
    },
  });

  os.auth.setToken(await getOnApiJwt(wallet, accountId));
  return os;
}

const os = await createOnSocialForWallet(wallet, wallet.accountId);
const postId = Date.now().toString();

await os.posts.create({ text: 'Hello OnSocial', access: 'public' }, postId);

const fresh = await os.social.getOne(\`post/\${postId}\`, wallet.accountId);
const feed = await os.query.feed.recent({ author: wallet.accountId, limit: 10 });`;

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
    methods: ['os.profiles.update', 'os.social.get'],
    badges: ['Write', 'Direct read'],
    note: 'Good first write because every app needs identity data.',
    accent: 'green',
    href: '/playground?example=create-profile',
  },
  {
    title: 'Create post',
    methods: ['os.posts.create', 'os.social.getOne'],
    badges: ['Write', 'Direct read'],
    note: 'Shows the blessed content method and immediate source-of-truth readback.',
    accent: 'blue',
    href: '/playground?example=create-post',
  },
  {
    title: 'Reply and thread',
    methods: [
      'os.social.set batch',
      'os.query.threads.replies',
      'os.query.threads.tree',
    ],
    badges: ['Batched', 'Indexed read'],
    note: 'Demonstrates one transaction for root plus reply, then the indexed conversation view.',
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
    methods: [
      'os.permissions.grant',
      'os.permissions.revoke',
      'os.permissions.has',
    ],
    badges: ['Wallet admin', 'Path scoped'],
    note: 'Teaches account-owned namespaces and path-level delegation safely.',
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
    title: 'Identity and content',
    icon: Layers3,
    accent: 'blue',
    summary:
      'Profiles, posts, replies, quotes, reactions, saves, attestations, and social graph actions.',
    methods: [
      'os.profiles.update/get/getMany/avatarUrl/bannerUrl',
      'os.posts.create/reply/quote/groupPost/groupReply/groupQuote',
      'os.reactions.add/remove/toggle/summary',
      'os.standings.add/remove',
      'os.saves.add/remove/toggle/list',
      'os.endorsements.* and os.attestations.*',
    ],
    href: '/sdk/identity-content',
  },
  {
    title: 'Groups and governance',
    icon: GitBranch,
    accent: 'purple',
    summary:
      'Create spaces, manage members, post to groups, and route member-driven changes through governance.',
    methods: [
      'os.groups.create/join/leave',
      'os.groups.addMember/removeMember/approveJoin/rejectJoin',
      'os.groups.getConfig/getStats/getMember/isMember',
      'os.groups.propose/vote/listProposals/getProposal',
      'os.permissions.grantOrPropose for member-driven group paths',
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
    title: 'Indexed reads',
    icon: Database,
    accent: 'gold',
    summary:
      'Typed GraphQL helpers for product surfaces that need lists, history, discovery, or analytics.',
    methods: [
      'os.query.feed.recent',
      'os.query.threads.replies/tree',
      'os.query.groups.feed/post',
      'os.query.profiles/reactions/standings/saves',
      'os.query.permissions/governance/storage/raw/graphql',
    ],
    href: '/sdk/indexed-reads',
  },
  {
    title: 'Economy',
    icon: Boxes,
    accent: 'pink',
    summary:
      'Scarces, marketplace flows, reward balances, token reads, and boost state.',
    methods: [
      'os.scarces.tokens.mint/transfer/batchTransfer/burn',
      'os.scarces.collections.create/mintFrom/purchaseFrom',
      'os.scarces.market.sell/delist/purchase',
      'os.scarces.auctions.* and os.scarces.offers.*',
      'os.scarces.fromPost.mint/list',
      'os.rewards.credit/claim/getBalance',
      'os.token.* and os.boost.* reads',
    ],
    href: '/sdk/economy',
  },
  {
    title: 'Advanced control',
    icon: Route,
    accent: 'neutral',
    summary:
      'Lower-level tools for custom apps, atomic batches, raw actions, and self-hosted infrastructure.',
    methods: [
      'os.social.set/get/getOne/listKeys/countKeys',
      'buildPostSetData/buildReplySetData/buildGroupPostSetData',
      'os.execute({ type: ... })',
      'os.raw.social, os.raw.http, os.raw.execute',
      'defaultBroadcast: gateway, relayer, or wallet',
    ],
    href: '/sdk/advanced-control',
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
    status: 'Unified client. Not on npm yet — this repo uses workspace:*',
    accent: 'blue',
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
