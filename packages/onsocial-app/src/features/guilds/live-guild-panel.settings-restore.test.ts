// @ts-nocheck
import { act, createElement, useState, type ReactNode } from 'react';
import {
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  guildPath,
  guildSheetPath,
  type GuildShareSheetId,
} from '@/features/guilds/guilds-data';

const GROUP_ID = 'audit-guild';
const BARE = guildPath(GROUP_ID);
const SETTINGS = guildSheetPath(GROUP_ID, 'settings');
const PROPOSALS = guildSheetPath(GROUP_ID, 'proposals');
const REQUESTS = guildSheetPath(GROUP_ID, 'requests');
const MEMBERS = guildSheetPath(GROUP_ID, 'members');

const sheets = vi.hoisted(() => {
  const React = require('react') as typeof import('react');
  function sheet(label: string) {
    return function SheetMock({
      open = true,
      onClose,
      onHandoffMembers,
    }: {
      open?: boolean;
      onClose?: () => void;
      onHandoffMembers?: () => void;
    }) {
      if (!open) return null;
      return React.createElement(
        'div',
        { role: 'dialog', 'aria-label': label },
        onHandoffMembers
          ? React.createElement('button', {
              type: 'button',
              'aria-label': 'Members',
              onClick: onHandoffMembers,
            })
          : null,
        onClose
          ? React.createElement('button', {
              type: 'button',
              'aria-label': 'Close',
              onClick: onClose,
            })
          : null
      );
    };
  }
  return { sheet };
});

const harness = vi.hoisted(() => {
  const popInApp = vi.fn(() => false);
  const calls: { op: 'push' | 'replace'; href: string }[] = [];
  const pendingPushes: string[] = [];
  const location = {
    pathname: '/groups/audit-guild',
    search: '',
    href: 'http://guild.local/groups/audit-guild',
  };
  let onRoute: ((href: string) => void) | null = null;
  let popListeners: Array<() => void> = [];
  let historyStack = ['/outside', '/groups/audit-guild'];
  let historyIndex = 1;
  const viewerMode: { current: 'owner' | 'stranger' } = { current: 'owner' };

  function applyHref(href: string) {
    const url = new URL(href, 'http://guild.local');
    location.pathname = url.pathname;
    location.search = url.search;
    location.href = url.href;
  }

  const router = {
    push(href: string) {
      calls.push({ op: 'push' as const, href });
      pendingPushes.push(href);
    },
    replace(href: string) {
      calls.push({ op: 'replace' as const, href });
      if (historyIndex >= 0) historyStack[historyIndex] = href;
      onRoute?.(href);
    },
    back() {},
    prefetch() {},
  };

  function installWindow() {
    popListeners = [];
    const windowStub = {
      location,
      history: {
        pushState: (
          _data: unknown,
          _title: string,
          url?: string | URL | null
        ) => {
          if (url != null) applyHref(String(url));
        },
        replaceState: (
          _data: unknown,
          _title: string,
          url?: string | URL | null
        ) => {
          if (url != null) applyHref(String(url));
        },
      },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      addEventListener: (type: string, fn: () => void) => {
        if (type === 'popstate') popListeners.push(fn);
      },
      removeEventListener: (type: string, fn: () => void) => {
        if (type !== 'popstate') return;
        popListeners = popListeners.filter((item) => item !== fn);
      },
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: windowStub,
    });
  }

  return {
    installWindow,
    popInApp,
    calls,
    pendingPushes,
    location,
    viewerMode,
    applyHref,
    router,
    setOnRoute: (listener: ((href: string) => void) | null) => {
      onRoute = listener;
    },
    emitRoute: (href: string) => onRoute?.(href),
    dispatchPop: () => {
      for (const fn of popListeners.slice()) fn();
    },
    historyTop: () => historyStack[historyIndex],
    noteUncommittedSettings() {
      historyStack[historyIndex] = '/groups/audit-guild';
    },
    commitPush(href: string) {
      historyStack = historyStack.slice(0, historyIndex + 1);
      historyStack.push(href);
      historyIndex += 1;
      onRoute?.(href);
    },
    popCommitted() {
      if (historyIndex <= 0) return false;
      historyIndex -= 1;
      const href = historyStack[historyIndex];
      applyHref(href);
      onRoute?.(href);
      for (const fn of popListeners.slice()) fn();
      return true;
    },
    reset() {
      calls.length = 0;
      pendingPushes.length = 0;
      popInApp.mockReset();
      popInApp.mockImplementation(() => false);
      viewerMode.current = 'owner';
      applyHref(BARE);
      onRoute = null;
      popListeners = [];
      historyStack = ['/outside', '/groups/audit-guild'];
      historyIndex = 1;
    },
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => harness.router,
  usePathname: () => harness.location.pathname,
  useSearchParams: () => new URLSearchParams(harness.location.search),
}));

