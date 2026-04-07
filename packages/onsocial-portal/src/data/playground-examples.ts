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
    title: 'Create User Profile',
    description: 'Set up a user profile with bio, avatar, and social links',
    category: 'profile',
    code: `// Create or update user profile
const accountId = "alice.near";

await contract.execute({
  request: {
    action: {
      type: "set",
      data: {
        "profile/name": "Alice Smith",
        "profile/bio": "Web3 developer | OnSocial enthusiast",
        "profile/avatar": "ipfs://QmRBk1234...",
        "profile/links": JSON.stringify({
          twitter: "https://twitter.com/alice",
          github: "https://github.com/alice"
        }),
        "profile/tags": JSON.stringify(["developer", "web3", "near"])
      }
    }
  }
}, { attachedDeposit: "10000000000000000000000" });

console.log("Profile created successfully!");`,
  },
  {
    id: 'create-post',
    title: 'Create a Post',
    description: 'Publish a post with text, media, and tags',
    category: 'content',
    code: `// Create a new post
const accountId = "alice.near";
const postId = Date.now().toString();

await contract.execute({
  request: {
    action: {
      type: "set",
      data: {
        [\`post/\${postId}\`]: JSON.stringify({
          text: "Hello OnSocial! Building the future of Web3 social media 🚀",
          media: ["ipfs://QmImage123..."],
          tags: ["web3", "social", "near"],
          access: "public",
          timestamp: Date.now()
        })
      }
    }
  }
}, { attachedDeposit: "10000000000000000000000" });

console.log("Post created successfully!");`,
  },
  {
    id: 'stand-with-user',
    title: 'Stand With a User',
    description: 'Stand with another user to see their content',
    category: 'social',
    code: `// Stand with a user
const accountId = "alice.near";
const userToStandWith = "bob.near";

await contract.execute({
  request: {
    action: {
      type: "set",
      data: {
        [\`standing/\${userToStandWith}\`]: JSON.stringify({ since: Date.now() })
      }
    }
  }
}, { attachedDeposit: "10000000000000000000000" });

console.log(\`Now standing with \${userToStandWith}!\`);`,
  },
  {
    id: 'react-to-post',
    title: 'React to a Post',
    description: 'React to content from another user',
    category: 'social',
    code: `// React to a post
const accountId = "alice.near";
const postOwner = "bob.near";
const postId = "1234567890";

await contract.execute({
  request: {
    action: {
      type: "set",
      data: {
        [\`reaction/\${postOwner}/post/\${postId}\`]: JSON.stringify({ type: "like" })
      }
    }
  }
}, { attachedDeposit: "10000000000000000000000" });

console.log("Reacted to post!");`,
  },
  {
    id: 'create-group',
    title: 'Create a Group',
    description: 'Create a community group with configuration',
    category: 'groups',
    code: `// Create a community group
const groupId = "web3-builders";
const accountId = "alice.near";

await contract.execute({
  request: {
    action: {
      type: "create_group",
      group_id: groupId,
      name: "Web3 Builders",
      is_public: true
    }
  }
}, { attachedDeposit: "50000000000000000000000" });

console.log("Group created successfully!");`,
  },
  {
    id: 'add-group-member',
    title: 'Add Group Member',
    description: 'Add a member to your group',
    category: 'groups',
    code: `// Add member to group
const groupId = "web3-builders";
const newMember = "charlie.near";

await contract.execute({
  request: {
    action: {
      type: "add_group_member",
      group_id: groupId,
      member_id: newMember,
      role: "member"
    }
  }
}, { attachedDeposit: "1" });

console.log(\`Added \${newMember} to group!\`);`,
  },
  {
    id: 'post-to-group',
    title: 'Post to Group',
    description: 'Create a post in a group',
    category: 'groups',
    code: `// Post to a group
const groupId = "web3-builders";
const accountId = "alice.near";
const postId = Date.now().toString();

await contract.execute({
  request: {
    action: {
      type: "set",
      data: {
        [\`post/\${postId}\`]: JSON.stringify({
          text: "Check out this new NEAR feature!",
          tags: ["near", "update"]
        })
      }
    },
    target_account: \`groups/\${groupId}\`
  }
}, { attachedDeposit: "10000000000000000000000" });

console.log("Posted to group!");`,
  },
  {
    id: 'grant-permission',
    title: 'Grant Write Permission',
    description: 'Allow another account to write on your behalf',
    category: 'permissions',
    code: `// Grant write permission to another account
const accountId = "alice.near";
const grantee = "app.near";

await contract.set_permission({
  permission_key: { AccountId: grantee },
  paths: [\`\${accountId}/content/*\`],
  is_write: true
});

console.log(\`Granted write permission to \${grantee}\`);`,
  },
  {
    id: 'grant-role',
    title: 'Grant Role-Based Permission',
    description: 'Assign predefined roles (viewer, editor, admin)',
    category: 'permissions',
    code: `// Grant a role (viewer, editor, or admin)
const accountId = "alice.near";
const grantee = "bob.near";
const role = "editor"; // viewer, editor, or admin

await contract.grant_role({
  permission_key: { AccountId: grantee },
  role,
  context: \`\${accountId}/\`
});

console.log(\`Granted \${role} role to \${grantee}\`);`,
  },
  {
    id: 'check-permission',
    title: 'Check Permission',
    description: 'Verify if an account has permission for a path',
    category: 'permissions',
    code: `// Check if account has permission
const owner = "alice.near";
const grantee = "bob.near";
const path = "alice.near/content/posts";
const WRITE_FLAG = 1;

const hasPermission = await contract.has_permission({
  owner,
  grantee,
  path,
  permission_flags: WRITE_FLAG
});

console.log(\`Has permission: \${hasPermission}\`);`,
  },
  {
    id: 'deposit-storage',
    title: 'Deposit Storage',
    description: 'Add storage deposit for your account',
    category: 'storage',
    code: `// Deposit storage for account
const depositAmount = "100000000000000000000000"; // 0.1 NEAR

await contract.execute({
  request: {
    action: {
      type: "set",
      data: {
        "storage/deposit": ""
      }
    },
    options: { refund_unused_deposit: true }
  }
}, { attachedDeposit: depositAmount });

console.log("Storage deposit successful!");`,
  },
  {
    id: 'check-storage',
    title: 'Check Storage Balance',
    description: 'View your account storage information',
    category: 'storage',
    code: `// Check storage balance
const accountId = "alice.near";

const storage = await contract.get_storage_balance({
  account_id: accountId
});

console.log("Storage info:", {
  total: storage.total,
  available: storage.available,
  used: storage.used
});`,
  },
  {
    id: 'get-profile',
    title: 'Get User Profile',
    description: 'Retrieve profile data for any user',
    category: 'profile',
    code: `// Get user profile
const accountId = "alice.near";

const data = await contract.get({
  keys: [\`\${accountId}/profile\`],
  account_id: accountId
});

console.log("Profile data:", data);`,
  },
  {
    id: 'get-posts',
    title: 'Get User Posts',
    description: 'Fetch all posts from a user',
    category: 'content',
    code: `// Get user posts
const accountId = "alice.near";

const data = await contract.get({
  // Note: get() is exact-key lookup only (no wildcards).
  // Use your indexer/SDK to discover keys, then fetch them in a batch.
  keys: [\`\${accountId}/posts/post1\`, \`\${accountId}/posts/post2\`],
  account_id: accountId
});

console.log("Posts:", data);`,
  },
  {
    id: 'get-group-info',
    title: 'Get Group Info',
    description: 'Retrieve group configuration and stats',
    category: 'groups',
    code: `// Get group information
const groupId = "web3-builders";

const config = await contract.get_group_config({
  group_id: groupId
});

const stats = await contract.get_group_stats({
  group_id: groupId
});

console.log("Group config:", config);
console.log("Group stats:", stats);`,
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
