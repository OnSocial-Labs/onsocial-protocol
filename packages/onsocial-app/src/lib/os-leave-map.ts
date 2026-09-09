import {
  APP_APPS_PATH,
  APP_DAOS_PATH,
  APP_DISCOVER_PATH,
  APP_DROPS_PATH,
  APP_GROUPS_PATH,
  APP_HANDOFF_PATH,
  APP_HOME_PATH,
  APP_LEADERBOARD_PATH,
  APP_MARKET_PATH,
  APP_MESSAGES_PATH,
  APP_NOTIFICATIONS_PATH,
  APP_APP_CREATE_PATH,
  APP_DAOS_CREATE_PATH,
  APP_DROP_CREATE_PATH,
} from '@/lib/app-routes';
import { OS_INDEX_LEAVE_HREF } from '@/lib/os-leave';

/**
 * Leave-parent walk. Documents **current** dock Back targets.
 * Screens still own `backFallbackHref` / `onDockBack` — this is not a router.
 *
 * Verdicts:
 * - `matches` — follows the locked model (dock leave up, × is mode-close)
 * - `needs-decision` — possible intentional exception; do not change yet
 * - `mismatch` — loading / skeleton parent differs from the loaded place
 */
export type OsLeaveVerdict = 'matches' | 'needs-decision' | 'mismatch';

export type OsLeaveMapRow = {
  id: string;
  place: string;
  route: string;
  dockBack: boolean;
  /** Current leave parent, or null when this surface has no dock Back. */
  parent: string | null;
  /** Model parent when it differs from `parent`. */
  modelParent?: string;
  verdict: OsLeaveVerdict;
  note?: string;
};

