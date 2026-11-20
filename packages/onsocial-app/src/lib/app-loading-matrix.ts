export type AppLoadingFamily = 'glass-list' | 'immersive-detail' | 'private';

export type AppLoadingMatrixRow = {
  id: string;
  route: string;
  family: AppLoadingFamily;
  cold: string;
  refreshing: string;
  appending: string;
  empty: string;
  error: string;
  routeFallback: 'shell-skeleton' | 'preserve-shell' | 'status';
  implementationFiles: readonly string[];
};

/**
 * The primary data-backed page inventory. Add a row when adding a page, then
 * update the referenced components as the page's layout evolves.
 */
export const APP_LOADING_MATRIX: readonly AppLoadingMatrixRow[] = [
  {
    id: 'home',
    route: '/home',
    family: 'glass-list',
    cold: 'PostRowSkeleton',
    refreshing: 'Keep visible posts and apply is-refreshing',
    appending:
      'Footer PulsingDots (OsLoadMore / silent edge); cold skeletons only',
    empty: 'home-feed-state',
    error: 'OsChromeListAlert with painted posts; in-flow state otherwise',
    routeFallback: 'preserve-shell',
    implementationFiles: [
      'features/home/home-feed.tsx',
      'features/home/post-card.tsx',
    ],
  },
  {
    id: 'discover',
    route: '/discover',
    family: 'glass-list',
    cold: 'ProfileSocialListSkeleton or section skeleton',
    refreshing: 'Keep visible rows and apply is-refreshing',
    appending:
      'Footer PulsingDots (OsLoadMore / silent edge); cold skeletons only',
    empty: 'ListLoadError or standing empty state',
    error: 'OsChromeListAlert with painted rows',
    routeFallback: 'shell-skeleton',
    implementationFiles: [
      'features/discover/discover-panel-content.tsx',
      'features/discover/discover-loading-skeleton.tsx',
      'features/discover/discover-sheet-opening.tsx',
      'app/(app)/discover/loading.tsx',
      'app/[accountId]/@overlay/loading.tsx',
    ],
  },
  {
    id: 'market',
    route: '/market',
    family: 'glass-list',
    cold: 'MarketLoadingScreen with MarketListSkeleton',
    refreshing: 'Keep visible listings',
    appending:
      'Footer PulsingDots (OsLoadMore / silent edge); cold skeletons only',
    empty: 'Market empty state',
    error: 'OsChromeListAlert with painted listings',
    routeFallback: 'shell-skeleton',
    implementationFiles: [
      'features/market/market-loading-screen.tsx',
      'features/market/market-page-panel.tsx',
      'features/market/market-list-skeleton.tsx',
    ],
  },
  {
    id: 'drops',
    route: '/drops',
    family: 'glass-list',
    cold: 'DropsLoadingScreen with MarketListSkeleton',
    refreshing: 'Keep visible listings',
    appending:
      'Footer PulsingDots (OsLoadMore / silent edge); cold skeletons only',
    empty: 'Drops empty state',
    error: 'OsChromeListAlert with painted listings',
    routeFallback: 'shell-skeleton',
    implementationFiles: [
      'features/drops/drops-loading-screen.tsx',
      'features/drops/drops-page-panel.tsx',
      'features/market/market-list-skeleton.tsx',
    ],
  },
  {
    id: 'events',
    route: '/events',
    family: 'glass-list',
    cold: 'EventsLoadingScreen with MarketListSkeleton',
    refreshing: 'Keep visible events',
    appending:
      'Footer PulsingDots (OsLoadMore / silent edge); cold skeletons only',
    empty: 'Events empty state',
    error: 'ListLoadError or OsChromeListAlert with painted events',
    routeFallback: 'shell-skeleton',
    implementationFiles: [
      'features/events/events-loading-screen.tsx',
      'features/events/events-page-panel.tsx',
      'app/(app)/events/loading.tsx',
    ],
  },
  {
    id: 'collectibles',
    route: '/collectibles',
    family: 'glass-list',
    cold: 'CollectiblesLibrarySkeleton',
    refreshing: 'Keep visible holdings',
    appending:
      'Footer PulsingDots (OsLoadMore / silent edge); cold skeletons only',
    empty: 'Collectibles empty state',
    error: 'OsChromeListAlert with painted holdings',
    routeFallback: 'shell-skeleton',
    implementationFiles: [
      'features/collectibles/collectibles-loading-screen.tsx',
      'features/collectibles/collectibles-library-skeleton.tsx',
      'features/collectibles/collectibles-page-panel.tsx',
      'app/(app)/collectibles/loading.tsx',
    ],
  },
  {
    id: 'guilds-index',
    route: '/groups',
    family: 'glass-list',
    cold: 'LauncherHomeLoadingScreen',
    refreshing: 'Keep visible guild cards',
    appending: 'n/a',
    empty: 'LauncherHomeEmpty mine rail',
    error: 'LauncherHomeError with retry',
    routeFallback: 'shell-skeleton',
    implementationFiles: [
      'components/launcher-home/launcher-home-loading-screen.tsx',
      'app/(app)/groups/loading.tsx',
      'features/guilds/live-guilds-index-panel.tsx',
    ],
  },
  {
    id: 'daos-index',
    route: '/daos',
    family: 'glass-list',
    cold: 'LauncherHomeLoadingScreen',
    refreshing: 'Keep visible DAO cards',
    appending: 'n/a',
    empty: 'LauncherHomeEmpty mine rail',
    error: 'LauncherHomeError with retry',
    routeFallback: 'shell-skeleton',
    implementationFiles: [
      'components/launcher-home/launcher-home-loading-screen.tsx',
      'app/(app)/daos/loading.tsx',
      'features/protocol/daos-index-panel.tsx',
    ],
  },
  {
    id: 'hubs-index',
    route: '/apps',
    family: 'glass-list',
    cold: 'LauncherHomeLoadingScreen',
    refreshing: 'Keep visible hub cards',
    appending: 'n/a',
    empty: 'LauncherHomeEmpty mine rail',
    error: 'LauncherHomeError with retry',
    routeFallback: 'shell-skeleton',
    implementationFiles: [
      'components/launcher-home/launcher-home-loading-screen.tsx',
      'app/(app)/apps/loading.tsx',
      'features/scarces/hubs-index-panel.tsx',
    ],
  },
  {
    id: 'guild',
    route: '/groups/[groupId]',
    family: 'immersive-detail',
    cold: 'GuildPageHeroSkeleton, filter skeleton, and PostRowSkeleton',
    refreshing: 'Keep shell preview and visible feed',
    appending:
      'Footer PulsingDots (OsLoadMore / silent edge); cold skeletons only',
    empty: 'Guild state card',
    error: 'Guild state card with retry',
    routeFallback: 'shell-skeleton',
    implementationFiles: [
      'features/guilds/guild-page-route-loading.tsx',
      'features/guilds/live-guild-panel.tsx',
      'features/guilds/guild-page-hero.tsx',
      'app/(app)/groups/[groupId]/loading.tsx',
    ],
  },
  {
    id: 'personal-post',
    route: '/[accountId]/posts/[postId]',
    family: 'immersive-detail',
    cold: 'PostThreadPageSkeleton until a root exists; a root in hand paints; PostRowSkeleton until first reply page, then ThreadDiscoverPeek when empty',
    refreshing: 'Keep visible thread',
    appending:
      'Footer PulsingDots (OsLoadMore / silent edge); cold skeletons only',
    empty: 'Post missing state',
    error: 'Post error state',
    routeFallback: 'shell-skeleton',
    implementationFiles: [
      'features/home/post-thread-route-loading.tsx',
      'features/home/post-skeleton.tsx',
      'features/home/live-personal-post-panel.tsx',
      'app/[accountId]/posts/[postId]/loading.tsx',
      'components/app/os-route-settle.tsx',
    ],
  },
  {
    id: 'guild-post',
    route: '/groups/[groupId]/posts/[author]/[postId]',
    family: 'immersive-detail',
    cold: 'PostThreadPageSkeleton until a root exists; a root in hand paints; PostRowSkeleton until first reply page, then ThreadDiscoverPeek when empty',
    refreshing: 'Keep visible thread',
    appending:
      'Footer PulsingDots (OsLoadMore / silent edge); cold skeletons only',
    empty: 'Post missing state',
    error: 'Post error state',
    routeFallback: 'shell-skeleton',
    implementationFiles: [
      'features/home/post-thread-route-loading.tsx',
      'features/home/post-skeleton.tsx',
      'features/guilds/live-guild-post-panel.tsx',
      'app/(app)/groups/[groupId]/posts/[author]/[postId]/loading.tsx',
      'components/app/os-route-settle.tsx',
    ],
  },
  {
    id: 'personal-post-quotes',
    route: '/[accountId]/posts/[postId]/quotes',
    family: 'immersive-detail',
    cold: 'PostQuotesPageSkeleton under Post reach chrome until pageReady',
    refreshing: 'Keep visible quotes or reposts',
    appending:
      'Footer PulsingDots (OsLoadMore / silent edge); cold skeletons only',
    empty: 'Quotes empty state',
    error: 'Quotes error state',
    routeFallback: 'shell-skeleton',
    implementationFiles: [
      'features/home/post-quotes-route-loading.tsx',
      'features/home/post-quotes-skeleton.tsx',
      'features/home/post-quotes-panel.tsx',
      'app/[accountId]/posts/[postId]/quotes/loading.tsx',
      'components/app/os-route-settle.tsx',
    ],
  },
  {
    id: 'guild-post-quotes',
    route: '/groups/[groupId]/posts/[author]/[postId]/quotes',
    family: 'immersive-detail',
    cold: 'PostQuotesPageSkeleton under Post reach chrome until pageReady',
    refreshing: 'Keep visible quotes or reposts',
    appending:
      'Footer PulsingDots (OsLoadMore / silent edge); cold skeletons only',
    empty: 'Quotes empty state',
    error: 'Quotes error state',
    routeFallback: 'shell-skeleton',
    implementationFiles: [
      'features/home/post-quotes-route-loading.tsx',
      'features/home/post-quotes-skeleton.tsx',
      'features/home/post-quotes-panel.tsx',
      'app/(app)/groups/[groupId]/posts/[author]/[postId]/quotes/loading.tsx',
      'components/app/os-route-settle.tsx',
    ],
  },
  {
    id: 'collection',
    route: '/collection/[collectionId]',
    family: 'immersive-detail',
    cold: 'CollectionPageSkeleton',
    refreshing: 'Keep resolved collection shell',
    appending:
      'Footer PulsingDots (OsLoadMore / silent edge); cold skeletons only',
    empty: 'Collection state',
    error: 'Collection state with retry',
    routeFallback: 'shell-skeleton',
    implementationFiles: [
      'features/scarces/collection-page-skeleton.tsx',
      'features/scarces/collection-page-panel.tsx',
      'features/scarces/collection-route-loading.tsx',
    ],
  },
  {
    id: 'notifications',
    route: '/notifications',
    family: 'glass-list',
    cold: 'NotificationActivitySkeleton',
    refreshing: 'Keep visible activity',
    appending:
      'Footer PulsingDots (OsLoadMore / silent edge); cold skeletons only',
    empty: 'Notifications empty state',
    error: 'Notifications error state',
    routeFallback: 'shell-skeleton',
    implementationFiles: [
      'features/notifications/notifications-loading-screen.tsx',
      'features/notifications/notifications-panel.tsx',
      'app/(app)/notifications/loading.tsx',
    ],
  },
  {
    id: 'messages',
    route: '/messages',
    family: 'private',
    cold: 'MessagesInboxSkeleton and MessagesThreadSkeleton after session and keys are available',
    refreshing: 'Keep inbox or thread state',
    appending:
      'Footer PulsingDots (Earlier pending / silent edge); cold skeletons only',
    empty: 'OsAppChromePageStatus',
    error: 'OsChromeListAlert when painted inbox rows exist',
    routeFallback: 'preserve-shell',
    implementationFiles: [
      'app/(app)/messages/page.tsx',
      'app/(app)/messages/loading.tsx',
      'features/messages/messages-route-loading.tsx',
      'features/messages/messages-panel.tsx',
      'features/messages/messages-thread-skeleton.tsx',
      'features/messages/messages-inbox-rows.tsx',
    ],
  },
  {
    id: 'leaderboard',
    route: '/leaderboard',
    family: 'glass-list',
    cold: 'ProfileSocialListSkeleton rowVariant leaderboard under Leaderboard chrome',
    refreshing: 'Keep visible rows and apply is-refreshing',
    appending:
      'Footer PulsingDots (OsLoadMore / silent edge); cold skeletons only',
    empty: 'leaderboard-sheet-empty',
    error: 'OsChromeListAlert with painted rows',
    routeFallback: 'shell-skeleton',
    implementationFiles: [
      'features/leaderboard/leaderboard-route-loading.tsx',
      'features/leaderboard/leaderboard-route-panel.tsx',
      'features/leaderboard/leaderboard-sheet.tsx',
      'app/(app)/leaderboard/loading.tsx',
    ],
  },
  {
    id: 'portfolio-writing',
    route: '/[accountId]/writing',
    family: 'glass-list',
    cold: 'PortfolioWritingPending under Writing chrome',
    refreshing: 'Keep visible articles',
    appending:
      'Footer PulsingDots (OsLoadMore / silent edge); cold skeletons only',
    empty: 'portfolio-writing-empty',
    error: 'OsChromeListAlert with painted articles',
    routeFallback: 'shell-skeleton',
    implementationFiles: [
      'components/portfolio/portfolio-writing-route-loading.tsx',
      'components/portfolio/portfolio-writing-list.tsx',
      'components/portfolio/portfolio-writing-panel.tsx',
      'components/portfolio/writing-shelf-opening.tsx',
      'app/[accountId]/writing/loading.tsx',
    ],
  },
  {
    id: 'portfolio-about',
    route: '/[accountId]/about',
    family: 'immersive-detail',
    cold: 'PortfolioAboutPending masthead and lede shimmer',
    refreshing: 'Keep visible spread',
    appending: 'n/a',
    empty: 'portfolio-about craft prompt or quiet essay',
    error: 'In-flow state',
    routeFallback: 'shell-skeleton',
    implementationFiles: [
      'components/portfolio/portfolio-about-pending.tsx',
      'components/portfolio/portfolio-about-route-loading.tsx',
      'components/portfolio/portfolio-about-panel.tsx',
      'components/portfolio/portfolio-about-screen.tsx',
      'app/[accountId]/about/loading.tsx',
    ],
  },
  {
    id: 'portfolio',
    route: '/[accountId]',
    family: 'immersive-detail',
    cold: 'PortfolioShellPending identity stub via route loading',
    refreshing: 'Keep visible face; preview bars only',
    appending: 'Deferred shelf streams without remounting face',
    empty: 'Identity empty copy',
    error: 'notFound or quiet sibling fallback',
    routeFallback: 'shell-skeleton',
    implementationFiles: [
      'components/portfolio/portfolio-shell.tsx',
      'components/portfolio/portfolio-route-loading.tsx',
      'components/portfolio/portfolio-shell-root.tsx',
      'components/portfolio/portfolio-account-face.tsx',
      'app/[accountId]/loading.tsx',
      'app/[accountId]/page.tsx',
    ],
  },
  {
    id: 'post-overlay',
    route: 'post-thread-layer',
    family: 'immersive-detail',
    cold: 'PostThreadPageSkeleton until the seeded root paints; PostRowSkeleton until first reply page, then ThreadDiscoverPeek when empty',
    refreshing: 'Keep visible thread',
    appending:
      'Footer PulsingDots (OsLoadMore / silent edge); cold skeletons only',
    empty: 'Post missing state',
    error: 'Post error state',
    routeFallback: 'shell-skeleton',
    implementationFiles: [
      'features/home/post-thread-layer.tsx',
      'features/home/feed-media-thread-sheet.tsx',
      'features/home/post-skeleton.tsx',
      'features/home/post-quotes-skeleton.tsx',
      'components/app/os-route-settle.tsx',
    ],
  },
] as const;