vi.mock('@/components/providers/os-face-leave-provider', () => ({
  useOsInAppPop: () => harness.popInApp,
}));

vi.mock('@onsocial/sdk', () => ({
  postContentPath: () => '',
  normalizeAudiences: (value: unknown) => value,
  OnSocial: class OnSocial {},
}));

vi.mock('@onsocial/ui', () => {
  const Icon = () => null;
  return {
    Divider: () => null,
    replaceSheet: () => {},
    SettingsIcon: Icon,
    UserMinusIcon: Icon,
    UserPlusIcon: Icon,
    InformationCircleIcon: Icon,
    IpfsImg: Icon,
    cn: (...parts: Array<string | false | null | undefined>) =>
      parts.filter(Boolean).join(' '),
  };
});

vi.mock('@/components/app/os-app-screen', () => ({
  OsAppScreen: ({ children }: { children?: ReactNode }) =>
    createElement('div', null, children),
}));

vi.mock('@/components/chrome/os-chrome-whisper', () => ({
  OsChromeListAlert: () => null,
}));

vi.mock('@/contexts/app-wallet-context', () => ({
  useAppWallet: () => ({
    accountId: 'owner.testnet',
    isConnected: true,
    isLoading: false,
    connect: () => {},
  }),
}));

vi.mock('@/contexts/app-transaction-feedback-context', () => ({
  useAppTransactionFeedback: () => ({
    setTxResult: () => {},
    trackTransaction: async () => ({ confirmed: false }),
  }),
}));

vi.mock('@/hooks/use-app-onsocial-client', () => ({
  useAppOnSocialClient: () => ({
    getClient: async () => ({ client: {} }),
  }),
}));

vi.mock('@/hooks/use-user-storage-balance', () => ({
  useUserStorageBalance: () => ({ summary: null }),
}));

vi.mock('@/contexts/compose-launcher-context', () => ({
  useRegisterComposeAction: () => {},
}));

vi.mock('@/hooks/use-feed-reply-write-dock', () => ({
  useFeedReplyWriteDock: () => ({
    startReply: () => {},
    clearReply: () => {},
  }),
}));

vi.mock('@/hooks/use-immersive-title-handoff', () => ({
  useImmersiveTitleHandoff: () => {},
}));

vi.mock('@/features/home/post-card', () => ({
  postKey: (post: { accountId?: string; postId?: string; id?: string }) =>
    `${post.accountId ?? ''}:${post.postId ?? post.id ?? ''}`,
  PostRowSkeleton: () => null,
}));

vi.mock('@/features/home/use-feed-window', () => ({
  useFeedWindow: () => ({
    windowed: false,
    start: 0,
    end: 0,
    topSpacer: 0,
    bottomSpacer: 0,
    registerRow: () => () => {},
  }),
}));

vi.mock('@/hooks/use-quoted-posts', () => ({
  useQuotedPosts: () => ({}),
}));

vi.mock('@/hooks/use-post-author-profiles', () => ({
  usePostAuthorProfiles: () => ({}),
}));

vi.mock('@/hooks/use-post-engagement', () => ({
  usePostEngagement: () => ({
    engagement: {},
    toggleReaction: () => {},
    toggleSave: () => {},
    isReactionPending: () => false,
    isSavePending: () => false,
    isSharePending: () => false,
    withSharePending: async (_post: unknown, run: () => Promise<void>) => run(),
    confirmAmplify: () => {},
    confirmRepost: () => {},
    confirmUnrepost: () => {},
  }),
}));

