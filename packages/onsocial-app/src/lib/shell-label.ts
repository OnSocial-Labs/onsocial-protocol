import { osAppOpensWithWallet, type OsAppLink } from '@/lib/os-apps';

/** First-party launcher ids. Community tiles keep their own names. */
const SHELL_APP_IDS = new Set([
  'home',
  'activity',
  'messages',
  'discover',
  'market',
  'drops',
  'events',
  'collectibles',
  'groups',
  'hubs',
  'daos',
  'page',
]);

/** English fallbacks stored before render. Unknown errors pass through. */
export const SHELL_HOME_FALLBACKS: Record<string, string> = {
  'Could not load posts.': 'homeEmpty.loadPosts',
  'Could not load drops.': 'homeEmpty.loadDrops',
  'Couldn’t load proposals.': 'homeEmpty.loadProposals',
  'Could not load guilds.': 'homeEmpty.loadGuilds',
  'Could not load hubs.': 'homeEmpty.loadHubs',
  'Couldn’t load your DAOs.': 'homeEmpty.loadDaos',
};

export function shellHomeFallbackKey(message: string): string | undefined {
  return SHELL_HOME_FALLBACKS[message];
}

type ShellTranslate = (
  key: string,
  values?: Record<string, string | number>
) => string;

export function shellAppLabel(
  t: ShellTranslate,
  app: OsAppLink,
  openingPage: boolean
): string {
  if (osAppOpensWithWallet(app) && openingPage) {
    return t('account.opening');
  }
  const id = app.id === 'my-page' ? 'page' : app.id;
  if (SHELL_APP_IDS.has(id)) return t(`apps.${id}`);
  return app.label;
}
