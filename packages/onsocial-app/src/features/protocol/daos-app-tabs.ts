/** DAOs launcher tabs — Home = mine; Explore = proposals across mine. */

export type DaosAppTab = 'home' | 'explore';

export const DAOS_APP_TABS: readonly DaosAppTab[] = ['home', 'explore'];

export const DAOS_APP_TAB_PARAM = 'tab';

export function parseDaosAppTab(
  value: string | null | undefined
): DaosAppTab {
  const raw = value?.trim().toLowerCase() ?? '';
  if (raw === 'explore') return 'explore';
  return 'home';
}

export function daosAppTabLabel(tab: DaosAppTab): string {
  switch (tab) {
    case 'explore':
      return 'Explore';
    case 'home':
    default:
      return 'Home';
  }
}

/** `/daos` href for a tab (omit param for default Home). */
export function daosAppTabHref(tab: DaosAppTab): string {
  if (tab === 'home') return '/daos';
  return `/daos?${DAOS_APP_TAB_PARAM}=${tab}`;
}