vi.mock('@/hooks/use-poll-votes', () => ({
  usePollVotes: () => ({
    pollTallyFor: () => null,
    castVote: () => {},
    isPollVotePending: () => false,
  }),
}));

vi.mock('@/hooks/use-infinite-scroll-sentinel', () => ({
  useInfiniteScrollSentinel: () => {},
}));

vi.mock('@/features/guilds/use-guild-membership-action', () => ({
  useGuildMembershipAction: () => ({
    confirmKind: null,
    actionPending: false,
    dismissConfirm: () => {},
    confirmMembership: () => {},
    handleMembershipClick: () => {},
  }),
}));

vi.mock('@/features/guilds/use-guild-page-data', () => ({
  useGuildPageData: () => {
    const owner = harness.viewerMode.current === 'owner';
    return {
      loadState: 'ready',
      error: null,
      state: {
        posts: [],
        members: [],
        moderation: {
          pendingMemberRequestCount: 0,
          activeProposalCount: 0,
        },
        stats: null,
        postCount: 0,
        indexedMemberCount: 1,
        feedError: null,
      },
      config: {
        name: 'Audit Guild',
        ownerId: 'owner.testnet',
        memberDriven: true,
        accessGated: true,
        topics: [],
        structure: { spaces: [], defaultSpaceId: 'general' },
      },
      viewer: {
        isOwner: owner,
        isAdmin: owner,
        isMember: owner,
        canModerate: owner,
        isBlacklisted: false,
        joinRequest: null,
        pendingJoinProposalId: null,
      },
      shellPreview: null,
      shellExtrasResolved: true,
      viewerAccessResolved: true,
      feedPending: false,
      hasMorePosts: false,
      loadingMore: false,
      loadMoreError: null,
      isFeedRefreshing: false,
      localPosts: [],
      setLocalPosts: () => {},
      viewerAccess: {
        isMember: owner,
        canModerate: owner,
        isAdmin: owner,
        isOwner: owner,
      },
      selectedFeedSpace: null,
      optimisticJoinPending: false,
      setOptimisticJoinPending: () => {},
      refresh: async () => {},
      refreshFeed: async () => {},
      loadMoreFeed: async () => {},
      scheduleReconcile: () => {},
    };
  },
}));

vi.mock('@/features/guilds/guild-page-hero', () => ({
  guildPageHeroLook: (source: unknown) => source,
  GuildPageHeroSkeleton: () => null,
  GuildPageHero: ({
    actions,
    leading,
    onOpenFacts,
  }: {
    actions?: ReactNode;
    leading?: ReactNode;
    onOpenFacts?: () => void;
  }) =>
    createElement(
      'div',
      null,
      leading,
      createElement('button', {
        type: 'button',
        'aria-label': 'Guild facts',
        onClick: onOpenFacts,
      }),
      actions
    ),
}));

vi.mock('@/features/guilds/guild-facepile', () => ({
  buildGuildFacepileIds: (ids: string[]) => ids,
  GuildFacepile: ({ onClick }: { onClick?: () => void }) =>
    createElement('button', {
      type: 'button',
      'aria-label': 'Members',
      onClick,
    }),
}));

vi.mock('@/features/guilds/guild-hero-actions', () => ({
  guildViewerOwnsShell: (
    accountId?: string | null,
    ownerId?: string | null
  ) => {
    const account = accountId?.trim().toLowerCase() ?? '';
    const owner = ownerId?.trim().toLowerCase() ?? '';
    return account.length > 0 && account === owner;
  },
  guildHeroIconsForViewer: (input: { canOpenSettings?: boolean }) => ({
    showJoin: false,
    showLeave: false,
    showSettings: Boolean(input.canOpenSettings),
  }),
  GuildHeroActions: ({
    showSettings,
    onOpenSettings,
  }: {
    showSettings?: boolean;
    onOpenSettings: () => void;
  }) =>
    showSettings
      ? createElement('button', {
          type: 'button',
          'aria-label': 'Guild settings',
          onClick: onOpenSettings,
        })
      : null,
}));

