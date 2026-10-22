import {
  AppWindow,
  Building2,
  Database,
  FileText,
  Palette,
  Shield,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';

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
    | 'storage'
    | 'apps'
    | 'scarces';
  code: string;
}

export const playgroundExamples: ExampleSnippet[] = [
  {
    id: 'create-profile',
    title: 'Create a Profile',
    description: 'Set a name, bio, and tags, then read the profile',
    category: 'profile',
    code: `const accountId = wallet.accountId;

const result = await os.profiles.update({
  name: "Builder",
  bio: "Building on OnSocial.",
  tags: ["near", "sdk"]
});

const profile = await os.profiles.get(accountId);

console.log({ result, profile });`,
  },
  {
    id: 'create-post',
    title: 'Create a Post',
    description: 'Publish a post with text and tags',
    category: 'content',
    code: `const accountId = wallet.accountId;
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
    id: 'app-item-and-query',
    title: 'Set an App Item',
    description: 'Write under apps/<appId>, then query it',
    category: 'apps',
    code: `const accountId = wallet.accountId;
const appId = "my-app";
const itemId = Date.now().toString(36);
const path = \`apps/\${appId}/item/\${itemId}\`;

const result = await os.social.set({
  [path]: { title: "Ship the board", status: "planned" }
});

const item = await os.social.getOne(path, accountId);
const rows = await os.query.raw.byAppId(appId, { accountId, limit: 10 });

console.log({ result, item, rows });`,
  },
  {
    id: 'reply-to-post',
    title: 'Reply to a Post',
    description: 'Reply to a post, then read the reply back',
    category: 'content',
    code: `const accountId = wallet.accountId;
const parentPostId = "root_post";
const replyId = \`reply_\${Date.now().toString(36)}\`;

const result = await os.posts.reply(
  { author: accountId, postId: parentPostId },
  {
    text: "Replying from the OnSocial SDK.",
    tags: ["reply", "sdk"],
    access: "public"
  },
  replyId
);

const entry = await os.social.getOne(\`post/\${replyId}\`, accountId);

console.log({ result, entry });`,
  },
  {
    id: 'stand-with-user',
    title: 'Stand With a User',
    description: 'Record a stand with another account',
    category: 'social',
    code: `const accountId = wallet.accountId;
const userToStandWith = "test-user.testnet";

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
    code: `const accountId = wallet.accountId;
const postOwner = "test-user.testnet";
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
    code: `const groupId = \`builders_\${Date.now().toString(36)}\`;

const result = await os.groups.create(groupId, {
  v: 1,
  name: "Web3 Builders",
  description: "A testnet group for SDK builders",
  isPrivate: false,
  memberDriven: false,
  topics: ["web3", "near", "builders"]
});

const config = await os.groups.getConfig(groupId);

console.log({ result, groupId, config });`,
  },
  {
    id: 'add-group-member',
    title: 'Add Group Member',
    description: 'Add a member to a group',
    category: 'groups',
    code: `const groupId = "builders";
const memberId = "bob.testnet";

const result = await os.groups.addMember(groupId, memberId);
const member = await os.groups.getMember(groupId, memberId);

console.log({ result, groupId, memberId, member });`,
  },
  {
    id: 'post-to-group',
    title: 'Post to Group',
    description: 'Create a post in a group',
    category: 'groups',
    code: `const accountId = wallet.accountId;
const groupId = "builders";
const postId = Date.now().toString();

const result = await os.posts.groupPost(groupId, {
  text: "Check out this new NEAR feature!",
  tags: ["near", "update"]
}, postId);

const entry = await os.social.getOne(
  \`groups/\${groupId}/content/post/\${postId}\`,
  accountId
);

console.log({ result, entry });`,
  },
  {
    id: 'grant-permission',
    title: 'Grant a Permission',
    description: 'Grant write on a path, then read the level',
    category: 'permissions',
    code: `import { PERMISSION } from "@onsocial/sdk";

const accountId = wallet.accountId;
const grantee = "app.onsocial.testnet";
const path = "apps/my-app/";

const result = await os.permissions.grant(
  grantee,
  path,
  PERMISSION.WRITE
);
const level = await os.permissions.get(accountId, grantee, path);

console.log({ result, level });`,
  },
  {
    id: 'deposit-storage',
    title: 'Deposit Storage',
    description: 'Deposit storage, then read the balance',
    category: 'storage',
    code: `import { NEAR } from "@onsocial/sdk";

const accountId = wallet.accountId;
const result = await os.storageAccount.deposit(NEAR("0.1"));
const balance = await os.storageAccount.balance(accountId);

console.log({ result, balance });`,
  },
  {
    id: 'check-storage',
    title: 'Read Storage Balance',
    description: 'Read how much storage an account has',
    category: 'storage',
    code: `const accountId = wallet.accountId;

const balance = await os.storageAccount.balance(accountId);

console.log({ balance });`,
  },
  {
    id: 'get-profile',
    title: 'Read a Profile',
    description: 'Read the profile for an account',
    category: 'profile',
    code: `const accountId = wallet.accountId;

const profile = await os.profiles.get(accountId);

console.log({ profile });`,
  },
  {
    id: 'get-posts',
    title: 'Read Recent Posts',
    description: 'Read the latest posts for an account',
    category: 'content',
    code: `const accountId = wallet.accountId;

const feed = await os.query.feed.recent({ author: accountId, limit: 10 });

console.log({ feed });`,
  },
  {
    id: 'query-post-thread',
    title: 'Query Post Thread',
    description: 'Read a post and its thread',
    category: 'content',
    code: `const accountId = wallet.accountId;
const rootPostId = "root_post";

const [entry, thread] = await Promise.all([
  os.social.getOne(\`post/\${rootPostId}\`, accountId),
  os.query.threads.tree(accountId, rootPostId, {
    depth: 3,
    replyLimit: 20,
    quoteLimit: 20,
    includeQuotes: true
  })
]);

console.log({ entry, thread });`,
  },
  {
    id: 'get-group-info',
    title: 'Query Group Info',
    description: 'Read group views and indexed group activity',
    category: 'groups',
    code: `const groupId = "builders";

const [config, stats, feed, memberEvents] = await Promise.all([
  os.groups.getConfig(groupId),
  os.groups.getStats(groupId),
  os.query.groups.feed({ groupId, limit: 10 }),
  os.query.governance.members(groupId, { limit: 10 })
]);

console.log({ groupId, config, stats, feed, memberEvents });`,
  },
  {
    id: 'mint-scarce',
    title: 'Mint a Scarce',
    description: 'Mint a post as a scarce, then read the mint',
    category: 'scarces',
    code: `const accountId = wallet.accountId;
const postId = "root_post";

const result = await os.scarces.fromPost.mint({
  author: accountId,
  postId
});

const mints = await os.query.scarces.mintsBy(accountId, { limit: 5 });

console.log({ result, mints });`,
  },
];

export const categories: { id: string; name: string; icon: LucideIcon }[] = [
  { id: 'profile', name: 'Profile', icon: User },
  { id: 'content', name: 'Content', icon: FileText },
  { id: 'social', name: 'Social', icon: Users },
  { id: 'groups', name: 'Groups', icon: Building2 },
  { id: 'permissions', name: 'Permissions', icon: Shield },
  { id: 'storage', name: 'Storage', icon: Database },
  { id: 'apps', name: 'Apps', icon: AppWindow },
  { id: 'scarces', name: 'Scarces', icon: Palette },
];
