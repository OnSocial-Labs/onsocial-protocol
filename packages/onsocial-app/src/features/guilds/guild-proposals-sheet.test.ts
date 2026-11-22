// @ts-nocheck
import { createElement, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';

const proposalsLoad = vi.hoisted(() => ({
  resolve: null as null | ((rows: unknown[]) => void),
}));

const access = vi.hoisted(() => ({
  immediateProposals: false,
  proposals: [] as unknown[],
  onMembership: (_groupId: string, _accountId: string) =>
    Promise.resolve(null) as Promise<unknown>,
}));

const wallet = vi.hoisted(() => ({
  accountId: null as string | null,
}));

vi.mock('@/contexts/app-transaction-feedback-context', () => ({
  useAppTransactionFeedback: () => ({
    trackTransaction: vi.fn(),
    setTxResult: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-post-author-profiles', async () => {
  const actual = await vi.importActual<
    typeof import('@/hooks/use-post-author-profiles')
  >('@/hooks/use-post-author-profiles');
  return {
    ...actual,
    usePostAuthorProfiles: () => ({}),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push() {},
    replace() {},
    back() {},
    prefetch() {},
  }),
  usePathname: () => '/groups/dao.testnet',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/contexts/app-wallet-context', () => ({
  useAppWallet: () => ({
    accountId: wallet.accountId,
    isConnected: Boolean(wallet.accountId),
    isLoading: false,
    connect: async () => {},
    getSigningWallet: async () => {
      throw new Error('no wallet');
    },
  }),
}));

vi.mock('@/lib/create-readonly-onsocial-client', () => ({
  createReadOnlyOnSocialClient: () => ({
    query: {
      groups: {
        membershipFor: (groupId: string, accountId: string) =>
          access.onMembership(groupId, accountId),
        byIds: async () => [],
        feed: async () => ({ items: [] }),
        membersOf: async () => ({ items: [] }),
        memberCountsFor: async () => new Map(),
        postCountFor: async () => 0,
      },
    },
    groups: {
      listProposals: () =>
        access.immediateProposals
          ? Promise.resolve(access.proposals)
          : new Promise((resolve) => {
              proposalsLoad.resolve = resolve;
            }),
      getProposal: () => Promise.resolve(null),
      getProposalTally: () => Promise.resolve(null),
      getVote: () => Promise.resolve(null),
      getConfig: async () => null,
      getJoinRequest: async () => null,
      isOwner: async () => false,
      isAdmin: async () => false,
      canModerate: async () => false,
      isMember: async () => false,
      isBlacklisted: async () => false,
    },
  }),
}));

vi.mock('@onsocial/ui', async () => {
  const actual = await vi.importActual<typeof import('@onsocial/ui')>(
    '@onsocial/ui'
  );
  return {
    ...actual,
    OsHugSheet: ({
      label,
      copy,
      children,
    }: {
      label: string;
      copy?: string;
      children?: ReactNode;
    }) =>
      createElement(
        'section',
        { 'aria-label': label },
        copy ? createElement('p', null, copy) : null,
        children
      ),
  };
});

import { GuildProposalsSheet } from '@/features/guilds/guild-proposals-sheet';
import {
  guildHeroActionVisibility,
  GuildHeroActions,
} from '@/features/guilds/guild-hero-actions';
import { guildKnownMember } from '@/features/guilds/live-guild-panel';
import { useGuildPageData } from '@/features/guilds/use-guild-page-data';
import { DEFAULT_GUILD_STRUCTURE } from '@/features/guilds/guild-structure';
import { clearGuildMembershipCacheForTests } from '@/lib/guild-membership-cache';
import { readGuildMembershipCache } from '@/lib/guild-membership-cache';

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  Object.defineProperty(dom.window, 'matchMedia', {
    configurable: true,
    value: matchMedia,
  });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('self', dom.window);
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  vi.stubGlobal('Node', dom.window.Node);
  vi.stubGlobal('requestIdleCallback', (cb: () => void) => {
    cb();
    return 1;
  });
  vi.stubGlobal('cancelIdleCallback', () => {});
  return dom;
}

function treeText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(treeText).join('');
  if (typeof node === 'object' && 'children' in node) {
    return treeText((node as { children: unknown }).children);
  }
  return '';
}

function renderSheet(isMember: boolean | null) {
  let renderer: ReactTestRenderer;
  act(() => {
    renderer = create(
      createElement(GuildProposalsSheet, {
        open: true,
        groupId: 'dao.testnet',
        accountId: isMember ? 'member.testnet' : null,
        isMember: isMember as boolean,
        memberDriven: true,
        onClose: () => {},
      })
    );
  });
  return renderer!;
}

describe('guild proposals sheet membership', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the loading dots for a member while membership is still unknown', () => {
    installDom();
    const renderer = renderSheet(null);
    const text = treeText(renderer.toJSON());
    expect(text).not.toContain('Join this guild to vote');
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('protocol-pulsing-dots');
  });

  it('still hides the join prompt after proposals load while membership is unknown', async () => {
    installDom();
    const renderer = renderSheet(null);
    await act(async () => {
      proposalsLoad.resolve?.([]);
    });
    const text = treeText(renderer.toJSON());
    expect(text).not.toContain('Join this guild to vote');
    expect(text).not.toContain('No active proposals');
    expect(JSON.stringify(renderer.toJSON())).toContain('protocol-pulsing-dots');
  });

  it('uses the member line when membership is already known true', () => {
    installDom();
    const renderer = renderSheet(true);
    const text = treeText(renderer.toJSON());
    expect(text).toContain('Support or oppose active governance items.');
    expect(text).not.toContain('Join this guild to vote');
  });

  it('shows the join prompt once membership is known false', () => {
    installDom();
    const renderer = renderSheet(false);
    const text = treeText(renderer.toJSON());
    expect(text).toContain('Join this guild to vote on proposals.');
  });
});