vi.mock('@/features/guilds/guild-settings-sheet', () => ({
  GuildSettingsSheet: ({
    open,
    onHandoff,
    onClose,
    onOpenProposals,
  }: {
    open: boolean;
    onHandoff?: (id: string) => void;
    onClose: () => void;
    onOpenProposals?: () => void;
  }) =>
    open
      ? createElement(
          'div',
          { role: 'dialog', 'aria-label': 'Settings' },
          createElement('button', {
            type: 'button',
            'aria-label': 'Proposals',
            onClick: () => onHandoff?.('proposals'),
          }),
          createElement('button', {
            type: 'button',
            'aria-label': 'Member requests',
            onClick: () => onHandoff?.('requests'),
          }),
          createElement('button', {
            type: 'button',
            'aria-label': 'Edit guild',
            onClick: () => onHandoff?.('edit'),
          }),
          createElement('button', {
            type: 'button',
            'aria-label': 'Rooms',
            onClick: () => onHandoff?.('rooms'),
          }),
          createElement('button', {
            type: 'button',
            'aria-label': 'Guild storage',
            onClick: () => onHandoff?.('storage'),
          }),
          createElement('button', {
            type: 'button',
            'aria-label': 'Open proposals directly',
            onClick: () => onOpenProposals?.(),
          }),
          createElement('button', {
            type: 'button',
            'aria-label': 'Close',
            onClick: onClose,
          })
        )
      : null,
}));

vi.mock('@/features/guilds/guild-proposals-sheet', () => ({
  GuildProposalsSheet: sheets.sheet('Proposals'),
}));

vi.mock('@/features/guilds/guild-member-requests-sheet', () => ({
  GuildMemberRequestsSheet: sheets.sheet('Requests'),
}));

vi.mock('@/features/guilds/guild-members-sheet', () => ({
  GuildMembersSheet: sheets.sheet('Members'),
}));

vi.mock('@/features/guilds/guild-facts-sheet', () => ({
  GuildFactsSheet: sheets.sheet('Guild'),
}));

vi.mock('@/features/guilds/guild-edit-sheet', () => ({
  GuildEditSheet: sheets.sheet('Edit guild'),
}));

vi.mock('@/features/guilds/guild-rooms-sheet', () => ({
  GuildRoomsSheet: sheets.sheet('Rooms'),
}));

vi.mock('@/features/guilds/guild-group-storage-sheet', () => ({
  GuildGroupStorageSheet: sheets.sheet('Guild storage'),
}));

vi.mock('@/features/guilds/guild-feed-filter-list', () => ({
  GuildFeedFilterList: () => null,
  GuildFeedFilterSkeleton: () => null,
}));

vi.mock('@/features/guilds/feed-thread-block', () => ({
  FeedThreadBlock: () => null,
}));

vi.mock('@/features/guilds/guild-composer-sheet', () => ({
  ComposerSheet: () => null,
}));

vi.mock('@/components/wallet/app-storage-sheet', () => ({
  AppStorageSheet: () => null,
}));

vi.mock('@/features/guilds/guild-membership-join-button', () => ({
  GuildMembershipConfirmDrawer: () => null,
}));

vi.mock('@/features/guilds/guild-add-member-sheet', () => ({
  GuildAddMemberSheet: () => null,
}));

vi.mock('@/features/guilds/guild-room-editor', () => ({
  GuildFeedAddRoomSheet: () => null,
}));

vi.mock('@/features/guilds/guild-space-writers-sheet', () => ({
  GuildSpaceWritersSheet: () => null,
}));

vi.mock('@/lib/app-near-rpc', () => ({
  viewNearContract: async () => null,
  nearToYocto: () => 0n,
  yoctoToNear: () => '0',
}));

vi.mock('@/lib/create-readonly-onsocial-client', () => ({
  createReadOnlyOnSocialClient: () => ({}),
}));

vi.mock('@/features/home/submit-personal-post', () => ({
  submitPersonalRepost: async () => ({ confirmed: false }),
  submitPersonalUnrepost: async () => ({ confirmed: false }),
}));

vi.mock('@/features/scarces/submit-guild-drop-post', () => ({
  submitGuildRootPost: async () => ({ confirmed: false }),
  subscribeGuildPostConfirmed: () => () => {},
}));

