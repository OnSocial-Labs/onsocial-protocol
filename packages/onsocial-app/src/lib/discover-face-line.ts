import type { OnSocial } from '@onsocial/sdk';

/** One quiet directory line: `Brand identity`, or `Brand identity · 2`. */
export function discoverFaceLine(
  title: string | null | undefined,
  count: number
): string | null {
  const lead = (title ?? '').replace(/\s+/g, ' ').trim();
  if (!lead) return null;
  const total = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  if (total > 1) return `${lead} · ${total}`;
  return lead;
}

/** First non-empty title for each account. Later rows keep that title. */
export function leadTitleByAccount(
  rows: readonly { accountId: string; title: string }[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const id = row.accountId.trim().toLowerCase();
    const title = row.title.replace(/\s+/g, ' ').trim();
    if (!id || !title || out[id]) continue;
    out[id] = title;
  }
  return out;
}

export function withDiscoverFaceLines<
  T extends {
    accountId: string;
    offerCount?: number;
    openJobsCount?: number;
  },
>(
  profiles: readonly T[],
  titles: Record<string, string>,
  face: 'offers' | 'hiring'
): T[] {
  return profiles.map((profile) => {
    const title = titles[profile.accountId.trim().toLowerCase()];
    const known =
      face === 'offers' ? profile.offerCount : profile.openJobsCount;
    const count = typeof known === 'number' && known > 0 ? known : 1;
    const faceLine = discoverFaceLine(title, count);
    if (!faceLine) return profile;
    return { ...profile, faceLine };
  });
}

export async function loadDiscoverFaceTitles(
  os: OnSocial,
  accountIds: string[],
  face: 'offers' | 'hiring'
): Promise<Record<string, string>> {
  const rows =
    face === 'offers'
      ? await os.query.offers.leadTitles(accountIds)
      : await os.query.jobs.leadTitles(accountIds);
  return leadTitleByAccount(rows);
}