const ACTIVE_PROPOSAL = {
  id: 'prop-role-active',
  sequence_number: 12,
  title: 'Change Permission for bob.testnet to level 2',
  type: 'permission_change',
  status: 'active',
  description: '',
  proposer: 'alice.testnet',
  target: 'bob.testnet',
  data: {
    PermissionChange: {
      target_user: 'bob.testnet',
      level: 2,
      reason: 'Keeps the rooms tidy',
    },
  },
  created_at: String(Date.now() * 1_000_000),
  voting_config: {
    participation_quorum_bps: 5100,
    majority_threshold_bps: 5001,
    voting_period: '7d',
  },
};

function guildSeed(groupId: string) {
  return {
    groupId,
    config: {
      name: 'Hint Guild',
      description: '',
      bannerUrl: null,
      badgeUrl: null,
      ownerId: 'owner.testnet',
      accessGated: false,
      memberDriven: true,
      topics: [],
      structure: DEFAULT_GUILD_STRUCTURE,
    },
    shell: {
      name: 'Hint Guild',
      bannerUrl: null,
      badgeUrl: null,
      accessGated: false,
      memberDriven: true,
      description: '',
      topics: [],
    },
    posts: [],
    hasMorePosts: false,
    stats: null,
    indexedMemberCount: 1,
    members: [],
    postCount: 0,
    structureResolved: true,
    engagement: {},
    scarceEmbeds: {},
  };
}

function MembershipSurface({
  accountId,
  groupId,
}: {
  accountId: string;
  groupId: string;
}) {
  wallet.accountId = accountId;
  const data = useGuildPageData({
    groupId,
    initial: guildSeed(groupId),
    accountId,
    walletLoading: false,
    selectedFeedFilterId: 'all',
  });
  const cachedMember = Boolean(
    readGuildMembershipCache(accountId, groupId)?.isMember
  );
  const knownMember = guildKnownMember({
    shellOwner: false,
    rosterMember: false,
    cachedMember,
    indexedMemberHint: data.indexedMemberHint,
    viewerAccessResolved: data.viewerAccessResolved,
    viewerIsMember: Boolean(data.viewer?.isMember),
  });
  const proposalsIsMember = knownMember
    ? true
    : data.viewerAccessResolved
      ? false
      : null;
  const chrome = guildHeroActionVisibility({
    isMember: knownMember,
    isOwner: false,
    roleKnown: true,
  });
  return createElement(
    'div',
    null,
    createElement(GuildHeroActions, {
      ...chrome,
      onJoin() {},
      onLeave() {},
      onOpenSettings() {},
    }),
    createElement(GuildProposalsSheet, {
      open: true,
      groupId,
      accountId,
      isMember: proposalsIsMember,
      memberDriven: true,
      onClose() {},
    })
  );
}

describe('indexer membership hint yields to chain ACL', () => {
  afterEach(() => {
    access.immediateProposals = false;
    access.proposals = [];
    access.onMembership = () => Promise.resolve(null);
    wallet.accountId = null;
    clearGuildMembershipCacheForTests();
    vi.unstubAllGlobals();
  });

  it('shows the join prompt after the indexer hint when ACL says not a member', async () => {
    installDom();
    access.immediateProposals = true;
    access.proposals = [ACTIVE_PROPOSAL];
    let membershipReads = 0;
    access.onMembership = () => {
      membershipReads += 1;
      if (membershipReads === 1) {
        return Promise.resolve({
          memberId: 'visitor.testnet',
          isOwner: false,
          isAdmin: false,
          canModerate: false,
        });
      }
      return Promise.resolve(null);
    };
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        createElement(MembershipSurface, {
          accountId: 'visitor.testnet',
          groupId: 'hint-acl.near',
        })
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    const json = JSON.stringify(renderer!.toJSON());
    expect(json).toContain('Join this guild to vote on proposals.');
    expect(json).toContain('Join guild');
    expect(json).not.toContain('Leave guild');
    expect(json).not.toContain('Oppose');
  });

  it('does not apply an in-flight membership hint after the wallet account changes', async () => {
    installDom();
    access.immediateProposals = true;
    access.proposals = [ACTIVE_PROPOSAL];
    let releaseAlice: (row: unknown) => void = () => {};
    const aliceMembership = new Promise((resolve) => {
      releaseAlice = resolve;
    });
    access.onMembership = (_groupId: string, accountId: string) => {
      if (accountId === 'alice.testnet') return aliceMembership;
      return new Promise(() => {});
    };
    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        createElement(MembershipSurface, {
          accountId: 'alice.testnet',
          groupId: 'hint-switch.near',
        })
      );
    });
    await act(async () => {
      renderer!.update(
        createElement(MembershipSurface, {
          accountId: 'bob.testnet',
          groupId: 'hint-switch.near',
        })
      );
    });
    await act(async () => {
      releaseAlice({
        memberId: 'alice.testnet',
        isOwner: false,
        isAdmin: false,
        canModerate: false,
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    const json = JSON.stringify(renderer!.toJSON());
    expect(json).not.toContain('Support or oppose active governance items.');
    expect(json).not.toContain('Leave guild');
  });
});
