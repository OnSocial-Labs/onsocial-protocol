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

/** Fixed create-form errors. The stored sentence stays English. */
export const SHELL_CREATE_ERRORS: Record<string, string> = {
  'Use a JPG, PNG, or WebP image for the badge.': 'createError.badgeType',
  'Badge must be 5 MB or smaller.': 'createError.badgeSize',
  'Could not prepare that badge image.': 'createError.badgePrepare',
  'Use a JPG, PNG, or WebP image for the banner.': 'createError.bannerType',
  'Banner must be 5 MB or smaller.': 'createError.bannerSize',
  'Use a JPG, PNG, or WebP image for the logo.': 'createError.logoType',
  'Logo must be 5 MB or smaller.': 'createError.logoSize',
  'Could not prepare that logo image.': 'createError.logoPrepare',
  'Use a JPG, PNG, or WebP image for the crest.': 'createError.crestType',
  'Crest must be 5 MB or smaller.': 'createError.crestSize',
  'Could not prepare that crest image.': 'createError.crestPrepare',
  'Use a JPG, PNG, WebP, or GIF for the cover.': 'createError.coverType',
  'Cover must be 5 MB or smaller.': 'createError.coverSize',
  'That guild ID is taken — pick another.': 'createError.guildTaken',
  'Add a guild name and an ID with at least 3 characters.':
    'createError.guildRequired',
  'Pick or type a category for this hub.': 'createError.categoryRequired',
  'Fix the link fields before creating.': 'createError.linksInvalid',
  'That account id is taken — pick another.': 'createError.accountTaken',
  'Add a name and a valid account id.': 'createError.accountRequired',
  'Use a smaller image.': 'createError.smallerImage',
  'Token template is not ready.': 'createError.templateNotReady',
  'That name is taken — try another.': 'createError.nameTaken',
  'Still checking that account — try again in a moment.':
    'createError.stillChecking',
  'Enter a total supply greater than zero.': 'createError.supplyRequired',
};

const CREATE_ERROR_PATTERNS: Array<{
  re: RegExp;
  key: string;
  values: (match: RegExpMatchArray) => Record<string, number>;
}> = [
  {
    re: /^Guild name must be (\d+) characters or fewer\.$/,
    key: 'createError.guildNameLength',
    values: (match) => ({ max: Number(match[1]) }),
  },
  {
    re: /^Description must be (\d+) characters or fewer\.$/,
    key: 'createError.descriptionLength',
    values: (match) => ({ max: Number(match[1]) }),
  },
  {
    re: /^Hub ID must be at least (\d+) characters\.$/,
    key: 'createError.hubIdLength',
    values: (match) => ({ min: Number(match[1]) }),
  },
  {
    re: /^Commission must be between 0 and (\d+)%\.$/,
    key: 'createError.commissionRange',
    values: (match) => ({ max: Number(match[1]) }),
  },
  {
    re: /^Name must be (\d+) characters or fewer\.$/,
    key: 'createError.tokenNameLength',
    values: (match) => ({ max: Number(match[1]) }),
  },
  {
    re: /^Symbol must be (\d+) characters or fewer\.$/,
    key: 'createError.tokenSymbolLength',
    values: (match) => ({ max: Number(match[1]) }),
  },
];

export function shellCreateError(message: string): {
  key: string;
  values?: Record<string, number>;
} | null {
  const exact = SHELL_CREATE_ERRORS[message];
  if (exact) return { key: exact };
  for (const pattern of CREATE_ERROR_PATTERNS) {
    const match = message.match(pattern.re);
    if (match) return { key: pattern.key, values: pattern.values(match) };
  }
  return null;
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
