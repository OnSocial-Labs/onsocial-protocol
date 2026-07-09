import { normalizeSocialTimestamp } from '@onsocial/ui';

export interface PageDrawerMeta {
  /** Display name for the drawer title line. */
  name: string;
  /** First profile write timestamp (ms or ns — normalized in formatters). */
  joinedAt: number | null;
  /** Most recent profile field write (omit when same day as joined). */
  updatedAt: number | null;
  /** Human labels for fields in the latest profile write — e.g. Name · Banner. */
  updatedFields: string[];
  postCount: number;
  guildCount: number;
  /** Scarces this account has minted (indexed events). */
  scarceMintCount: number;
  /** Quiet protocol role labels — e.g. Guardian, Council. */
  daoRoleLabels: string[];
  tags: string[];
}

export function formatPageDrawerJoinedLabel(
  timestamp?: number | null
): string | null {
  const ms = normalizeSocialTimestamp(timestamp);
  if (!ms) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
  }).format(new Date(ms));
}

/** Full calendar date for the joined facts sheet. */
export function formatPageDrawerJoinedFullLabel(
  timestamp?: number | null
): string | null {
  const ms = normalizeSocialTimestamp(timestamp);
  if (!ms) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(ms));
}

export function formatCompactCount(count: number): string {
  const n = Math.floor(count);
  if (!Number.isFinite(n) || n <= 0) {
    return '0';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: Math.abs(n) >= 1000 && Math.abs(n) < 100_000 ? 1 : 0,
    notation: Math.abs(n) >= 1000 ? 'compact' : 'standard',
  }).format(n);
}

export function formatCountLabel(
  count: number,
  singular: string,
  plural: string
): string | null {
  if (!Number.isFinite(count) || count <= 0) {
    return null;
  }
  const n = Math.floor(count);
  const unit = n === 1 ? singular : plural;
  return `${formatCompactCount(n)} ${unit}`;
}

export interface PageDrawerCountPart {
  key: string;
  count: string;
  unit: string;
}

/** Non-joined activity chips for the compact meta row. */
export function pageDrawerActivityParts(meta: {
  postCount: number;
  guildCount: number;
  scarceMintCount: number;
}): PageDrawerCountPart[] {
  const parts: PageDrawerCountPart[] = [];

  const push = (key: string, count: number, singular: string, plural: string) => {
    if (!Number.isFinite(count) || count <= 0) {
      return;
    }
    const n = Math.floor(count);
    parts.push({
      key,
      count: formatCompactCount(n),
      unit: n === 1 ? singular : plural,
    });
  };

  push('posts', meta.postCount, 'post', 'posts');
  push('guilds', meta.guildCount, 'guild', 'guilds');
  push('scarces', meta.scarceMintCount, 'scarce', 'scarces');
  return parts;
}

/** @deprecated Prefer `pageDrawerActivityParts` + interactive Joined. */
export function formatPageDrawerActivityLine(meta: {
  postCount: number;
  guildCount: number;
  scarceMintCount: number;
  joinedAt: number | null;
}): string | null {
  const parts = pageDrawerActivityParts(meta).map(
    (part) => `${part.count} ${part.unit}`
  );
  const joined = formatPageDrawerJoinedLabel(meta.joinedAt);
  if (joined) {
    parts.push(`Joined ${joined}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** DAO / protocol roles only — reputation score stays on the face. */
export function formatPageDrawerCredentialsLine(meta: {
  daoRoleLabels: string[];
}): string | null {
  const parts = meta.daoRoleLabels
    .map((label) => label.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function formatDaoRoleLabel(roleId: string): string {
  const id = roleId.trim().toLowerCase();
  if (id === 'guardians') return 'Guardian';
  if (id === 'council') return 'Council';
  if (!id) return '';
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export function sortDaoRoleIds(roleIds: string[]): string[] {
  const order = ['guardians', 'council'];
  return [...new Set(roleIds.map((id) => id.trim()).filter(Boolean))].sort(
    (left, right) => {
      const leftRank = order.indexOf(left.toLowerCase());
      const rightRank = order.indexOf(right.toLowerCase());
      const leftOrder = leftRank === -1 ? Number.MAX_SAFE_INTEGER : leftRank;
      const rightOrder = rightRank === -1 ? Number.MAX_SAFE_INTEGER : rightRank;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left.localeCompare(right);
    }
  );
}

const PROFILE_UPDATE_FIELDS = new Set([
  'name',
  'bio',
  'avatar',
  'banner',
  'links',
  'tags',
]);

const PROFILE_FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  bio: 'Bio',
  avatar: 'Avatar',
  banner: 'Banner',
  links: 'Links',
  tags: 'Tags',
};

export interface ProfileFieldUpdateRow {
  field: string;
  blockHeight: number;
  blockTimestamp: number;
  operation?: string;
}

export function profileUpdateFieldLabel(field: string): string {
  const key = field.trim().toLowerCase();
  if (PROFILE_FIELD_LABELS[key]) {
    return PROFILE_FIELD_LABELS[key];
  }
  return key
    .replace(/[_-]+/gu, ' ')
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

/** Fields touched in the latest profile write — Portal-parity, capped. */
export function resolveLatestProfileUpdateFields(
  rows: ProfileFieldUpdateRow[],
  options: { max?: number } = {}
): { updatedAt: number | null; fields: string[] } {
  const max = options.max ?? 4;
  const displayRows = rows.filter((row) =>
    PROFILE_UPDATE_FIELDS.has(row.field.trim().toLowerCase())
  );
  if (displayRows.length === 0) {
    return { updatedAt: null, fields: [] };
  }

  const latestBlockHeight = Math.max(
    ...displayRows.map((row) => Number(row.blockHeight) || 0)
  );
  const latestTimestamp = Math.max(
    ...displayRows
      .filter((row) => Number(row.blockHeight) === latestBlockHeight)
      .map((row) => Number(row.blockTimestamp) || 0)
  );

  const fields = Array.from(
    new Set(
      displayRows
        .filter(
          (row) =>
            Number(row.blockHeight) === latestBlockHeight &&
            Number(row.blockTimestamp) === latestTimestamp
        )
        .map((row) => profileUpdateFieldLabel(row.field))
    )
  );

  const shown = fields.slice(0, max);
  const overflow = fields.length - shown.length;
  if (overflow > 0) {
    shown.push(`+${overflow}`);
  }

  return {
    updatedAt: latestTimestamp > 0 ? latestTimestamp : null,
    fields: shown,
  };
}

/** Hide Updated when it is the same calendar day as Joined (first write). */
export function shouldShowProfileUpdated(
  joinedAt: number | null,
  updatedAt: number | null
): boolean {
  const joinedMs = normalizeSocialTimestamp(joinedAt);
  const updatedMs = normalizeSocialTimestamp(updatedAt);
  if (!updatedMs) {
    return false;
  }
  if (!joinedMs) {
    return true;
  }
  const joinedDay = new Date(joinedMs).toDateString();
  const updatedDay = new Date(updatedMs).toDateString();
  return joinedDay !== updatedDay;
}

export function formatPageDrawerUpdatedFieldsLine(
  fields: string[]
): string | null {
  const parts = fields.map((field) => field.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}
