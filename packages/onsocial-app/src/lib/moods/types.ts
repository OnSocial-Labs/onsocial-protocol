import type { BuiltInPageMoodId, PageMoodId, PremiumPageMoodId } from '@onsocial/sdk';

/** Built-in mood ids. */
export type BuiltInMoodId = BuiltInPageMoodId;

export type PremiumMoodId = PremiumPageMoodId;

/** Built-in + premium mood ids, or unknown stored ids before catalog match. */
export type MoodId = PageMoodId | (string & {});

/** Active mood broadcast stored under `page/main.mood`. */
export interface PageMoodRecord {
  id: string;
  since?: number;
  note?: string;
}

export type { PageMoodThemeTokens as MoodThemeTokens } from '@onsocial/sdk';

export interface MoodPreset {
  id: PageMoodId;
  label: string;
  tagline: string;
  theme: import('@onsocial/sdk').PageMoodThemeTokens;
  included: boolean;
}

export interface ResolvedMood {
  id: MoodId;
  label: string;
  tagline: string;
  since: number | null;
  note: string | null;
  cssVars: Record<string, string>;
}
