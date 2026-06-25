import type { BuiltInPageMoodId } from '@onsocial/sdk';

/** Built-in mood ids. Custom / purchased moods extend this later. */
export type BuiltInMoodId = BuiltInPageMoodId;

export type MoodId = BuiltInMoodId | (string & {});

/** Active mood broadcast stored under `page/main.mood`. */
export interface PageMoodRecord {
  id: MoodId;
  since?: number;
  note?: string;
}

export type { PageMoodThemeTokens as MoodThemeTokens } from '@onsocial/sdk';

export interface MoodPreset {
  id: BuiltInMoodId;
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
