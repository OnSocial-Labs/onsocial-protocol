/** Built-in mood ids. Custom / purchased moods extend this later. */
export type BuiltInMoodId =
  | 'default'
  | 'lead'
  | 'creative'
  | 'business'
  | 'celebration';

export type MoodId = BuiltInMoodId | (string & {});

/** Active mood broadcast stored under `page/main.mood`. */
export interface PageMoodRecord {
  id: MoodId;
  /** Unix ms when the mood was set. */
  since?: number;
  /** Optional short note, e.g. "heads down on the roadmap". */
  note?: string;
}

export interface MoodThemeTokens {
  background: string;
  text: string;
  muted: string;
  accent: string;
  banner: string;
  surface: string;
}

export interface MoodPreset {
  id: BuiltInMoodId;
  label: string;
  tagline: string;
  theme: MoodThemeTokens;
  /** When true, available without purchase (v1: all built-ins). */
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
