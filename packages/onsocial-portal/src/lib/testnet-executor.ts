import {
  buildPostSetData,
  buildReplySetData,
  NEAR,
  PERMISSION,
} from '@onsocial/sdk';
import type {
  MaterialisedProfile,
  RelayResponse,
  PermissionLevel,
  TransactionSigner,
  WalletBroadcastSigner,
} from '@onsocial/sdk';
import { createPortalOnSocialClient } from './onsocial-client';
import {
  ACTIVE_API_URL,
  ACTIVE_NEAR_NETWORK,
  type PortalNearNetwork,
} from './portal-config';

export interface ExecutionResult {
  success: boolean;
  output: string;
  txHash?: string;
  txHashes?: string[];
  error?: string;
  actionLabel?: string;
}

interface PlaygroundWallet {
  getAccounts?(data?: {
    network?: PortalNearNetwork;
  }): Promise<Array<{ accountId: string }>>;
  signAndSendTransaction(args: {
    network?: PortalNearNetwork;
    signerId?: string;
    receiverId: string;
    actions: Array<{
      type: 'FunctionCall';
      params: {
        methodName: string;
        args: Record<string, unknown>;
        gas: string;
        deposit: string;
      };
    }>;
  }): Promise<unknown>;
}

interface ReadbackResult {
  label: string;
  ok: boolean;
  value?: unknown;
  error?: string;
}

interface PlaygroundGroupResult {
  groupId: string;
  setupResponse?: RelayResponse;
}

const DEFAULT_STORAGE_DEPOSIT = NEAR('0.01');
const STORAGE_TOP_UP_AMOUNT = NEAR('0.1');
const PLAYGROUND_GATEWAY_URL = ACTIVE_API_URL;

const READ_ONLY_EXAMPLES = new Set([
  'check-permission',
  'check-storage',
  'get-profile',
  'get-posts',
  'query-post-thread',
  'get-group-info',
]);

const GATEWAY_AUTH_EXAMPLES = new Set([
  'create-profile',
  'create-post',
  'reply-to-post',
  'stand-with-user',
  'react-to-post',
  'post-to-group',
  'get-profile',
  'get-posts',
  'query-post-thread',
  'get-group-info',
]);

export function isReadOnlyPlaygroundExample(exampleId: string): boolean {
  return READ_ONLY_EXAMPLES.has(exampleId);
}

export function requiresGatewayAuthForPlaygroundExample(
  exampleId: string
): boolean {
  return GATEWAY_AUTH_EXAMPLES.has(exampleId);
}

