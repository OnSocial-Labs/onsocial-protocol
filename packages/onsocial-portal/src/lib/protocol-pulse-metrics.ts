/**
 * Protocol pulse fields exposed by `GET /graph/protocol-pulse` (via SDK
 * `os.query.stats.protocolPulse()`). Use this catalog to pick what each
 * surface displays.
 */

export interface ProtocolPulseSnapshot {
  generatedAt: string;
  windowHours: number;
  totals: {
    /** Distinct accounts with any indexed profile field (`profiles_current`). */
    profiles: number;
    /** Rows in `profile_search` (name, bio, avatar, or banner present). */
    discoverableProfiles?: number;
    /** Distinct groups with indexed config (`group_updates`). */
    groups: number;
  };
  recent24h: {
    posts: number;
    reactions?: number;
  };
}

export type ProtocolPulseMetricId =
  | 'indexedProfiles'
  | 'discoverableProfiles'
  | 'groups'
  | 'posts24h'
  | 'reactions24h';

export interface ProtocolPulseMetricDef {
  id: ProtocolPulseMetricId;
  /** Stat strip label */
  label: string | ((pulse: ProtocolPulseSnapshot) => string);
  value: (pulse: ProtocolPulseSnapshot) => number;
  /** Optional link (e.g. Discover) */
  href?: string;
  ariaLabel?: (pulse: ProtocolPulseSnapshot, formatted: string) => string;
}

/** All metrics available from pulse today (ops can expose more from full analytics). */
export const PROTOCOL_PULSE_METRIC_CATALOG: ProtocolPulseMetricDef[] = [
  {
    id: 'indexedProfiles',
    label: 'Profiles',
    value: (p) => p.totals.profiles,
    href: '/discover',
    ariaLabel: (_p, formatted) =>
      `Discover profiles — ${formatted} on the graph`,
  },
  {
    id: 'discoverableProfiles',
    label: 'Discoverable',
    value: (p) => p.totals.discoverableProfiles ?? p.totals.profiles,
    href: '/discover',
    ariaLabel: (_p, formatted) => `${formatted} complete profiles on Discover`,
  },
  {
    id: 'posts24h',
    label: (p) => `Posts ${p.windowHours}h`,
    value: (p) => p.recent24h.posts,
    ariaLabel: (_p, formatted) => `${formatted} posts in the last window`,
  },
  {
    id: 'reactions24h',
    label: (p) => `Reactions ${p.windowHours}h`,
    value: (p) => p.recent24h.reactions ?? 0,
    ariaLabel: (_p, formatted) => `${formatted} reactions in the last window`,
  },
  {
    id: 'groups',
    label: 'Groups',
    value: (p) => p.totals.groups,
    ariaLabel: (_p, formatted) => `${formatted} groups on the graph`,
  },
];

/** Home hero — network size + recent post activity (not discoverable). */
export const HERO_PROTOCOL_PULSE_METRICS: ProtocolPulseMetricId[] = [
  'indexedProfiles',
  'posts24h',
  'groups',
];

export function resolveProtocolPulseMetrics(
  ids: ProtocolPulseMetricId[]
): ProtocolPulseMetricDef[] {
  const byId = new Map(
    PROTOCOL_PULSE_METRIC_CATALOG.map((metric) => [metric.id, metric])
  );
  return ids
    .map((id) => byId.get(id))
    .filter((metric): metric is ProtocolPulseMetricDef => metric != null);
}

export function metricLabel(
  metric: ProtocolPulseMetricDef,
  pulse: ProtocolPulseSnapshot
): string {
  return typeof metric.label === 'function'
    ? metric.label(pulse)
    : metric.label;
}
