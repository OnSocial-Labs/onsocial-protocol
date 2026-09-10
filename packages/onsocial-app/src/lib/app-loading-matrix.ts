export type AppLoadingFamily =
  | 'glass-list'
  | 'immersive-detail'
  | 'sheet-form'
  | 'private';

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
 * The app's loading inventory. Add a row when adding a page, then update the
 * referenced components as the page's layout evolves.
 */
export const APP_LOADING_MATRIX: readonly AppLoadingMatrixRow[] = [
  {
    id: 'home',
    route: '/home',
    family: 'glass-list',
    cold: 'PostRowSkeleton',
    refreshing: 'Keep visible posts and apply is-refreshing',
    appending: 'Append PostRowSkeleton rows',
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
    appending: 'Append profile/community skeleton rows',
    empty: 'ListLoadError or standing empty state',
    error: 'OsChromeListAlert with painted rows',
    routeFallback: 'preserve-shell',
    implementationFiles: [
      'features/discover/discover-panel-content.tsx',
      'features/discover/discover-loading-skeleton.tsx',
    ],
  },
  {
    id: 'market',
    route: '/market',
    family: 'glass-list',
    cold: 'MarketLoadingScreen with MarketListSkeleton',
    refreshing: 'Keep visible listings',
    appending: 'Append MarketListSkeleton rows',
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
    appending: 'Append MarketListSkeleton rows',
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
    id: 'collectibles',
    route: '/collectibles',
    family: 'glass-list',
    cold: 'CollectiblesLibrarySkeleton',
    refreshing: 'Keep visible holdings',
    appending: 'Append holding skeleton rows',
    empty: 'Collectibles empty state',
    error: 'OsChromeListAlert with painted holdings',
    routeFallback: 'shell-skeleton',
    implementationFiles: [
      'features/collectibles/collectibles-library-skeleton.tsx',
      'features/collectibles/collectibles-page-panel.tsx',
    ],
  },
  {
    id: 'guild',
    route: '/groups/[groupId]',
    family: 'immersive-detail',
    cold: 'GuildPageHeroSkeleton, filter skeleton, and PostRowSkeleton',
    refreshing: 'Keep shell preview and visible feed',
    appending: 'Append PostRowSkeleton rows',
    empty: 'Guild state card',
    error: 'Guild state card with retry',
    routeFallback: 'preserve-shell',
    implementationFiles: [
      'features/guilds/live-guild-panel.tsx',
      'features/guilds/guild-page-hero.tsx',
    ],
  },
  {
    id: 'collection',
    route: '/collection/[collectionId]',
    family: 'immersive-detail',
    cold: 'CollectionPageSkeleton',
    refreshing: 'Keep resolved collection shell',
    appending: 'CollectionActivitySkeleton',
    empty: 'Collection state',
    error: 'Collection state with retry',
    routeFallback: 'shell-skeleton',
    implementationFiles: [
      'features/scarces/collection-page-skeleton.tsx',
      'features/scarces/collection-page-panel.tsx',
    ],
  },
  {
    id: 'notifications',
    route: '/notifications',
    family: 'glass-list',
    cold: 'NotificationActivitySkeleton',
    refreshing: 'Keep visible activity',
    appending: 'Append activity skeleton rows',
    empty: 'Notifications empty state',
    error: 'Notifications error state',
    routeFallback: 'preserve-shell',
    implementationFiles: ['features/notifications/notifications-panel.tsx'],
  },
  {
    id: 'messages',
    route: '/messages',
    family: 'private',
    cold: 'Status fallback until session and keys are available',
    refreshing: 'Keep inbox or thread state',
    appending: 'Not applicable',
    empty: 'OsAppChromePageStatus',
    error: 'OsChromeListAlert when painted inbox rows exist',
    routeFallback: 'status',
    implementationFiles: [
      'app/(app)/messages/page.tsx',
      'features/messages/messages-panel.tsx',
    ],
  },
] as const;
