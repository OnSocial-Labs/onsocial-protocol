export interface ExampleSnippet {
  id: string;
  title: string;
  description: string;
  category:
    | 'profile'
    | 'content'
    | 'social'
    | 'groups'
    | 'permissions'
    | 'storage';
  code: string;
}

export const playgroundExamples: ExampleSnippet[] = [
  {
    id: 'create-profile',
    title: 'Create Your Profile',
    description: 'Set up a profile scoped to the connected account',
    category: 'profile',
    code: `// The playground provides \`os\` and \`portalNetwork\`.
const accountId = wallet.accountId;
const network = portalNetwork;
const handle = accountId
  .replace(/\\.(testnet|near)$/, "")
  .replace(/[^a-z0-9_-]/gi, "_")
  .replace(/_+/g, "_")
  .replace(/^_+|_+$/g, "") || "builder";

const result = await os.profiles.update({
  name: "Playground " + handle,
  bio: "Testing the OnSocial SDK on " + network + " as " + accountId + ".",
  tags: ["playground", "sdk", network]
});

// These public profile paths are what the example writes and reads back.
const fields = await os.social.get(
  [
    "profile/v",
    "profile/name",
    "profile/bio",
    "profile/tags"
  ],
  accountId
);

console.log({ result, accountId, fields });`,
  },
  {
    id: 'create-post',
    title: 'Create a Post',
    description: 'Publish a post with text, media, and tags',
    category: 'content',
    code: `// Create a new post with the SDK
const accountId = wallet.accountId;
const postId = Date.now().toString();

const result = await os.posts.create({
  text: "Hello OnSocial! Building the future of Web3 social media",
  tags: ["web3", "social", "near"],
  access: "public"
}, postId);

const entry = await os.social.getOne(\`post/\${postId}\`, accountId);
console.log({ result, entry });`,
  },
  {
    id: 'reply-to-post',
    title: 'Reply to a Post',
    description: 'Create a reply and check the indexed thread view',
    category: 'content',
    code: `// Reply to a post
const accountId = wallet.accountId;
const rootPostId = "playground_thread_root";
const replyId = \`reply_\${Date.now().toString(36)}\`;
const now = Date.now();

const result = await os.social.set({
  [\`post/\${rootPostId}\`]: {
    v: 1,
    text: "Playground thread root for reply examples.",
    tags: ["playground", "thread"],
    access: "public",
    kind: "text",
    timestamp: now
  },
  [\`post/\${replyId}\`]: {
    v: 1,
    text: "Replying from the OnSocial SDK playground.",
    tags: ["reply", "sdk"],
    access: "public",
    kind: "text",
    parent: \`\${accountId}/post/\${rootPostId}\`,
    parentType: "post",
    timestamp: now + 1
  },
});

const [rootEntry, replyEntry] = await Promise.all([
  os.social.getOne(\`post/\${rootPostId}\`, accountId),
  os.social.getOne(\`post/\${replyId}\`, accountId)
]);
let indexedReplies = [];
let indexedStatus = "pending_indexer";

try {
  indexedReplies = await os.query.threads.replies(accountId, rootPostId, {
    limit: 10
  });
  indexedStatus = indexedReplies.some((post) => post.postId === replyId)
    ? "indexed"
    : "pending_indexer";
} catch (error) {
  indexedStatus = "query_unavailable";
}

console.log({
  result,
  mode: "batched root + reply set",
  root: { postId: rootPostId, entry: rootEntry },
  reply: { postId: replyId, entry: replyEntry },
  indexed: {
    source: "os.query.threads.replies",
    status: indexedStatus,
    replies: indexedReplies
  }
});`,
  },
  {
    id: 'stand-with-user',
    title: 'Stand With a User',
    description: 'Stand with another user to see their content',
    category: 'social',
    code: `// Stand with a user
const accountId = wallet.accountId;
const userToStandWith = portalNetwork === "mainnet"
  ? "onsocial.near"
  : "test-user.testnet";

const result = await os.standings.add(userToStandWith);
const standing = await os.social.getOne(
  \`standing/\${userToStandWith}\`,
  accountId
);

console.log({ result, standing });`,
  },
  {
    id: 'react-to-post',
    title: 'React to a Post',
    description: 'React to content from another user',
    category: 'social',
    code: `// React to a post
const accountId = wallet.accountId;
const postOwner = portalNetwork === "mainnet"
  ? "onsocial.near"
  : "test-user.testnet";
const postId = "example_post_1";
const reactionKind = "like";

const result = await os.reactions.add(
  { author: postOwner, postId },
  reactionKind
);
const reaction = await os.social.getOne(
  \`reaction/\${postOwner}/\${reactionKind}/post/\${postId}\`,
  accountId
);

console.log({ result, reaction });`,
  },
  {
    id: 'create-group',
    title: 'Create a Group',
    description: 'Create a community group with configuration',
    category: 'groups',
    code: `// Create a community group
const accountId = wallet.accountId;
const ownerSlug = accountId
  .toLowerCase()
  .replace(/[^a-z0-9_-]/g, "_")
  .replace(/_+/g, "_")
  .replace(/^_+|_+$/g, "")
  .slice(0, 44) || "user";
const groupId = \`playground_\${ownerSlug}_\${Date.now().toString(36)}\`;

const result = await os.groups.create(groupId, {
  v: 1,
  name: "Web3 Builders",
  description: "A " + portalNetwork + " group for SDK builders",
  isPrivate: false,
  memberDriven: false,
  tags: ["web3", "near", "builders"]
});

const config = await os.groups.getConfig(groupId);
const memberDriven = config?.member_driven === true || config?.memberDriven === true;
const visibleConfig = config
  ? {
      name: config.name,
      description: config.description,
      owner: config.owner,
      memberDriven,
      isPrivate: config.is_private ?? config.isPrivate,
      createdAt: config.created_at ?? config.createdAt,
      tags: config.tags,
      governanceActive: memberDriven,
      ...(memberDriven
        ? { votingConfig: config.voting_config ?? config.votingConfig ?? null }
        : {})
    }
  : null;

console.log({ result, groupId, config: visibleConfig });`,
  },
  {
    id: 'add-group-member',
    title: 'Add Group Member',
    description: 'Add a member to your group',
    category: 'groups',
    code: `// Add member to group
const accountId = wallet.accountId;
const ownerSlug = accountId
  .toLowerCase()
  .replace(/[^a-z0-9_-]/g, "_")
  .replace(/_+/g, "_")
  .replace(/^_+|_+$/g, "")
  .slice(0, 44) || "user";
const groupId = \`playground_\${ownerSlug}\`;
const playgroundMember = \`member.\${accountId}\`;
if (playgroundMember.length > 64) {
  throw new Error("Generated member ID is too long; edit newMember before running this example.");
}
const newMember = playgroundMember;

if (!(await os.groups.getConfig(groupId))) {
  await os.groups.create(groupId, {
    v: 1,
    name: "Playground Builders",
    description: "A reusable " + portalNetwork + " group for SDK playground examples.",
    isPrivate: false,
    memberDriven: false,
    tags: ["playground", "sdk"]
  });
}

const result = await os.groups.addMember(groupId, newMember);
const [member, isMember] = await Promise.all([
  os.groups.getMember(groupId, newMember),
  os.groups.isMember(groupId, newMember)
]);

console.log({ result, groupId, newMember, isMember, member });`,
  },
  {
    id: 'post-to-group',
    title: 'Post to Group',
    description: 'Create a post in a group',
    category: 'groups',
    code: `// Post to a group
const accountId = wallet.accountId;
const ownerSlug = accountId
  .toLowerCase()
  .replace(/[^a-z0-9_-]/g, "_")
  .replace(/_+/g, "_")
  .replace(/^_+|_+$/g, "")
  .slice(0, 44) || "user";
const groupId = \`playground_\${ownerSlug}\`;
const postId = Date.now().toString();

if (!(await os.groups.getConfig(groupId))) {
  await os.groups.create(groupId, {
    v: 1,
    name: "Playground Builders",
    description: "A reusable " + portalNetwork + " group for SDK playground examples.",
    isPrivate: false,
    memberDriven: false,
    tags: ["playground", "sdk"]
  });
}

const result = await os.posts.groupPost(groupId, {
  text: "Check out this new NEAR feature!",
  tags: ["near", "update"]
}, postId);

const directPath = \`groups/\${groupId}/content/post/\${postId}\`;
const directEntry = await os.social.getOne(directPath, accountId);
let indexedPost = null;
let indexedStatus = "pending_indexer";

try {
  indexedPost = await os.query.groups.post({
    author: accountId,
    groupId,
    postId
  });
  indexedStatus = indexedPost ? "indexed" : "pending_indexer";
} catch (error) {
  indexedStatus = "query_unavailable";
}

console.log({
  result,
  groupId,
  postId,
  direct: { path: directPath, entry: directEntry },
  indexed: {
    source: "os.query.groups.post",
    status: indexedStatus,
    post: indexedPost
  }
});`,
  },
  {
    id: 'grant-permission',
    title: 'Grant Demo Write Permission',
    description:
      'Practice a path-scoped write permission safely on your account',
    category: 'permissions',
    code: `// Grant a demo write permission to an account-owned playground namespace.
// For production delegation, replace grantee with your app account.
import { PERMISSION } from "@onsocial/sdk";

const accountId = wallet.accountId;
const playgroundGrantee = \`playground.\${accountId}\`;
if (playgroundGrantee.length > 64) {
  throw new Error("Generated grantee ID is too long; edit grantee before running this example.");
}
const grantee = playgroundGrantee;
const path = "playground/permissions/write/";

const result = await os.permissions.grant(
  grantee,
  path,
  PERMISSION.WRITE
);
const level = await os.permissions.get(accountId, grantee, path);

console.log({ result, level });`,
  },
  {
    id: 'revoke-permission',
    title: 'Revoke Demo Write Permission',
    description:
      'Remove the playground write permission grant from your account',
    category: 'permissions',
    code: `// Revoke the demo write permission.
import { PERMISSION } from "@onsocial/sdk";

const accountId = wallet.accountId;
const playgroundGrantee = \`playground.\${accountId}\`;
if (playgroundGrantee.length > 64) {
  throw new Error("Generated grantee ID is too long; edit grantee before running this example.");
}
const grantee = playgroundGrantee;
const path = "playground/permissions/write/";

const result = await os.permissions.revoke(grantee, path);
const [hasPermission, currentLevel] = await Promise.all([
  os.permissions.has(accountId, grantee, path, PERMISSION.WRITE),
  os.permissions.get(accountId, grantee, path)
]);

console.log({
  result,
  owner: accountId,
  grantee,
  path,
  requiredLevel: PERMISSION.WRITE,
  currentLevel,
  hasPermission
});`,
  },
  {
    id: 'grant-moderate-permission',
    title: 'Grant Demo Moderate Permission',
    description:
      'Practice the contract MODERATE permission level on a playground-only path',
    category: 'permissions',
    code: `// Grant the contract MODERATE permission level to an account-owned playground namespace.
// Apps may label this however they want, but the contract stores numeric levels.
import { PERMISSION } from "@onsocial/sdk";

const accountId = wallet.accountId;
const playgroundGrantee = \`playground.\${accountId}\`;
if (playgroundGrantee.length > 64) {
  throw new Error("Generated grantee ID is too long; edit grantee before running this example.");
}
const grantee = playgroundGrantee;
const path = "playground/permissions/moderate/";

const result = await os.permissions.grant(
  grantee,
  path,
  PERMISSION.MODERATE
);
const level = await os.permissions.get(accountId, grantee, path);

console.log({ result, level });`,
  },
  {
    id: 'revoke-moderate-permission',
    title: 'Revoke Demo Moderate Permission',
    description: 'Remove the playground MODERATE permission grant',
    category: 'permissions',
    code: `// Revoke the demo MODERATE permission.
import { PERMISSION } from "@onsocial/sdk";

const accountId = wallet.accountId;
const playgroundGrantee = \`playground.\${accountId}\`;
if (playgroundGrantee.length > 64) {
  throw new Error("Generated grantee ID is too long; edit grantee before running this example.");
}
const grantee = playgroundGrantee;
const path = "playground/permissions/moderate/";

const result = await os.permissions.revoke(grantee, path);
const [hasPermission, currentLevel] = await Promise.all([
  os.permissions.has(accountId, grantee, path, PERMISSION.MODERATE),
  os.permissions.get(accountId, grantee, path)
]);

console.log({
  result,
  owner: accountId,
  grantee,
  path,
  requiredLevel: PERMISSION.MODERATE,
  currentLevel,
  hasPermission
});`,
  },
  {
    id: 'check-permission',
    title: 'Check Permission Levels',
    description: 'Verify WRITE and MODERATE grants for playground paths',
    category: 'permissions',
    code: `// Check contract permission levels.
// WRITE, MODERATE, and MANAGE are numeric contract levels, not custom role names.
import { PERMISSION } from "@onsocial/sdk";

const owner = wallet?.accountId ?? (portalNetwork === "mainnet" ? "onsocial.near" : "onsocial.testnet");
const playgroundGrantee = \`playground.\${owner}\`;
if (playgroundGrantee.length > 64) {
  throw new Error("Generated grantee ID is too long; edit grantee before running this example.");
}
const grantee = playgroundGrantee;
const writePath = "playground/permissions/write/";
const moderatePath = "playground/permissions/moderate/";

const [canWrite, writeLevel, canModerate, moderateLevel] = await Promise.all([
  os.permissions.has(owner, grantee, writePath, PERMISSION.WRITE),
  os.permissions.get(owner, grantee, writePath),
  os.permissions.has(owner, grantee, moderatePath, PERMISSION.MODERATE),
  os.permissions.get(owner, grantee, moderatePath)
]);

console.log({
  owner,
  grantee,
  levels: {
    WRITE: PERMISSION.WRITE,
    MODERATE: PERMISSION.MODERATE,
    MANAGE: PERMISSION.MANAGE
  },
  checks: [
    {
      permission: "WRITE",
      path: writePath,
      requiredLevel: PERMISSION.WRITE,
      currentLevel: writeLevel,
      hasPermission: canWrite
    },
    {
      permission: "MODERATE",
      path: moderatePath,
      requiredLevel: PERMISSION.MODERATE,
      currentLevel: moderateLevel,
      hasPermission: canModerate
    }
  ]
});`,
  },
  {
    id: 'deposit-storage',
    title: 'Deposit Storage',
    description: 'Add storage deposit for your account',
    category: 'storage',
    code: `// Deposit storage for account
import { NEAR } from "@onsocial/sdk";

const accountId = wallet.accountId;
const result = await os.storageAccount.deposit(NEAR("0.1"));
const balance = await os.storageAccount.balance(accountId);

console.log({ result, balance });`,
  },
  {
    id: 'check-storage',
    title: 'Check Storage Balance',
    description: 'View your account storage information',
    category: 'storage',
    code: `// Check storage balance
const accountId = wallet?.accountId ?? (portalNetwork === "mainnet" ? "onsocial.near" : "onsocial.testnet");

const balance = await os.storageAccount.balance(accountId);

console.log({ balance });`,
  },
  {
    id: 'get-profile',
    title: 'Get User Profile',
    description: 'Retrieve profile data for any user',
    category: 'profile',
    code: `// Get user profile
const accountId = wallet?.accountId ?? (portalNetwork === "mainnet" ? "onsocial.near" : "onsocial.testnet");

const profile = await os.profiles.get(accountId);
const publicProfile = profile && {
  accountId: profile.accountId,
  name: profile.name,
  bio: profile.bio,
  avatar: profile.avatar,
  banner: profile.banner,
  links: profile.links,
  tags: profile.tags,
  customFieldsHidden: Object.keys(profile.extra ?? {}).length
};

console.log({ profile: publicProfile });`,
  },
  {
    id: 'get-posts',
    title: 'Query User Posts',
    description: 'Fetch indexed posts from a user with os.query',
    category: 'content',
    code: `// Query indexed user posts
const accountId = wallet?.accountId ?? (portalNetwork === "mainnet" ? "onsocial.near" : "onsocial.testnet");

const feed = await os.query.feed.recent({ author: accountId, limit: 10 });

console.log({
  accountId,
  source: "os.query.feed.recent",
  posts: feed.items,
  nextOffset: feed.nextOffset ?? null
});`,
  },
  {
    id: 'query-post-thread',
    title: 'Query Post Thread',
    description: 'Fetch replies and quotes for a post from the indexer',
    category: 'content',
    code: `// Query a post thread
const accountId = wallet?.accountId ?? (portalNetwork === "mainnet" ? "onsocial.near" : "onsocial.testnet");
const rootPostId = "playground_thread_root";
const rootPath = \`\${accountId}/post/\${rootPostId}\`;

const [rootEntry, thread] = await Promise.all([
  os.social.getOne(\`post/\${rootPostId}\`, accountId),
  os.query.threads.tree(accountId, rootPostId, {
    depth: 3,
    replyLimit: 20,
    quoteLimit: 20,
    includeQuotes: true
  })
]);

console.log({
  root: {
    path: rootPath,
    entry: rootEntry
  },
  indexed: {
    source: "os.query.threads.tree",
    thread
  }
});`,
  },
  {
    id: 'get-group-info',
    title: 'Query Group Info',
    description: 'Read group views and indexed group activity',
    category: 'groups',
    code: `// Query group information
const accountId = wallet?.accountId ?? (portalNetwork === "mainnet" ? "onsocial.near" : "onsocial.testnet");
const ownerSlug = accountId
  .toLowerCase()
  .replace(/[^a-z0-9_-]/g, "_")
  .replace(/_+/g, "_")
  .replace(/^_+|_+$/g, "")
  .slice(0, 44) || "user";
const groupId = \`playground_\${ownerSlug}\`;

const [config, stats, feed, memberEvents] = await Promise.all([
  os.groups.getConfig(groupId),
  os.groups.getStats(groupId),
  os.query.groups.feed({ groupId, limit: 10 }),
  os.query.governance.members(groupId, { limit: 10 })
]);
const memberDriven = config?.member_driven === true || config?.memberDriven === true;
const visibleConfig = config
  ? {
      name: config.name,
      description: config.description,
      owner: config.owner,
      memberDriven,
      isPrivate: config.is_private ?? config.isPrivate,
      createdAt: config.created_at ?? config.createdAt,
      tags: config.tags,
      governanceActive: memberDriven,
      ...(memberDriven
        ? { votingConfig: config.voting_config ?? config.votingConfig ?? null }
        : {})
    }
  : null;
const membershipEvents = memberEvents.map((event) => ({
  operation: event.operation,
  author: event.author,
  groupId: event.groupId,
  memberId: event.memberId,
  role: event.role,
  level: event.level,
  blockHeight: event.blockHeight,
  blockTimestamp: event.blockTimestamp
}));

console.log({
  groupId,
  directViews: { config: visibleConfig, stats },
  indexed: {
    recentPosts: feed.items,
    nextPostOffset: feed.nextOffset ?? null,
    membershipEvents
  }
});`,
  },
];

import {
  User,
  FileText,
  Users,
  Building2,
  Shield,
  Database,
  LucideIcon,
} from 'lucide-react';

export const categories: { id: string; name: string; icon: LucideIcon }[] = [
  { id: 'profile', name: 'Profile', icon: User },
  { id: 'content', name: 'Content', icon: FileText },
  { id: 'social', name: 'Social', icon: Users },
  { id: 'groups', name: 'Groups', icon: Building2 },
  { id: 'permissions', name: 'Permissions', icon: Shield },
  { id: 'storage', name: 'Storage', icon: Database },
];
