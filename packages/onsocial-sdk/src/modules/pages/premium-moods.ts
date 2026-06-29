import type {
  PageConfig,
  PageMoodUnlockRecord,
  PageMoodUnlocks,
} from '../../types.js';

/** Premium page mood ids — stored in `page/main.mood.id` when unlocked. */
export type PremiumPageMoodId =
  | 'summer'
  | 'gold'
  | 'glass'
  | 'carbon'
  | 'holographic'
  | 'broadsheet'
  | 'terminal'
  | 'signature';

export type PageMoodTier = 'free' | 'premium';

export type PageMoodPackKind = 'seasonal' | 'finish' | 'voice';

export interface PageMoodCatalogEntry {
  id: string;
  tier: PageMoodTier;
  packKind?: PageMoodPackKind;
  /** Closest free mood — used for signal-weight parity and picker context. */
  relatedFreeMood?: string;
  /** Whole SOCIAL amount (18-decimal token) as a decimal string, e.g. `"100"`. */
  priceSocial?: string;
  /** ISO date — picker hides after this; existing unlocks keep working. */
  availableUntil?: string;
}

export const PREMIUM_PAGE_MOOD_IDS = [
  'summer',
  'gold',
  'glass',
  'carbon',
  'holographic',
  'broadsheet',
  'terminal',
  'signature',
] as const satisfies readonly PremiumPageMoodId[];

/** SOCIAL token uses 18 decimals (`1 SOCIAL` = `10^18` yocto). */
export const SOCIAL_DECIMALS = 18;

/** Seasonal drops — lower barrier, time-boxed in picker. */
export const SEASONAL_MOOD_PRICE_SOCIAL = '100';
export const SUMMER_MOOD_PRICE_SOCIAL = SEASONAL_MOOD_PRICE_SOCIAL;

/** Evergreen finish packs — identity flex above seasonal. */
export const FINISH_MOOD_PRICE_SOCIAL = '250';
export const HOLOGRAPHIC_MOOD_PRICE_SOCIAL = '350';

/** Typography-led voice packs — distinct product tier. */
export const VOICE_MOOD_PRICE_SOCIAL = '300';
export const SIGNATURE_MOOD_PRICE_SOCIAL = '500';

/** social-spend action slug for premium page mood unlocks. */
export const PAGE_MOOD_UNLOCK_SPEND_ACTION = 'unlock_page_mood';

/** social-spend target type for premium page mood unlocks. */
export const PAGE_MOOD_UNLOCK_TARGET_TYPE = 'page_mood';

/** Default `app_id` for OnPage social-spend envelopes. */
export const ONPAGE_SOCIAL_SPEND_APP_ID = 'onpage';

export const PAGE_MOOD_PICKER_STORE_SECTIONS: ReadonlyArray<{
  title: string;
  ids: readonly PremiumPageMoodId[];
}> = [
  { title: 'Seasonal', ids: ['summer'] },
  { title: 'Finishes', ids: ['gold', 'glass', 'carbon', 'holographic'] },
  { title: 'Voices', ids: ['broadsheet', 'terminal', 'signature'] },
];

/** @deprecated Use {@link PAGE_MOOD_PICKER_STORE_SECTIONS}. */
export const PAGE_MOOD_PICKER_STORE_SECTION = {
  title: 'Store',
  ids: PREMIUM_PAGE_MOOD_IDS,
} as const;

export function isPremiumPageMoodId(value: string): value is PremiumPageMoodId {
  return (PREMIUM_PAGE_MOOD_IDS as readonly string[]).includes(value);
}

export function parsePageMoodUnlocks(config: PageConfig): PageMoodUnlocks {
  const raw = config.moodUnlocks;
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(raw).flatMap(([key, value]) => {
      if (!value || typeof value !== 'object') {
        return [];
      }
      const row = value as PageMoodUnlockRecord;
      if (typeof row.since !== 'number') {
        return [];
      }
      return [
        [
          key,
          {
            since: row.since,
            ...(typeof row.purchaseTxHash === 'string'
              ? { purchaseTxHash: row.purchaseTxHash }
              : {}),
          },
        ],
      ];
    })
  );
}

export function isPageMoodUnlocked(
  config: PageConfig,
  moodId: string,
  catalog: Record<string, PageMoodCatalogEntry>
): boolean {
  const entry = catalog[moodId];
  if (!entry || entry.tier === 'free') {
    return true;
  }
  return Boolean(parsePageMoodUnlocks(config)[moodId]);
}

export function assertCanApplyPageMood(
  config: PageConfig,
  moodId: string,
  catalog: Record<string, PageMoodCatalogEntry>,
  labelFor: (id: string) => string
): void {
  if (isPageMoodUnlocked(config, moodId, catalog)) {
    return;
  }

  const price = catalog[moodId]?.priceSocial;
  throw new Error(
    price
      ? `Unlock ${labelFor(moodId)} for ${price} SOCIAL before applying.`
      : 'Unlock this mood before applying.'
  );
}

export function mergePageMoodUnlockIntoPageConfig(
  current: PageConfig,
  moodId: PremiumPageMoodId,
  opts?: { purchaseTxHash?: string; now?: number }
): PageConfig {
  const unlocks = parsePageMoodUnlocks(current);
  if (unlocks[moodId]) {
    return current;
  }

  return {
    ...current,
    moodUnlocks: {
      ...unlocks,
      [moodId]: {
        since: opts?.now ?? Date.now(),
        ...(opts?.purchaseTxHash
          ? { purchaseTxHash: opts.purchaseTxHash }
          : {}),
      },
    },
  };
}

export function premiumMoodPriceYocto(priceSocial: string): string {
  const trimmed = priceSocial.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid SOCIAL price: ${priceSocial}`);
  }

  const [whole, frac = ''] = trimmed.split('.');
  if (frac.length > SOCIAL_DECIMALS) {
    throw new Error(
      `SOCIAL price has more than ${SOCIAL_DECIMALS} fractional digits: ${priceSocial}`
    );
  }

  const fracPadded = `${frac}${'0'.repeat(SOCIAL_DECIMALS)}`.slice(
    0,
    SOCIAL_DECIMALS
  );
  return `${whole}${fracPadded}`.replace(/^0+(?=\d)/, '') || '0';
}

export function isPremiumMoodAvailable(
  entry: PageMoodCatalogEntry,
  now = Date.now()
): boolean {
  if (!entry.availableUntil) {
    return true;
  }
  const until = Date.parse(entry.availableUntil);
  return Number.isFinite(until) && now <= until;
}
