import type { OsLauncherIconAccent } from '@onsocial/ui';

/** Portal-aligned launcher icon accents (season rail / nav group hues). */
const OS_APP_ACCENT_BY_ID: Record<string, OsLauncherIconAccent> = {
  home: 'blue',
  activity: 'gold',
  messages: 'blue',
  discover: 'blue',
  market: 'amber',
  drops: 'purple',
  events: 'gold',
  collectibles: 'green',
  hubs: 'purple',
  /** @deprecated alias — prefer `hubs` */
  stores: 'purple',
  groups: 'purple',
  daos: 'blue',
  boost: 'gold',
  protocol: 'blue',
  page: 'green',
  'my-page': 'green',
};

export function osAppAccent(appId: string): OsLauncherIconAccent {
  return OS_APP_ACCENT_BY_ID[appId] ?? 'blue';
}