vi.mock('@/features/scarces/drop-compose-host', () => ({
  dispatchPersonalQuoteConfirmed: () => {},
}));

vi.mock('@/features/scarces/scarce-embed-ledger', () => ({
  seedScarceEmbedsFromSsr: () => {},
}));

vi.mock('@/features/scarces/drop-compose-draft', () => ({
  isDropComposeDraftReady: () => false,
}));

vi.mock('@/lib/feed-paint-hydrate', () => ({
  hydrateScarceEmbedsForPosts: async () => {},
}));

vi.mock('@/lib/os-empty-action', () => ({
  OsEmptyAction: ({ children }: { children?: ReactNode }) => children ?? null,
}));

async function loadPanel() {
  const mod = await import('@/features/guilds/live-guild-panel');
  return mod.LiveGuildPanel;
}

function Harness({
  initialSheet = null,
  Panel,
}: {
  initialSheet?: GuildShareSheetId | null;
  Panel: typeof import('@/features/guilds/live-guild-panel').LiveGuildPanel;
}) {
  const [sheet, setSheet] = useState<GuildShareSheetId | null>(() => {
    harness.applyHref(
      initialSheet ? guildSheetPath(GROUP_ID, initialSheet) : BARE
    );
    return initialSheet;
  });
  harness.setOnRoute((href) => {
    harness.applyHref(href);
    const next = new URL(href, 'http://guild.local').searchParams.get('sheet');
    setSheet(
      next === 'settings' ||
        next === 'proposals' ||
        next === 'requests' ||
        next === 'members'
        ? next
        : null
    );
  });
  return createElement(Panel, { groupId: GROUP_ID, initialSheet: sheet });
}

function buttons(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findAll(
    (node) =>
      node.type === 'button' &&
      node.props['aria-label'] === label &&
      typeof node.props.onClick === 'function' &&
      !node.props.disabled
  );
}

