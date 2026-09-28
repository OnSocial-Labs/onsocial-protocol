import {
  PAGE_LINK_NOTE_MAX,
  sanitizeLinkNotes,
} from '@/lib/page-launch-config';
import {
  formatProfileLinkForEditor,
  normalizeWebsiteForDisplay,
  normalizeWebsiteInput,
} from '@/lib/profile-links';

/** First site stays `website`. Further sites are `site_2` … `site_12`. */
export const PORTFOLIO_WEBSITE_LIMIT = 12;

const EXTRA_SITE_KEY = /^site_(\d+)$/;

export interface PortfolioWebsiteDraft {
  id: string;
  url: string;
  name: string;
  line: string;
}

export function isPortfolioExtraSiteKey(key: string): boolean {
  const index = extraSiteIndex(key);
  return index != null;
}

function extraSiteIndex(key: string): number | null {
  const match = EXTRA_SITE_KEY.exec(key);
  if (!match) return null;
  const index = Number(match[1]);
  if (
    !Number.isInteger(index) ||
    index < 2 ||
    index > PORTFOLIO_WEBSITE_LIMIT
  ) {
    return null;
  }
  return index;
}

function isSiteStorageKey(key: string): boolean {
  return EXTRA_SITE_KEY.test(key);
}

export function portfolioWebsiteStorageKey(index: number): string {
  return index <= 0 ? 'website' : `site_${index + 1}`;
}

function linkRecord(links: unknown): Record<string, string> {
  if (!links || typeof links !== 'object' || Array.isArray(links)) {
    return {};
  }
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(links as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim()) {
      record[key] = value.trim();
    }
  }
  return record;
}

export function listStoredExtraWebsites(
  links: unknown
): Array<{ key: string; raw: string }> {
  return Object.entries(linkRecord(links))
    .flatMap(([key, raw]) => {
      const index = extraSiteIndex(key);
      if (index == null) return [];
      return [{ key, raw, index }];
    })
    .sort((a, b) => a.index - b.index)
    .map(({ key, raw }) => ({ key, raw }));
}

function displayWebsiteUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    return normalizeWebsiteForDisplay(trimmed);
  } catch {
    return trimmed;
  }
}

function blurb(
  map: Record<string, string> | null | undefined,
  key: string
): string {
  const value = map?.[key];
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, PAGE_LINK_NOTE_MAX);
}

/** Editor rows in face order: primary website, then `site_2`…. */
export function readPortfolioWebsites(
  links: unknown,
  notes?: Record<string, string> | null,
  lines?: Record<string, string> | null
): PortfolioWebsiteDraft[] {
  const record = linkRecord(links);
  const stored = [
    ...(record.website ? [{ key: 'website', raw: record.website }] : []),
    ...listStoredExtraWebsites(record),
  ];
  return stored.map((entry) => ({
    id: entry.key,
    url: displayWebsiteUrl(entry.raw),
    name: blurb(notes, entry.key),
    line: blurb(lines, entry.key),
  }));
}

function filledDrafts(rows: PortfolioWebsiteDraft[]): PortfolioWebsiteDraft[] {
  return rows.filter(
    (row) => row.url.trim() || row.name.trim() || row.line.trim()
  );
}

export function portfolioWebsitesUrlsEqual(
  next: PortfolioWebsiteDraft[],
  saved: PortfolioWebsiteDraft[]
): boolean {
  const left = filledDrafts(next).map((row) => displayWebsiteUrl(row.url));
  const right = filledDrafts(saved).map((row) => displayWebsiteUrl(row.url));
  if (left.length !== right.length) return false;
  return left.every((url, index) => url === right[index]);
}

export function portfolioWebsitesCopyEqual(
  next: PortfolioWebsiteDraft[],
  saved: PortfolioWebsiteDraft[]
): boolean {
  const left = filledDrafts(next).map(
    (row) => `${row.name.trim()}\n${row.line.trim()}`
  );
  const right = filledDrafts(saved).map(
    (row) => `${row.name.trim()}\n${row.line.trim()}`
  );
  if (left.length !== right.length) return false;
  return left.every((copy, index) => copy === right[index]);
}

/** Inline error for a website row. Blank rows are fine. */
export function portfolioWebsiteDraftError(
  row: PortfolioWebsiteDraft
): string | null {
  const url = row.url.trim();
  const name = row.name.trim();
  const line = row.line.trim();
  if (!url && !name && !line) return null;
  if (!url) return 'Add an address';
  const result = formatProfileLinkForEditor(url, 'website');
  if (!result.valid) return 'Invalid URL';
  return null;
}

function stripWebsiteKeys(
  record: Record<string, string>
): Record<string, string> {
  const next = { ...record };
  for (const key of Object.keys(next)) {
    if (key === 'website' || isSiteStorageKey(key)) {
      delete next[key];
    }
  }
  return next;
}

/**
 * Rewrite `website` + `site_*` from the editor list.
 * Social keys and any other stored keys stay. Blank rows are dropped.
 */
export function applyPortfolioWebsites(input: {
  links: Record<string, string>;
  notes: Record<string, string>;
  websites: PortfolioWebsiteDraft[];
}): {
  links: Record<string, string>;
  notes: Record<string, string>;
  lines: Record<string, string>;
} {
  const links = stripWebsiteKeys(input.links);
  const notes = stripWebsiteKeys({ ...sanitizeLinkNotes(input.notes) });
  const lines: Record<string, string> = {};
  const filled = filledDrafts(input.websites).slice(0, PORTFOLIO_WEBSITE_LIMIT);

  filled.forEach((row, index) => {
    const error = portfolioWebsiteDraftError(row);
    if (error) {
      throw new Error(error);
    }
    const key = portfolioWebsiteStorageKey(index);
    links[key] = normalizeWebsiteInput(row.url);
    const name = row.name.trim().slice(0, PAGE_LINK_NOTE_MAX);
    const line = row.line.trim().slice(0, PAGE_LINK_NOTE_MAX);
    if (name) notes[key] = name;
    if (line) lines[key] = line;
  });

  return {
    links,
    notes: sanitizeLinkNotes(notes),
    lines: sanitizeLinkNotes(lines),
  };
}