export const OS_LEAVE_MAP = [
  {
    id: 'home',
    place: 'Home',
    route: APP_HOME_PATH,
    dockBack: false,
    parent: null,
    verdict: 'matches',
    note: 'Daily root. No dock Back.',
  },
  {
    id: 'groups-index',
    place: 'Guilds',
    route: APP_GROUPS_PATH,
    dockBack: true,
    parent: OS_INDEX_LEAVE_HREF,
    verdict: 'matches',
  },
  {
    id: 'hubs-index',
    place: 'Hubs',
    route: APP_APPS_PATH,
    dockBack: true,
    parent: OS_INDEX_LEAVE_HREF,
    verdict: 'matches',
  },
  {
    id: 'daos-index',
    place: 'DAOs',
    route: APP_DAOS_PATH,
    dockBack: true,
    parent: OS_INDEX_LEAVE_HREF,
    verdict: 'matches',
  },
  {
    id: 'market-index',
    place: 'Market',
    route: APP_MARKET_PATH,
    dockBack: true,
    parent: OS_INDEX_LEAVE_HREF,
    verdict: 'matches',
  },
  {
    id: 'drops-index',
    place: 'Drops',
    route: APP_DROPS_PATH,
    dockBack: true,
    parent: OS_INDEX_LEAVE_HREF,
    verdict: 'matches',
    note: 'Drops is an index. Market is the shop.',
  },
  {
    id: 'discover-index',
    place: 'Discover',
    route: APP_DISCOVER_PATH,
    dockBack: true,
    parent: OS_INDEX_LEAVE_HREF,
    verdict: 'matches',
  },
  {
    id: 'messages-index',
    place: 'Messages inbox',
    route: APP_MESSAGES_PATH,
    dockBack: true,
    parent: OS_INDEX_LEAVE_HREF,
    verdict: 'matches',
  },
  {
    id: 'messages-fallback',
    place: 'Messages Suspense fallback',
    route: APP_MESSAGES_PATH,
    dockBack: true,
    parent: OS_INDEX_LEAVE_HREF,
    verdict: 'matches',
  },
  {
    id: 'activity-index',
    place: 'Activity',
    route: APP_NOTIFICATIONS_PATH,
    dockBack: true,
    parent: OS_INDEX_LEAVE_HREF,
    verdict: 'matches',
  },
  {
    id: 'leaderboard',
    place: 'Leaderboard',
    route: APP_LEADERBOARD_PATH,
    dockBack: true,
    parent: OS_INDEX_LEAVE_HREF,
    verdict: 'matches',
    note: 'Sheet × closes the sheet; underlay dock leaves Home.',
  },
  {
    id: 'handoff',
    place: 'Handoff',
    route: APP_HANDOFF_PATH,
    dockBack: true,
    parent: OS_INDEX_LEAVE_HREF,
    verdict: 'matches',
  },
  {
    id: 'guild',
    place: 'Guild',
    route: '/groups/[groupId]',
    dockBack: true,
    parent: APP_GROUPS_PATH,
    verdict: 'matches',
  },
  {
    id: 'guild-create',
    place: 'Create guild',
    route: '/groups/create',
    dockBack: true,
    parent: APP_GROUPS_PATH,
    verdict: 'matches',
    note: 'Dirty dock Back asks first.',
  },
  {
    id: 'hub',
    place: 'Hub',
    route: '/apps/[appId]',
    dockBack: true,
    parent: APP_APPS_PATH,
    verdict: 'matches',
    note: 'Holder leave is the vault. Visitor leave is Hubs.',
  },
  {
    id: 'hub-create',
    place: 'Open a hub',
    route: APP_APP_CREATE_PATH,
    dockBack: true,
    parent: APP_APPS_PATH,
    verdict: 'matches',
    note: 'Dirty dock Back asks first.',
  },
  {
    id: 'dao-create',
    place: 'Create DAO',
    route: APP_DAOS_CREATE_PATH,
    dockBack: true,
    parent: APP_DAOS_PATH,
    verdict: 'matches',
    note: 'Dirty dock Back asks first.',
  },
  {
    id: 'drop-create',
    place: 'New drop',
    route: APP_DROP_CREATE_PATH,
    dockBack: true,
    parent: APP_DROPS_PATH,
    verdict: 'matches',
    note: 'Hub-bound leave is that hub. Studio × is Close studio only.',
  },
  {
    id: 'drop',
    place: 'Drop',
    route: '/collection/[collectionId]',
    dockBack: true,
    parent: APP_DROPS_PATH,
    verdict: 'matches',
    note: 'Visitor leave is Drops. Holder leave is the vault. Launcher lights Drops.',
  },
  {
    id: 'drop-loading',
    place: 'Drop loading / skeleton',
    route: '/collection/[collectionId]',
    dockBack: true,
    parent: APP_DROPS_PATH,
    verdict: 'matches',
    note: 'Route loading uses Drops. Client skeleton uses collectionDropBackHref.',
  },
  {
    id: 'series-loading',
    place: 'Series loading',
    route: '/series/[creatorId]/[seriesId]',
    dockBack: true,
    parent: APP_MARKET_PATH,
    verdict: 'matches',
    note: 'Visitor shop via seriesRouteLoadingBackHref (creator Market). Fallback Drops.',
  },
  {
    id: 'door-loading',
    place: 'Door / redeem loading',
    route: '/collection/[collectionId]/door',
    dockBack: true,
    parent: '/collection/[collectionId]',
    verdict: 'matches',
    note: 'collectionChildLeaveHref — the drop, else Drops.',
  },
  {
    id: 'collectibles-play-loading',
    place: 'Collectibles play loading',
    route: '/collectibles/play',
    dockBack: true,
    parent: '/@viewer/collectibles',
    verdict: 'matches',
    note: 'collectiblesPlayBackHref — vault when signed in, OS hop when not.',
  },
  {
    id: 'portfolio-face',
    place: 'Portfolio face',
    route: '/@[accountId]',
    dockBack: true,
    parent: APP_HOME_PATH,
    verdict: 'matches',
    note: 'FACE_DOCK_BACK. Overlays register the face as parent.',
  },
] as const satisfies readonly OsLeaveMapRow[];

export type OsLeaveMapId = (typeof OS_LEAVE_MAP)[number]['id'];

export function osLeaveRowsByVerdict(
  verdict: OsLeaveVerdict
): OsLeaveMapRow[] {
  return OS_LEAVE_MAP.filter((row) => row.verdict === verdict);
}

/** Indexes that leave to Home. */
export const OS_LEAVE_HOME_INDEX_IDS = [
  'groups-index',
  'hubs-index',
  'daos-index',
  'market-index',
  'drops-index',
  'discover-index',
  'messages-index',
  'activity-index',
  'leaderboard',
  'handoff',
] as const satisfies readonly OsLeaveMapId[];
