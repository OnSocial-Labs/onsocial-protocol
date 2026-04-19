// ---------------------------------------------------------------------------
// Shared types for the pages edge function
// ---------------------------------------------------------------------------

export interface PageProfile {
  name?: string;
  bio?: string;
  avatar?: string;
  links?: Array<{ label: string; url: string }>;
  tags?: string[];
}

export type PageSection =
  | 'profile'
  | 'links'
  | 'support'
  | 'posts'
  | 'events'
  | 'collectibles'
  | 'badges'
  | 'groups';

export interface PageTheme {
  primary?: string;
  background?: string;
  text?: string;
  accent?: string;
}

export interface PageConfig {
  template?: string;
  theme?: PageTheme;
  sections?: PageSection[];
  tagline?: string;
  customCss?: string;
}

export interface PageStats {
  standingCount: number;
  postCount: number;
  badgeCount: number;
  groupCount: number;
}

export interface PageData {
  accountId: string;
  profile: PageProfile;
  config: PageConfig;
  stats: PageStats;
  recentPosts: unknown[];
  badges: unknown[];
}

export interface Env {
  GATEWAY_URL: string;
}
