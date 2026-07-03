import type { OsLauncherIconAccent } from '@onsocial/ui';

/** Portal-aligned launcher icon accents (season rail / nav group hues). */
const OS_APP_ACCENT_BY_ID: Record<string, OsLauncherIconAccent> = {
  home: 'blue',
  feed: 'purple',
  discover: 'blue',
  market: 'amber',
  groups: 'purple',
  boost: 'gold',
  protocol: 'blue',
  page: 'green',
  'my-page': 'green',
};

export function osAppAccent(appId: string): OsLauncherIconAccent {
  return OS_APP_ACCENT_BY_ID[appId] ?? 'blue';
}