function insideDialog(node: ReactTestInstance, dialog: string) {
  let current: ReactTestInstance | null = node;
  while (current) {
    if (
      current.props?.role === 'dialog' &&
      current.props?.['aria-label'] === dialog
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function click(renderer: ReactTestRenderer, label: string, dialog?: string) {
  const matches = buttons(renderer, label).filter((node) =>
    dialog ? insideDialog(node, dialog) : true
  );
  const node = matches[matches.length - 1];
  if (!node) {
    throw new Error(`No button labeled ${label}`);
  }
  act(() => {
    node.props.onClick();
  });
}

function dialogOpen(renderer: ReactTestRenderer, label: string) {
  return (
    renderer.root.findAll(
      (node) =>
        node.props?.role === 'dialog' && node.props?.['aria-label'] === label
    ).length > 0
  );
}

function hrefNow() {
  return harness.location.pathname + harness.location.search;
}

async function flush(ms = 0) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function openSettings(renderer: ReactTestRenderer) {
  click(renderer, 'Guild settings');
  await flush();
  expect(dialogOpen(renderer, 'Settings')).toBe(true);
  expect(hrefNow()).toBe(SETTINGS);
  expect(harness.calls.some((call) => call.op === 'push')).toBe(false);
}

describe('guild settings restore when a successor push has not landed', () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    harness.installWindow();
    harness.reset();
  });

  afterEach(() => {
    act(() => {
      renderer?.unmount();
    });
    renderer = undefined;
  });

  async function mount(initialSheet: GuildShareSheetId | null = null) {
    const Panel = await loadPanel();
    await act(async () => {
      renderer = create(createElement(Harness, { initialSheet, Panel }));
    });
    return renderer!;
  }

  async function handoffAndCloseBeforePush(label: string, dialog: string) {
    const view = await mount();
    await openSettings(view);
    click(view, label);
    await flush();
    expect(dialogOpen(view, dialog)).toBe(true);
    expect(hrefNow()).toBe(SETTINGS);
    expect(harness.pendingPushes).toContain(
      label === 'Member requests' ? REQUESTS : PROPOSALS
    );
    harness.popInApp.mockClear();
    click(view, 'Close');
    await flush(450);
    expect(harness.popInApp).not.toHaveBeenCalled();
    expect(dialogOpen(view, 'Settings')).toBe(true);
    expect(dialogOpen(view, dialog)).toBe(false);
    expect(hrefNow()).toBe(SETTINGS);
    expect(harness.calls.some((call) => call.href === BARE)).toBe(false);
  }

  it('restores settings when proposals closes before the push lands', async () => {
    await handoffAndCloseBeforePush('Proposals', 'Proposals');
  });

  it('closes requests before the push lands onto the bare guild', async () => {
    const view = await mount();
    await openSettings(view);
    click(view, 'Member requests');
    await flush();
    expect(dialogOpen(view, 'Requests')).toBe(true);
    expect(hrefNow()).toBe(SETTINGS);
    expect(harness.pendingPushes).toContain(REQUESTS);
    harness.popInApp.mockClear();
    click(view, 'Close');
    await flush(450);
    expect(dialogOpen(view, 'Settings')).toBe(false);
    expect(dialogOpen(view, 'Requests')).toBe(false);
    expect(hrefNow()).toBe(BARE);
    expect(
      harness.calls.some((call) => call.op === 'replace' && call.href === BARE)
    ).toBe(true);
  });

  it('restores settings when the proposals push committed on the bare guild entry', async () => {
    const view = await mount();
    await openSettings(view);
    harness.noteUncommittedSettings();
    click(view, 'Proposals');
    await flush();
    const pending = harness.pendingPushes.shift();
    expect(pending).toBe(PROPOSALS);
    await act(async () => {
      harness.commitPush(pending!);
    });
    expect(hrefNow()).toBe(PROPOSALS);
    expect(harness.historyTop()).toBe(PROPOSALS);
    harness.popInApp.mockImplementation(() => harness.popCommitted());
    click(view, 'Close');
    await flush(450);
    expect(harness.popInApp).toHaveBeenCalled();
    expect(dialogOpen(view, 'Settings')).toBe(true);
    expect(dialogOpen(view, 'Proposals')).toBe(false);
    expect(hrefNow()).toBe(SETTINGS);
    expect(harness.historyTop()).toBe(SETTINGS);
    expect(
      harness.calls.some((call) => call.op === 'push' && call.href === SETTINGS)
    ).toBe(false);
  });

  it('drops the proposals pop listener when the panel unmounts first', async () => {
    const view = await mount();
    await openSettings(view);
    click(view, 'Proposals');
    await flush();
    const pending = harness.pendingPushes.shift();
    await act(async () => {
      harness.commitPush(pending!);
    });
    harness.popInApp.mockImplementation(() => true);
    click(view, 'Close');
    const replaces = harness.calls.filter((call) => call.op === 'replace').length;
    act(() => {
      view.unmount();
    });
    renderer = undefined;
    harness.applyHref(BARE);
    harness.dispatchPop();
    expect(harness.calls.filter((call) => call.op === 'replace').length).toBe(
      replaces
    );
    expect(hrefNow()).toBe(BARE);
  });

  it('leaves a bare guild in place when the pop was not this proposals close', async () => {
    const view = await mount();
    await openSettings(view);
    click(view, 'Proposals');
    await flush();
    const pending = harness.pendingPushes.shift();
    await act(async () => {
      harness.emitRoute(pending!);
      harness.applyHref(BARE);
      harness.dispatchPop();
      harness.emitRoute(BARE);
    });
    await flush();
    expect(harness.popInApp).not.toHaveBeenCalled();
    expect(dialogOpen(view, 'Settings')).toBe(false);
    expect(dialogOpen(view, 'Proposals')).toBe(false);
    expect(hrefNow()).toBe(BARE);
  });

  it('back from restored settings leaves the guild', async () => {
    const view = await mount();
    const history = ['/outside', BARE];
    let index = 1;
    await openSettings(view);
    click(view, 'Proposals');
    await flush();
    click(view, 'Close');
    await flush(450);
    for (const call of harness.calls) {
      if (call.op === 'push') continue;
      history[index] = call.href;
    }
    expect(history[index]).toBe(SETTINGS);
    expect(history.filter((entry) => entry === SETTINGS)).toHaveLength(1);
    index -= 1;
    expect(history[index]).toBe('/outside');
    expect(dialogOpen(view, 'Settings')).toBe(true);
    expect(view).toBeTruthy();
  });

  it('closes members opened from the hero onto the bare guild', async () => {
    const view = await mount();
    click(view, 'Members');
    await flush();
    expect(dialogOpen(view, 'Members')).toBe(true);
    expect(harness.pendingPushes).toContain(MEMBERS);
    click(view, 'Close');
    await flush(450);
    expect(dialogOpen(view, 'Members')).toBe(false);
    expect(dialogOpen(view, 'Settings')).toBe(false);
    expect(hrefNow()).toBe(BARE);
  });

  it('closes members opened from facts onto the bare guild', async () => {
    const view = await mount();
    click(view, 'Guild facts');
    await flush();
    expect(dialogOpen(view, 'Guild')).toBe(true);
    click(view, 'Members');
    await flush();
    expect(dialogOpen(view, 'Members')).toBe(true);
    click(view, 'Close');
    await flush(450);
    expect(dialogOpen(view, 'Members')).toBe(false);
    expect(dialogOpen(view, 'Settings')).toBe(false);
    expect(hrefNow()).toBe(BARE);
  });

  it('closes proposals opened without settings behind them onto the bare guild', async () => {
    const view = await mount();
    await openSettings(view);
    click(view, 'Open proposals directly');
    await flush();
    expect(dialogOpen(view, 'Proposals')).toBe(true);
    click(view, 'Close', 'Proposals');
    await flush(450);
    expect(dialogOpen(view, 'Proposals')).toBe(false);
    expect(hrefNow()).toBe(BARE);
  });

  it('leaves edit, rooms, and storage on the guild when settings hands them off', async () => {
    const view = await mount();
    for (const [label, dialog] of [
      ['Edit guild', 'Edit guild'],
      ['Rooms', 'Rooms'],
      ['Guild storage', 'Guild storage'],
    ] as const) {
      if (!dialogOpen(view, 'Settings')) {
        click(view, 'Guild settings');
        await flush();
      }
      click(view, label);
      await flush(0);
      expect(dialogOpen(view, dialog)).toBe(true);
      expect(dialogOpen(view, 'Settings')).toBe(false);
      expect(hrefNow()).toBe(BARE);
      click(view, 'Close');
      await flush();
      expect(dialogOpen(view, dialog)).toBe(false);
      expect(dialogOpen(view, 'Settings')).toBe(false);
      expect(hrefNow()).toBe(BARE);
    }
  });

  it('closes a deep-linked settings sheet onto the bare guild', async () => {
    const view = await mount('settings');
    await flush();
    expect(dialogOpen(view, 'Settings')).toBe(true);
    expect(hrefNow()).toBe(SETTINGS);
    click(view, 'Close');
    await flush(450);
    expect(dialogOpen(view, 'Settings')).toBe(false);
    expect(hrefNow()).toBe(BARE);
  });

  it('drops a settings deep link the viewer cannot open', async () => {
    harness.viewerMode.current = 'stranger';
    const view = await mount('settings');
    await flush();
    expect(dialogOpen(view, 'Settings')).toBe(false);
    expect(hrefNow()).toBe(BARE);
    expect(view).toBeTruthy();
  });

  it('pops a successor whose push already landed instead of restoring early', async () => {
    const view = await mount();
    await openSettings(view);
    click(view, 'Proposals');
    await flush();
    const pending = harness.pendingPushes.shift();
    await act(async () => {
      harness.emitRoute(pending!);
    });
    expect(hrefNow()).toBe(PROPOSALS);
    expect(dialogOpen(view, 'Proposals')).toBe(true);
    harness.popInApp.mockImplementation(() => {
      harness.emitRoute(SETTINGS);
      return true;
    });
    click(view, 'Close');
    await flush(450);
    expect(harness.popInApp).toHaveBeenCalled();
    expect(hrefNow()).toBe(SETTINGS);
    expect(dialogOpen(view, 'Settings')).toBe(true);
    expect(harness.calls.some((call) => call.href === BARE)).toBe(false);
  });
});
