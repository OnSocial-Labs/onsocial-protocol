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
