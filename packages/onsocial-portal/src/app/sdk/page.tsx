'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Boxes,
  CheckCircle2,
  Code2,
  Database,
  ExternalLink,
  GitBranch,
  Layers3,
  Package,
  Play,
  Route,
  ShieldCheck,
  Terminal,
  Wallet,
  Zap,
} from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { SectionHeader } from '@/components/layout/section-header';
import { PortalBadge } from '@/components/ui/portal-badge';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { portalColors, type PortalAccent } from '@/lib/portal-colors';

function accentCardStyle(accent: PortalAccent): CSSProperties {
  return {
    '--_accent-border': `color-mix(in srgb, ${portalColors[accent]} 35%, transparent)`,
    '--_accent-shadow': `color-mix(in srgb, ${portalColors[accent]} 20%, transparent)`,
  } as CSSProperties;
}

const modernInteractiveCardClass =
  'h-full overflow-hidden transition-[border-color,box-shadow] duration-200 [@media(hover:hover)]:hover:border-[var(--_accent-border)] [@media(hover:hover)]:hover:shadow-[0_0_20px_var(--_accent-shadow)]';

type DocStep = {
  label: string;
  title: string;
  body: string;
  code?: string;
  accent: PortalAccent;
  icon: LucideIcon;
};

type Decision = {
  choice: string;
  use: string;
  wallet: string;
  auth: string;
  method: string;
  accent: PortalAccent;
};

type BuildPath = {
  title: string;
  icon: LucideIcon;
  accent: PortalAccent;
  bestFor: string;
  steps: string[];
};

type Recipe = {
  title: string;
  methods: string[];
  badges: string[];
  note: string;
  accent: PortalAccent;
  href: string;
};

type MethodFamily = {
  title: string;
  icon: LucideIcon;
  accent: PortalAccent;
  summary: string;
  methods: string[];
  href: string;
};

const QUICKSTART_STEPS: DocStep[] = [
  {
    label: '01',
    title: 'Install the SDK',
    body: 'Start with the unified client. Use testnet while developing, then switch the network and endpoints for production.',
    code: 'pnpm add @onsocial/sdk',
    accent: 'blue',
    icon: Package,
  },
  {
    label: '02',
    title: 'Create a client',
    body: 'The same client holds auth, writes, direct reads, indexed queries, storage, groups, permissions, scarces, and rewards.',
    code: `import { OnSocial } from '@onsocial/sdk';

const os = new OnSocial({
  network: 'testnet',
  gatewayUrl: 'https://testnet.onsocial.id',
});`,
    accent: 'purple',
    icon: Code2,
  },
  {
    label: '03',
    title: 'Connect wallet and auth',
    body: 'Browser apps connect a NEAR wallet for user ownership, then attach OnAPI auth for compose, indexed query, and storage routes.',
    code: `const accountId = wallet.accountId;
const authToken = await getOnApiJwt(wallet, accountId);

os.auth.setToken(authToken);`,
    accent: 'green',
    icon: Wallet,
  },
  {
    label: '04',
    title: 'Write, read, then query',
    body: 'Use direct reads immediately after writes. Use indexed reads for feeds, history, search, and app surfaces after the indexer catches up.',
    code: `const postId = Date.now().toString();

const result = await os.posts.create({ text: 'gm OnSocial' }, postId);

const fresh = await os.social.getOne(\`post/\${postId}\`, accountId);
const feed = await os.query.feed.recent({ author: accountId });`,
    accent: 'amber',
    icon: Database,
  },
];

const DECISIONS: Decision[] = [
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
    accent: 'amber',
  },
  {
    choice: 'Backend/API key flow',
    use: 'Server jobs, partner rewards, admin lanes, and private infrastructure.',
    wallet: 'No user wallet',
    auth: 'API key',
    method: 'os.rewards.credit, os.query.graphql, direct service calls',
    accent: 'slate',
  },
];