export async function executeOnPortalNetwork(
  code: string,
  accountId: string,
  wallet?: PlaygroundWallet | null,
  exampleId?: string,
  authToken?: string | null
): Promise<ExecutionResult> {
  const id = exampleId ?? inferExampleId(code);

  try {
    const os = createPlaygroundClient(wallet, accountId, authToken);

    switch (id) {
      case 'create-profile':
        requireWallet(wallet);
        return await executeSetProfile(os, accountId);
      case 'create-post':
        requireWallet(wallet);
        return await executeCreatePost(os, accountId);
      case 'reply-to-post':
        requireWallet(wallet);
        return await executeReplyToPost(os, accountId);
      case 'stand-with-user':
        requireWallet(wallet);
        return await executeStandWith(os, accountId);
      case 'react-to-post':
        requireWallet(wallet);
        return await executeReaction(os, accountId);
      case 'create-group':
        requireWallet(wallet);
        return await executeCreateGroup(os, accountId);
      case 'add-group-member':
        requireWallet(wallet);
        return await executeAddGroupMember(os, accountId);
      case 'post-to-group':
        requireWallet(wallet);
        return await executeGroupPost(os, accountId);
      case 'grant-permission':
        requireWallet(wallet);
        return await executeGrantPermission(
          os,
          accountId,
          playgroundPermissionGrantee(accountId),
          playgroundPermissionPath('write'),
          PERMISSION.WRITE
        );
      case 'revoke-permission':
        requireWallet(wallet);
        return await executeRevokePermission(
          os,
          accountId,
          playgroundPermissionPath('write'),
          PERMISSION.WRITE
        );
      case 'grant-moderate-permission':
        requireWallet(wallet);
        return await executeGrantPermission(
          os,
          accountId,
          playgroundPermissionGrantee(accountId),
          playgroundPermissionPath('moderate'),
          PERMISSION.MODERATE
        );
      case 'revoke-moderate-permission':
        requireWallet(wallet);
        return await executeRevokePermission(
          os,
          accountId,
          playgroundPermissionPath('moderate'),
          PERMISSION.MODERATE
        );
      case 'deposit-storage':
        requireWallet(wallet);
        return await executeStorageDeposit(os, accountId);
      case 'check-permission':
        return await executeCheckPermission(os, accountId);
      case 'check-storage':
        return await executeCheckStorage(os, accountId);
      case 'get-profile':
        return await executeGetProfile(os, accountId);
      case 'get-posts':
        return await executeGetPosts(os, accountId);
      case 'query-post-thread':
        return await executeQueryPostThread(os, accountId);
      case 'get-group-info':
        return await executeGetGroupInfo(os, accountId);
      default:
        return {
          success: false,
          output: `⚠️ This snippet is written with the OnSocial SDK, but the live runner does not know which SDK flow to execute yet. Select one of the bundled examples to run it on ${ACTIVE_NEAR_NETWORK}.`,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      output: `❌ Execution failed:\n\n${message}`,
      error: message,
    };
  }
}

export const executeOnTestnet = executeOnPortalNetwork;

function createPlaygroundClient(
  wallet?: PlaygroundWallet | null,
  accountId?: string,
  authToken?: string | null
) {
  const signer =
    wallet && accountId ? createWalletSigner(wallet, accountId) : undefined;

  const os = createPortalOnSocialClient({
    network: ACTIVE_NEAR_NETWORK,
    gatewayUrl: PLAYGROUND_GATEWAY_URL,
    signer:
      wallet && accountId ? createDepositSigner(wallet, accountId) : undefined,
    defaultBroadcast: signer
      ? {
          kind: 'wallet',
          signer,
          gas: '300000000000000',
          deposit: DEFAULT_STORAGE_DEPOSIT,
        }
      : undefined,
  });

  if (authToken) {
    os.auth.setToken(authToken);
  }

  return os;
}

async function getVerifiedPlaygroundSignerId(
  wallet: PlaygroundWallet,
  accountId: string
): Promise<string> {
  const accounts =
    (await wallet.getAccounts?.({ network: ACTIVE_NEAR_NETWORK })) ?? [];
  const accountIds = accounts.map((account) => account.accountId);

  if (accountIds.length > 0 && !accountIds.includes(accountId)) {
    throw new Error(
      `Wallet account mismatch. Portal is connected as ${accountId}, but the wallet is using ${accountIds.join(', ')}. Switch the wallet account or reconnect before signing.`
    );
  }

  return accountId;
}

function createWalletSigner(
  wallet: PlaygroundWallet,
  accountId: string
): WalletBroadcastSigner {
  return async ({ receiverId, actions }) => {
    const signerId = await getVerifiedPlaygroundSignerId(wallet, accountId);
    const result = await wallet.signAndSendTransaction({
      network: ACTIVE_NEAR_NETWORK,
      signerId,
      receiverId,
      actions: actions.map((action) => ({
        type: 'FunctionCall' as const,
        params: {
          methodName: action.methodName,
          args: action.args,
          gas: action.gas,
          deposit: action.deposit,
        },
      })),
    });

    const txHash = extractTxHash(result);
    return txHash ? { txHash, raw: result } : { raw: result };
  };
}

function createDepositSigner(
  wallet: PlaygroundWallet,
  accountId: string
): TransactionSigner {
  return {
    async signAndSendTransaction({
      receiverId,
      methodName,
      args,
      gas,
      deposit,
    }) {
      const signerId = await getVerifiedPlaygroundSignerId(wallet, accountId);
      const result = await wallet.signAndSendTransaction({
        network: ACTIVE_NEAR_NETWORK,
        signerId,
        receiverId,
        actions: [
          {
            type: 'FunctionCall',
            params: {
              methodName,
              args,
              gas,
              deposit,
            },
          },
        ],
      });

      const txHash = extractTxHash(result);
      return txHash ? { txHash, raw: result } : { raw: result };
    },
  };
}

function requireWallet(
  wallet?: PlaygroundWallet | null
): asserts wallet is PlaygroundWallet {
  if (!wallet) {
    throw new Error(
      `Connect a ${ACTIVE_NEAR_NETWORK} wallet before running write examples.`
    );
  }
}

function inferExampleId(code: string): string {
  if (code.includes('os.profiles.update')) return 'create-profile';
  if (code.includes('os.posts.reply')) return 'reply-to-post';
  if (code.includes('os.posts.create')) return 'create-post';
  if (code.includes('os.standings.add')) return 'stand-with-user';
  if (code.includes('os.reactions.add')) return 'react-to-post';
  if (code.includes('os.groups.addMember')) return 'add-group-member';
  if (code.includes('os.posts.groupPost')) return 'post-to-group';
  if (code.includes('os.groups.create')) return 'create-group';
  if (code.includes('os.permissions.revoke')) {
    return code.includes('playground/permissions/moderate/')
      ? 'revoke-moderate-permission'
      : 'revoke-permission';
  }
  if (code.includes('os.permissions.grant')) {
    return code.includes('PERMISSION.MODERATE') ||
      code.includes('playground/permissions/moderate/')
      ? 'grant-moderate-permission'
      : 'grant-permission';
  }
  if (code.includes('os.permissions.has')) return 'check-permission';
  if (code.includes('os.storageAccount.deposit')) return 'deposit-storage';
  if (code.includes('os.storageAccount.balance')) return 'check-storage';
  if (code.includes('os.profiles.get')) return 'get-profile';
  if (
    code.includes('os.query.feed.recent') ||
    code.includes('os.social.listKeys')
  ) {
    return 'get-posts';
  }
  if (
    code.includes('os.query.threads.tree') ||
    code.includes('os.query.threads.replies') ||
    code.includes('os.query.threads.repliesByPath') ||
    code.includes('os.query.threads.quotes') ||
    code.includes('os.query.threads.quotesByPath')
  ) {
    return 'query-post-thread';
  }
  if (
    code.includes('os.query.groups.feed') ||
    code.includes('os.query.governance.members') ||
    code.includes('os.groups.getConfig')
  ) {
    return 'get-group-info';
  }
  return 'unknown';
}

async function executeSetProfile(
  os: ReturnType<typeof createPlaygroundClient>,
  accountId: string
) {
  const handle = playgroundProfileHandle(accountId);
  const response = await os.profiles.update({
    name: `Playground ${handle}`,
    bio: `Testing the OnSocial SDK on ${ACTIVE_NEAR_NETWORK} as ${accountId}.`,
    tags: ['playground', 'sdk', ACTIVE_NEAR_NETWORK],
  });

  const readback = await readbackWithOs('profile fields', async () =>
    os.social.get(
      ['profile/v', 'profile/name', 'profile/bio', 'profile/tags'],
      accountId
    )
  );

  return writeResult(
    'Profile update',
    [response],
    [
      `SDK method: os.profiles.update`,
      `Account: ${accountId}`,
      `Public paths written: profile/v, profile/name, profile/bio, profile/tags`,
      `Readback: os.social.get([...], accountId)`,
      `Profile name: Playground ${handle}`,
    ],
    readback
  );
}

function playgroundProfileHandle(accountId: string): string {
  return (
    accountId
      .replace(/\.(testnet|near)$/, '')
      .replace(/[^a-z0-9_-]/gi, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || 'builder'
  );
}

function playgroundTargetAccount(): string {
  return ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'onsocial.near'
    : 'test-user.testnet';
}

async function executeCreatePost(
  os: ReturnType<typeof createPlaygroundClient>,
  accountId: string
) {
  const postId = Date.now().toString();
  const response = await os.posts.create(
    {
      text: 'Hello OnSocial! Building the future of Web3 social media',
      access: 'public',
      tags: ['web3', 'social', 'near'],
    },
    postId
  );

  const readback = await readbackWithOs('post entry', async () =>
    os.social.getOne(`post/${postId}`, accountId)
  );

  return writeResult(
    'Post creation',
    [response],
    [
      `SDK method: os.posts.create`,
      `Account: ${accountId}`,
      `Post ID: ${postId}`,
      `Readback: os.social.getOne("post/${postId}", accountId)`,
    ],
    readback
  );
}

async function executeReplyToPost(
  os: ReturnType<typeof createPlaygroundClient>,
  accountId: string
) {
  const rootPostId = playgroundThreadRootPostId();
  const replyId = `reply_${Date.now().toString(36)}`;
  const now = Date.now();
  const response = await os.social.set({
    ...buildPostSetData(
      {
        text: 'Playground thread root for reply examples.',
        access: 'public',
        tags: ['playground', 'thread'],
      },
      rootPostId,
      now
    ),
    ...buildReplySetData(
      accountId,
      rootPostId,
      {
        text: 'Replying from the OnSocial SDK playground.',
        access: 'public',
        tags: ['reply', 'sdk'],
      },
      replyId,
      now + 1
    ),
  });

  const readback = await readbackWithOs(
    'reply entry and thread query',
    async () => {
      const [rootEntry, replyEntry, indexed] = await Promise.all([
        os.social.getOne(`post/${rootPostId}`, accountId),
        os.social.getOne(`post/${replyId}`, accountId),
        readIndexedThreadReplies(os, accountId, rootPostId, replyId),
      ]);

      return {
        root: { postId: rootPostId, entry: rootEntry },
        reply: { postId: replyId, entry: replyEntry },
        indexed,
      };
    }
  );

  return writeResult(
    'Post reply',
    [response],
    [
      `SDK method: os.social.set`,
      `Account: ${accountId}`,
      `Root post ID: ${rootPostId}`,
      `Reply ID: ${replyId}`,
      'Mode: batched root + reply set',
      `Readback: os.social.getOne + os.query.threads.replies`,
    ],
    readback
  );
}

async function executeStandWith(
  os: ReturnType<typeof createPlaygroundClient>,
  accountId: string
) {
  const target = playgroundTargetAccount();
  const response = await os.standings.add(target);
  const readback = await readbackWithOs('standing entry', async () =>
    os.social.getOne(`standing/${target}`, accountId)
  );

  return writeResult(
    'Standing update',
    [response],
    [
      `SDK method: os.standings.add`,
      `You: ${accountId}`,
      `Standing with: ${target}`,
      `Readback: os.social.getOne("standing/${target}", accountId)`,
    ],
    readback
  );
}

async function executeReaction(
  os: ReturnType<typeof createPlaygroundClient>,
  accountId: string
) {
  const postOwner = playgroundTargetAccount();
  const postId = 'example_post_1';
  const reactionKind = 'like';
  const contentPath = `post/${postId}`;
  const response = await os.reactions.add(
    { author: postOwner, postId },
    reactionKind
  );
  const readback = await readbackWithOs('reaction entry', async () =>
    os.social.getOne(
      `reaction/${postOwner}/${reactionKind}/${contentPath}`,
      accountId
    )
  );

  return writeResult(
    'Reaction update',
    [response],
    [
      `SDK method: os.reactions.add`,
      `You: ${accountId}`,
      `Post: ${postOwner}/${contentPath}`,
      `Reaction: ${reactionKind}`,
      `Readback: os.social.getOne("reaction/${postOwner}/${reactionKind}/${contentPath}", accountId)`,
    ],
    readback
  );
}

async function executeCreateGroup(
  os: ReturnType<typeof createPlaygroundClient>,
  accountId: string
) {
  const groupId = `${playgroundGroupPrefix(accountId)}_${Date.now().toString(36)}`;
  const response = await os.groups.create(groupId, {
    v: 1,
    name: 'Web3 Builders',
    description: `A ${ACTIVE_NEAR_NETWORK} group for SDK builders`,
    isPrivate: false,
    memberDriven: false,
    tags: ['web3', 'near', 'builders'],
  });
  const readback = await readbackWithOs('group config', async () =>
    formatGroupConfigForPlayground(await os.groups.getConfig(groupId))
  );

  return writeResult(
    'Group creation',
    [response],
    [
      `SDK method: os.groups.create`,
      `Group ID: ${groupId}`,
      `Readback: os.groups.getConfig(groupId)`,
    ],
    readback
  );
}

async function executeAddGroupMember(
  os: ReturnType<typeof createPlaygroundClient>,
  accountId: string
) {
  const { groupId, setupResponse } = await ensurePlaygroundGroup(os, accountId);
  const memberId = playgroundMemberId(accountId);
  const response = await os.groups.addMember(groupId, memberId);
  const readback = await readbackWithOs('group member', async () => {
    const [member, isMember] = await Promise.all([
      os.groups.getMember(groupId, memberId),
      os.groups.isMember(groupId, memberId),
    ]);

    return { groupId, memberId, isMember, member };
  });

  return writeResult(
    'Group member add',
    compactResponses(setupResponse, response),
    [
      `SDK method: os.groups.addMember`,
      `Group ID: ${groupId}`,
      `Member: ${memberId}`,
      `Created group: ${setupResponse ? 'yes' : 'already existed'}`,
      `Readback: os.groups.getMember + os.groups.isMember`,
    ],
    readback
  );
}

async function executeGroupPost(
  os: ReturnType<typeof createPlaygroundClient>,
  accountId: string
) {
  const { groupId, setupResponse } = await ensurePlaygroundGroup(os, accountId);
  const postId = Date.now().toString();
  const response = await os.posts.groupPost(
    groupId,
    {
      text: 'Check out this new NEAR feature!',
      tags: ['near', 'update'],
    },
    postId
  );
  const directPath = `groups/${groupId}/content/post/${postId}`;
  const readback = await readbackWithOs(
    'group post entry and query',
    async () => {
      const directEntry = await os.social.getOne(directPath, accountId);
      const indexed = await readIndexedGroupPost(
        os,
        accountId,
        groupId,
        postId
      );

      return {
        groupId,
        postId,
        direct: {
          path: directPath,
          entry: directEntry,
        },
        indexed,
      };
    }
  );

  return writeResult(
    'Group post',
    compactResponses(setupResponse, response),
    [
      `SDK method: os.posts.groupPost`,
      `Group ID: ${groupId}`,
      `Post ID: ${postId}`,
      `Created group: ${setupResponse ? 'yes' : 'already existed'}`,
      `Readback: os.social.getOne + os.query.groups.post`,
    ],
    readback
  );
}

async function executeGrantPermission(
  os: ReturnType<typeof createPlaygroundClient>,
  accountId: string,
  grantee: string,
  path: string,
  level: PermissionLevel
) {
  const response = await os.permissions.grant(grantee, path, level);
  const readback = await readbackWithOs('permission level', async () =>
    os.permissions.get(accountId, grantee, path)
  );

  return writeResult(
    'Permission grant',
    [response],
    [
      `SDK method: os.permissions.grant`,
      `Owner: ${accountId}`,
      `Grantee: ${grantee}`,
      `Path: ${path}`,
      `Level: ${level}`,
      `Readback: os.permissions.get(owner, grantee, path)`,
    ],
    readback
  );
}

async function executeRevokePermission(
  os: ReturnType<typeof createPlaygroundClient>,
  accountId: string,
  path: string,
  requiredLevel: PermissionLevel
) {
  const grantee = playgroundPermissionGrantee(accountId);
  const response = await os.permissions.revoke(grantee, path);
  const readback = await readbackWithOs('permission state', async () => {
    const [hasPermission, currentLevel] = await Promise.all([
      os.permissions.has(accountId, grantee, path, requiredLevel),
      os.permissions.get(accountId, grantee, path),
    ]);

    return {
      owner: accountId,
      grantee,
      path,
      requiredLevel,
      currentLevel,
      hasPermission,
    };
  });

  return writeResult(
    'Permission revoke',
    [response],
    [
      `SDK method: os.permissions.revoke`,
      `Owner: ${accountId}`,
      `Grantee: ${grantee}`,
      `Path: ${path}`,
      `Readback: os.permissions.has + os.permissions.get`,
    ],
    readback
  );
}

async function executeStorageDeposit(
  os: ReturnType<typeof createPlaygroundClient>,
  accountId: string
) {
  const response = await os.storageAccount.deposit(STORAGE_TOP_UP_AMOUNT);
  const readback = await readbackWithOs('storage balance', async () =>
    os.storageAccount.balance(accountId)
  );

  return writeResult(
    'Storage deposit',
    [response],
    [
      `SDK method: os.storageAccount.deposit`,
      `Account: ${accountId}`,
      `Amount: 0.1 NEAR (${STORAGE_TOP_UP_AMOUNT} yoctoNEAR)`,
      `Readback: os.storageAccount.balance(accountId)`,
    ],
    readback
  );
}

async function executeCheckPermission(
  os: ReturnType<typeof createPlaygroundClient>,
  accountId: string
) {
  const grantee = playgroundPermissionGrantee(accountId);
  const writePath = playgroundPermissionPath('write');
  const moderatePath = playgroundPermissionPath('moderate');
  const [canWrite, writeLevel, canModerate, moderateLevel] = await Promise.all([
    os.permissions.has(accountId, grantee, writePath, PERMISSION.WRITE),
    os.permissions.get(accountId, grantee, writePath),
    os.permissions.has(accountId, grantee, moderatePath, PERMISSION.MODERATE),
    os.permissions.get(accountId, grantee, moderatePath),
  ]);
  return readResult('Permission check', {
    source: 'os.permissions.has + os.permissions.get',
    owner: accountId,
    grantee,
    levels: {
      WRITE: PERMISSION.WRITE,
      MODERATE: PERMISSION.MODERATE,
      MANAGE: PERMISSION.MANAGE,
    },
    checks: [
      {
        permission: 'WRITE',
        path: writePath,
        requiredLevel: PERMISSION.WRITE,
        currentLevel: writeLevel,
        hasPermission: canWrite,
      },
      {
        permission: 'MODERATE',
        path: moderatePath,
        requiredLevel: PERMISSION.MODERATE,
        currentLevel: moderateLevel,
        hasPermission: canModerate,
      },
    ],
  });
}

async function executeCheckStorage(
  os: ReturnType<typeof createPlaygroundClient>,
  accountId: string
) {
  const balance = await os.storageAccount.balance(accountId);
  return readResult('Storage balance', {
    source: 'os.storageAccount.balance',
    accountId,
    balance: balance ?? null,
  });
}

async function executeGetProfile(
  os: ReturnType<typeof createPlaygroundClient>,
  accountId: string
) {
  const profile = await os.profiles.get(accountId);
  return readResult('Profile read', {
    source: 'os.profiles.get',
    ...formatPlaygroundProfile(profile, accountId),
  });
}

async function executeGetPosts(
  os: ReturnType<typeof createPlaygroundClient>,
  accountId: string
) {
  const feed = await os.query.feed.recent({ author: accountId, limit: 10 });
  return readResult('Post query', {
    accountId,
    source: 'os.query.feed.recent',
    posts: feed.items,
    nextOffset: feed.nextOffset ?? null,
  });
}

async function executeQueryPostThread(
  os: ReturnType<typeof createPlaygroundClient>,
  accountId: string
) {
  const rootPostId = playgroundThreadRootPostId();
  const rootPath = `${accountId}/post/${rootPostId}`;
  const [rootEntry, thread] = await Promise.all([
    os.social.getOne(`post/${rootPostId}`, accountId),
    os.query.threads.tree(accountId, rootPostId, {
      depth: 3,
      replyLimit: 20,
      quoteLimit: 20,
      includeQuotes: true,
    }),
  ]);

  return readResult('Post thread query', {
    root: {
      path: rootPath,
      entry: rootEntry,
    },
    indexed: {
      source: 'os.query.threads.tree',
      thread,
    },
  });
}

async function executeGetGroupInfo(
  os: ReturnType<typeof createPlaygroundClient>,
  accountId: string
) {
  const groupId = playgroundGroupPrefix(accountId);
  const [config, stats, feed, memberEvents] = await Promise.all([
    os.groups.getConfig(groupId),
    os.groups.getStats(groupId),
    os.query.groups.feed({ groupId, limit: 10 }),
    os.query.governance.members(groupId, { limit: 10 }),
  ]);
  const groupConfig = formatGroupConfigForPlayground(config);
  const membershipEvents = memberEvents.map(formatMembershipEvent);

  return readResult('Group info query', {
    groupId,
    directViews: { config: groupConfig, stats },
    indexed: {
      recentPosts: feed.items,
      nextPostOffset: feed.nextOffset ?? null,
      membershipEvents,
    },
  });
}

async function ensurePlaygroundGroup(
  os: ReturnType<typeof createPlaygroundClient>,
  accountId: string
): Promise<PlaygroundGroupResult> {
  const groupId = playgroundGroupPrefix(accountId);
  const existing = await os.groups.getConfig(groupId);
  if (existing) return { groupId };

  const setupResponse = await os.groups.create(groupId, {
    v: 1,
    name: 'Playground Builders',
    description: `A reusable ${ACTIVE_NEAR_NETWORK} group for SDK playground examples.`,
    isPrivate: false,
    memberDriven: false,
    tags: ['playground', 'sdk'],
  });

  return { groupId, setupResponse };
}

function compactResponses(
  ...responses: Array<RelayResponse | undefined>
): RelayResponse[] {
  return responses.filter((response): response is RelayResponse =>
    Boolean(response)
  );
}

function playgroundGroupPrefix(accountId: string): string {
  const safe = accountId
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 44);
  return `playground_${safe || 'user'}`;
}

function playgroundPermissionPath(kind: 'write' | 'moderate'): string {
  return `playground/permissions/${kind}/`;
}

function playgroundPermissionGrantee(accountId: string): string {
  const grantee = `playground.${accountId}`;
  if (grantee.length > 64) {
    throw new Error(
      'Generated playground permission grantee is too long; edit the grantee before running this example.'
    );
  }
  return grantee;
}

async function readIndexedGroupPost(
  os: ReturnType<typeof createPlaygroundClient>,
  accountId: string,
  groupId: string,
  postId: string
) {
  try {
    const post = await os.query.groups.post({
      author: accountId,
      groupId,
      postId,
    });

    return {
      source: 'os.query.groups.post',
      status: post ? 'indexed' : 'pending_indexer',
      post,
    };
  } catch (error) {
    return {
      source: 'os.query.groups.post',
      status: 'query_unavailable',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readIndexedThreadReplies(
  os: ReturnType<typeof createPlaygroundClient>,
  accountId: string,
  rootPostId: string,
  replyId: string
) {
  try {
    const replies = await os.query.threads.replies(accountId, rootPostId, {
      limit: 10,
    });

    return {
      source: 'os.query.threads.replies',
      status: replies.some((post) => post.postId === replyId)
        ? 'indexed'
        : 'pending_indexer',
      replies,
    };
  } catch (error) {
    return {
      source: 'os.query.threads.replies',
      status: 'query_unavailable',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function playgroundThreadRootPostId(): string {
  return 'playground_thread_root';
}

function formatGroupConfigForPlayground(
  config: Record<string, unknown> | null
) {
  if (!config) return null;

  const memberDriven =
    config.member_driven === true || config.memberDriven === true;

  return {
    name: config.name,
    description: config.description,
    owner: config.owner,
    memberDriven,
    isPrivate: config.is_private ?? config.isPrivate,
    createdAt: config.created_at ?? config.createdAt,
    tags: config.tags,
    governanceActive: memberDriven,
    ...(memberDriven && {
      votingConfig: config.voting_config ?? config.votingConfig ?? null,
    }),
  };
}

function formatMembershipEvent(event: {
  operation?: unknown;
  author?: unknown;
  groupId?: unknown;
  memberId?: unknown;
  role?: unknown;
  level?: unknown;
  blockHeight?: unknown;
  blockTimestamp?: unknown;
}) {
  return {
    operation: event.operation,
    author: event.author,
    groupId: event.groupId,
    memberId: event.memberId,
    role: event.role,
    level: event.level,
    blockHeight: event.blockHeight,
    blockTimestamp: event.blockTimestamp,
  };
}

function playgroundMemberId(accountId: string): string {
  const memberId = `member.${accountId}`;
  if (memberId.length > 64) {
    throw new Error(
      'Generated playground member ID is too long; edit the member ID before running this example.'
    );
  }
  return memberId;
}

function formatPlaygroundProfile(
  profile: MaterialisedProfile | null,
  accountId: string
) {
  if (!profile) {
    return { accountId, profile: null };
  }

  const customFieldCount = Object.keys(profile.extra ?? {}).length;

  return {
    accountId: profile.accountId,
    ...(profile.v !== undefined && { v: profile.v }),
    ...(profile.name !== undefined && { name: profile.name }),
    ...(profile.bio !== undefined && { bio: profile.bio }),
    ...(profile.avatar !== undefined && { avatar: profile.avatar }),
    ...(profile.banner !== undefined && { banner: profile.banner }),
    ...(profile.links !== undefined && { links: profile.links }),
    ...(profile.tags !== undefined && { tags: profile.tags }),
    ...(profile.lastUpdatedHeight !== undefined && {
      lastUpdatedHeight: profile.lastUpdatedHeight,
    }),
    ...(profile.lastUpdatedAt !== undefined && {
      lastUpdatedAt: profile.lastUpdatedAt,
    }),
    ...(customFieldCount > 0 && { customFieldsHidden: customFieldCount }),
  };
}

async function readbackWithOs(
  label: string,
  read: () => Promise<unknown>
): Promise<ReadbackResult> {
  try {
    return { label, ok: true, value: await read() };
  } catch (error) {
    return {
      label,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function writeResult(
  label: string,
  responses: RelayResponse[],
  details: string[],
  readback: ReadbackResult
): ExecutionResult {
  const txHashes = responses.map(extractTxHash).filter(Boolean) as string[];
  const readbackText = readback.ok
    ? prettyJson(readback.value)
    : `Readback unavailable: ${readback.error}`;

  return {
    success: true,
    output: [
      `✅ ${label} completed with os.`,
      '',
      ...details,
      '',
      'Transaction:',
      txHashes.length > 0
        ? txHashes.map((hash) => `- ${hash}`).join('\n')
        : '- N/A',
      '',
      `SDK readback (${readback.label}):`,
      readbackText,
    ].join('\n'),
    txHash: txHashes[0],
    txHashes,
    actionLabel: label,
  };
}

function readResult(label: string, data: unknown): ExecutionResult {
  return {
    success: true,
    output: [`✅ ${label} completed with os.`, '', prettyJson(data)].join('\n'),
    actionLabel: label,
  };
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function extractTxHash(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  if (typeof obj.txHash === 'string') return obj.txHash;
  if (typeof obj.hash === 'string') return obj.hash;

  const transaction = obj.transaction;
  if (transaction && typeof transaction === 'object') {
    const hash = (transaction as Record<string, unknown>).hash;
    if (typeof hash === 'string') return hash;
  }

  const raw = obj.raw;
  if (raw && raw !== value) return extractTxHash(raw);

  return undefined;
}