const BUILD_PATHS: BuildPath[] = [
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
    accent: 'amber',
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

const BROWSER_STARTER_CODE = `import { OnSocial } from '@onsocial/sdk';

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

const PLAYGROUND_RECIPES: Recipe[] = [
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
    accent: 'amber',
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
    accent: 'slate',
    href: '/playground?example=check-storage',
  },
];

const METHOD_FAMILIES: MethodFamily[] = [
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
    accent: 'amber',
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
    accent: 'slate',
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

const PRODUCTION_CHECKS = [
  'Use direct reads after writes, then show indexed reads as eventually consistent.',
  'Use deterministic IDs for retryable writes such as posts, replies, and group setup.',
  'Batch related social paths when one user intent should be one transaction.',
  'Check storage balance before write-heavy flows and surface deposit actions clearly.',
  'Use grantOrPropose for member-driven group paths instead of forcing direct admin grants.',
  'Keep app data under clear account-owned or group content namespaces.',
  'Use API keys only on trusted servers, never in public browser code.',
];

const SDK_PACKAGES = [
  {
    name: '@onsocial/sdk',
    manager: 'pnpm',
    command: 'pnpm add @onsocial/sdk',
    status: 'Unified client',
    accent: 'blue' as PortalAccent,
  },
  {
    name: '@onsocial-id/rewards',
    manager: 'npm',
    command: 'npm install @onsocial-id/rewards',
    status: 'Partner package',
    href: 'https://www.npmjs.com/package/@onsocial-id/rewards',
    accent: 'green' as PortalAccent,
  },
];

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="mt-4 max-h-[18rem] overflow-x-auto rounded-[0.9rem] border border-border/35 bg-background/60 px-4 py-3 text-xs leading-6 text-foreground/85 md:text-sm">
      <code>{code}</code>
    </pre>
  );
}

function MethodList({ methods }: { methods: string[] }) {
  return (
    <ul className="mt-4 grid gap-2 text-sm text-muted-foreground">
      {methods.map((method) => (
        <li key={method} className="flex min-w-0 gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <span className="break-words font-mono text-xs leading-5 text-foreground/80 md:text-[13px]">
            {method}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function SDKPage() {
  return (
    <PageShell size="section" className="max-w-7xl">
      <SecondaryPageHeader
        badge="SDK Docs"
        badgeAccent="purple"
        glowAccents={['purple', 'blue', 'green']}
        title="Build OnSocial Apps From Wallet to Indexed Feeds"
        description="A practical map for choosing wallet, session, gateway, direct read, indexed query, batch, storage, permission, group, and economy flows without guessing."
      >
        <Link
          href="/playground"
          className="portal-action-link inline-flex items-center gap-2 text-sm font-medium"
        >
          <Play className="h-4 w-4" />
          Open playground
        </Link>
        <a
          href="https://github.com/OnSocial-Labs/onsocial-protocol"
          target="_blank"
          rel="noopener noreferrer"
          className="portal-action-link inline-flex items-center gap-2 text-sm font-medium"
        >
          <BookOpen className="h-4 w-4" />
          Source
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </SecondaryPageHeader>

      <motion.section
        id="start"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.05 }}
        className="mb-8"
      >
        <SectionHeader
          badge="Start Here"
          badgeAccent="blue"
          title="The shortest path to a real app"
          description="Follow this order first. It matches how the playground runs: connect identity, authenticate service routes, write protocol state, read fresh state, then query indexed app views."
        />
        <div className="grid gap-4 lg:grid-cols-4">
          {QUICKSTART_STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <SurfacePanel
                key={step.label}
                radius="xl"
                tone="soft"
                padding="roomy"
                className="min-w-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <PortalBadge accent={step.accent} size="sm">
                    {step.label}
                  </PortalBadge>
                  <Icon
                    className="h-5 w-5"
                    style={{ color: portalColors[step.accent] }}
                  />
                </div>
                <h2 className="mt-4 text-lg font-semibold tracking-[-0.02em]">
                  {step.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {step.body}
                </p>
                {step.code ? <CodeBlock code={step.code} /> : null}
              </SurfacePanel>
            );
          })}
        </div>
      </motion.section>

      <motion.section
        id="build-path"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}
        className="mb-8"
      >
        <SectionHeader
          badge="Build Path"
          badgeAccent="green"
          title="Choose the app shape first"
          description="A developer should know which path they are building before choosing methods. Most browser apps start with wallet broadcast, then add sessions or backend lanes only when the workflow needs them."
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {BUILD_PATHS.map((path) => {
            const Icon = path.icon;
            return (
              <SurfacePanel
                key={path.title}
                radius="xl"
                tone="soft"
                padding="roomy"
                className="min-w-0"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.9rem] border border-border/35 bg-background/50"
                    style={{ color: portalColors[path.accent] }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold tracking-[-0.02em]">
                      {path.title}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {path.bestFor}
                    </p>
                  </div>
                </div>
                <ul className="mt-4 grid gap-2 text-sm leading-6 text-muted-foreground">
                  {path.steps.map((step) => (
                    <li key={step} className="flex gap-2">
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-400" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </SurfacePanel>
            );
          })}
        </div>
        <SurfacePanel
          radius="xl"
          tone="subtle"
          padding="spacious"
          className="mt-4 min-w-0"
        >
          <SectionHeader
            badge="Browser Starter"
            badgeAccent="blue"
            title="Minimal wallet-connected flow"
            description="This is the concrete shape behind the playground: wallet connection, OnAPI JWT, SDK client, wallet broadcast, one write, direct read, indexed feed read."
            className="mb-0"
          />
          <CodeBlock code={BROWSER_STARTER_CODE} />
        </SurfacePanel>
      </motion.section>

      <motion.section
        id="choices"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.12 }}
        className="mb-8"
      >
        <SectionHeader
          badge="Choices"
          badgeAccent="green"
          title="Pick the right execution path"
          description="Most confusion comes from mixing these surfaces. Treat this as the decision table before choosing a method."
        />
        <div className="overflow-hidden rounded-[1.25rem] border border-border/45 bg-background/35">
          <div className="grid grid-cols-12 border-b border-border/35 bg-muted/20 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <div className="col-span-12 md:col-span-3">Choice</div>
            <div className="hidden md:col-span-3 md:block">Use for</div>
            <div className="hidden md:col-span-2 md:block">Wallet</div>
            <div className="hidden md:col-span-2 md:block">Auth</div>
            <div className="hidden md:col-span-2 md:block">Methods</div>
          </div>
          {DECISIONS.map((decision) => (
            <div
              key={decision.choice}
              className="grid grid-cols-12 gap-3 border-b border-border/25 px-4 py-4 last:border-b-0"
            >
              <div className="col-span-12 md:col-span-3">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: portalColors[decision.accent] }}
                  />
                  {decision.choice}
                </div>
              </div>
              <div className="col-span-12 text-sm leading-6 text-muted-foreground md:col-span-3">
                {decision.use}
              </div>
              <div className="col-span-6 text-sm text-foreground/80 md:col-span-2">
                {decision.wallet}
              </div>
              <div className="col-span-6 text-sm text-foreground/80 md:col-span-2">
                {decision.auth}
              </div>
              <div className="col-span-12 font-mono text-xs leading-5 text-foreground/80 md:col-span-2">
                {decision.method}
              </div>
            </div>
          ))}
        </div>
      </motion.section>

      <motion.section
        id="playground-recipes"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.15 }}
        className="mb-8"
      >
        <SectionHeader
          badge="Playground"
          badgeAccent="amber"
          title="Live recipes that teach the real API"
          description="The playground should stay recipe-first. Each example should show the method, whether it writes, how it reads back, and when the indexer may lag."
          aside={
            <Link
              href="/playground"
              className="portal-action-link inline-flex items-center gap-2 text-sm font-medium"
            >
              Try the examples
              <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PLAYGROUND_RECIPES.map((recipe) => (
            <Link
              key={recipe.title}
              href={recipe.href}
              className="group block min-w-0 rounded-[1.5rem] focus:outline-none focus:ring-2 focus:ring-ring/60"
            >
              <SurfacePanel
                radius="xl"
                tone="subtle"
                padding="roomy"
                interactive
                className={`${modernInteractiveCardClass} min-w-0`}
                style={accentCardStyle(recipe.accent)}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold tracking-[-0.02em]">
                    {recipe.title}
                  </h2>
                  <PortalBadge accent={recipe.accent} size="sm">
                    <span className="inline-flex items-center gap-1">
                      Open
                      <ArrowUpRight className="h-3 w-3 opacity-60 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
                    </span>
                  </PortalBadge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {recipe.badges.map((badge) => (
                    <span
                      key={badge}
                      className="rounded-full border border-border/35 bg-background/45 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
                <MethodList methods={recipe.methods} />
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  {recipe.note}
                </p>
              </SurfacePanel>
            </Link>
          ))}
        </div>
      </motion.section>

      <motion.section
        id="methods"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.2 }}
        className="mb-8"
      >
        <SectionHeader
          badge="Methods"
          badgeAccent="purple"
          title="SDK method families"
          description="Use the noun modules first. Drop down to raw social data, builders, or execute only when your app needs composition the higher-level methods do not express yet."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {METHOD_FAMILIES.map((family) => {
            const Icon = family.icon;
            const familyId = family.href.split('/').pop();
            return (
              <Link
                key={family.title}
                href={family.href}
                className="group block min-w-0 rounded-[1.5rem] focus:outline-none focus:ring-2 focus:ring-ring/60"
              >
                <SurfacePanel
                  id={familyId}
                  radius="xl"
                  tone="soft"
                  padding="roomy"
                  interactive
                  className={`${modernInteractiveCardClass} scroll-mt-24 min-w-0`}
                  style={accentCardStyle(family.accent)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.9rem] border border-border/35 bg-background/50"
                      style={{ color: portalColors[family.accent] }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h2 className="text-lg font-semibold tracking-[-0.02em]">
                          {family.title}
                        </h2>
                        <PortalBadge accent={family.accent} size="sm">
                          <span className="inline-flex items-center gap-1">
                            Guide
                            <ArrowUpRight className="h-3 w-3 opacity-60 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
                          </span>
                        </PortalBadge>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {family.summary}
                      </p>
                    </div>
                  </div>
                  <MethodList methods={family.methods} />
                </SurfacePanel>
              </Link>
            );
          })}
        </div>
      </motion.section>

      <motion.section
        id="batching"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.25 }}
        className="mb-8 grid gap-4 lg:grid-cols-[1fr_1fr]"
      >
        <SurfacePanel
          radius="xl"
          tone="soft"
          padding="spacious"
          className="min-w-0"
        >
          <SectionHeader
            badge="Batching"
            badgeAccent="amber"
            title="One intent, one transaction"
            description="Use high-level methods for ordinary app code. Use builders plus os.social.set when a single user intent needs multiple canonical paths written atomically."
            className="mb-0"
          />
          <CodeBlock
            code={`import { buildPostSetData, buildReplySetData } from '@onsocial/sdk';

await os.social.set({
  ...buildPostSetData(rootPost, rootPostId),
  ...buildReplySetData(accountId, rootPostId, reply, replyId),
});`}
          />
        </SurfacePanel>

        <SurfacePanel
          radius="xl"
          tone="subtle"
          padding="spacious"
          className="min-w-0"
        >
          <SectionHeader
            badge="Production"
            badgeAccent="green"
            title="Ship checklist"
            description="These rules keep custom apps predictable once users, storage, indexer lag, permissions, and retries enter the picture."
            className="mb-0"
          />
          <ul className="mt-5 grid gap-3 text-sm leading-6 text-muted-foreground">
            {PRODUCTION_CHECKS.map((item) => (
              <li key={item} className="flex gap-3">
                <Zap className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </SurfacePanel>
      </motion.section>

      <motion.section
        id="packages"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.3 }}
        className="mb-8"
      >
        <SectionHeader
          badge="Packages"
          badgeAccent="slate"
          title="Installable surfaces"
          description="Use the unified SDK for protocol apps. The rewards package remains available for partner integrations that only need rewards."
        />
        <div className="grid gap-4 md:grid-cols-2">
          {SDK_PACKAGES.map((pkg) => (
            <SurfacePanel
              key={pkg.name}
              radius="xl"
              tone="soft"
              padding="roomy"
              className="min-w-0"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <Terminal
                      className="h-5 w-5 shrink-0"
                      style={{ color: portalColors[pkg.accent] }}
                    />
                    <div className="min-w-0">
                      <div className="break-words font-mono text-base font-semibold text-foreground md:text-lg">
                        {pkg.name}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {pkg.status}
                      </div>
                    </div>
                  </div>
                  <CodeBlock code={pkg.command} />
                </div>
                {pkg.href ? (
                  <a
                    href={pkg.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="portal-action-link inline-flex items-center gap-2 text-sm font-medium md:mt-1"
                  >
                    View package
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>
            </SurfacePanel>
          ))}
        </div>
      </motion.section>
    </PageShell>
  );
}
