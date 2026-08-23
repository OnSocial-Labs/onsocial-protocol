import type { PageSection } from '@onsocial/sdk';
import type { PublicPageConfig } from '@/lib/page-data';
import {
  DEFAULT_PAGE_SECTIONS,
  PAGE_SECTION_LABELS,
  isPageSection,
} from '@/lib/page-sections';
import type { ProfileStoreShelf } from '@/lib/profile-store-types';

/** Chapters owners can reorder / hide in Customize. */
export const CUSTOMIZABLE_PAGE_SECTIONS: PageSection[] = [
  'posts',
  'store',
  'created',
  'groups',
  'links',
  'collectibles',
];

/** Max featured peeks per Launch chapter. */
export const PAGE_SECTION_PIN_MAX = 3;

/** Max length for a Launch link note. */
export const PAGE_LINK_NOTE_MAX = 60;

const CUSTOMIZABLE_SET = new Set<PageSection>(CUSTOMIZABLE_PAGE_SECTIONS);

export function isCustomizablePageSection(
  section: string
): section is PageSection {
  return CUSTOMIZABLE_SET.has(section as PageSection);
}

/** Ordered visible chapters for Customize draft (defaults when unset). */
export function resolveEditablePageSections(
  config: PublicPageConfig
): PageSection[] {
  const configured = (config.sections ?? [])
    .filter(isPageSection)
    .filter(isCustomizablePageSection);
  if (configured.length === 0) {
    return [...DEFAULT_PAGE_SECTIONS];
  }
  return configured;
}

/** Chapters available to re-enable when hidden. */
export function resolveHiddenCustomizableSections(
  visible: PageSection[]
): PageSection[] {
  const visibleSet = new Set(visible);
  return CUSTOMIZABLE_PAGE_SECTIONS.filter(
    (section) => !visibleSet.has(section)
  );
}

export function sanitizeSectionPins(
  pins: PublicPageConfig['sectionPins'] | undefined
): Partial<Record<PageSection, string[]>> {
  if (!pins || typeof pins !== 'object') {
    return {};
  }
  const next: Partial<Record<PageSection, string[]>> = {};
  for (const [key, value] of Object.entries(pins)) {
    if (!isPageSection(key) || !isCustomizablePageSection(key)) continue;
    if (!Array.isArray(value)) continue;
    const ids = value
      .map((id) => (typeof id === 'string' ? id.trim() : ''))
      .filter(Boolean)
      .slice(0, PAGE_SECTION_PIN_MAX);
    if (ids.length > 0) {
      next[key] = [...new Set(ids)];
    }
  }
  return next;
}

export function sanitizeLinkNotes(
  notes: PublicPageConfig['linkNotes'] | undefined
): Record<string, string> {
  if (!notes || typeof notes !== 'object') {
    return {};
  }
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(notes)) {
    const id = key.trim();
    if (!id || typeof value !== 'string') continue;
    const note = value.trim().slice(0, PAGE_LINK_NOTE_MAX);
    if (note) next[id] = note;
  }
  return next;
}

/** Drop titles for links that are no longer set. */
export function pruneLinkNotes(
  notes: PublicPageConfig['linkNotes'] | undefined,
  links: object
): Record<string, string> {
  const values = links as Record<string, unknown>;
  const sanitized = sanitizeLinkNotes(notes);
  const next: Record<string, string> = {};
  for (const [key, note] of Object.entries(sanitized)) {
    const value = values[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    next[key] = note;
  }
  return next;
}

export function linkNotesEqual(
  a: PublicPageConfig['linkNotes'] | undefined,
  b: PublicPageConfig['linkNotes'] | undefined
): boolean {
  const left = sanitizeLinkNotes(a);
  const right = sanitizeLinkNotes(b);
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

export function sectionPinsFor(
  config: PublicPageConfig,
  section: PageSection
): string[] {
  return sanitizeSectionPins(config.sectionPins)[section] ?? [];
}

/**
 * Stable featured-first order: pinned ids that exist, then the rest.
 * Drops unknown pins silently.
 */
export function preferPinnedOrder<T>(
  items: T[],
  pinnedIds: readonly string[],
  idOf: (item: T) => string
): T[] {
  if (items.length === 0 || pinnedIds.length === 0) {
    return items;
  }
  const byId = new Map(items.map((item) => [idOf(item), item]));
  const used = new Set<string>();
  const leading: T[] = [];
  for (const id of pinnedIds) {
    const hit = byId.get(id);
    if (!hit || used.has(id)) continue;
    leading.push(hit);
    used.add(id);
  }
  const rest = items.filter((item) => !used.has(idOf(item)));
  return [...leading, ...rest];
}

/** Featured pins first, then recency — cap at the Launch highlight slots. */
export function orderPagePostHighlights<T>(
  items: T[],
  pinnedIds: readonly string[],
  idOf: (item: T) => string,
  limit = 3
): T[] {
  return preferPinnedOrder(items, pinnedIds, idOf).slice(0, limit);
}

export function pageSectionCustomizeLabel(section: PageSection): string {
  return PAGE_SECTION_LABELS[section] ?? section;
}

export function toggleSectionPin(
  pins: string[],
  id: string,
  max = PAGE_SECTION_PIN_MAX
): string[] {
  const trimmed = id.trim();
  if (!trimmed) return pins;
  if (pins.includes(trimmed)) {
    return pins.filter((pin) => pin !== trimmed);
  }
  if (pins.length >= max) {
    return [...pins.slice(1), trimmed];
  }
  return [...pins, trimmed];
}

/** Stable pin id for a Store drop (collection). */
export function storeDropPinId(collectionId: string): string {
  return `drop:${collectionId.trim()}`;
}

/** Stable pin id for a Store listing. */
export function storeListingPinId(listingKey: string): string {
  return `listing:${listingKey.trim()}`;
}

export interface StorePinCandidate {
  id: string;
  label: string;
}

/** Pin pick list for Customize — drops first, then live listings. */
export function storeShelfPinCandidates(
  shelf: ProfileStoreShelf
): StorePinCandidate[] {
  const drops = shelf.drops.map((drop) => ({
    id: storeDropPinId(drop.collectionId),
    label: `Drop · ${drop.title}`,
  }));
  const listings = shelf.listings.map((listing) => ({
    id: storeListingPinId(listing.key),
    label: `For sale · ${listing.title}`,
  }));
  return [...drops, ...listings];
}

/** Reorder Store shelf peeks so pinned drops/listings lead their rails. */
export function orderStoreShelfByPins(
  shelf: ProfileStoreShelf,
  pinnedIds: readonly string[]
): ProfileStoreShelf {
  if (pinnedIds.length === 0) return shelf;
  return {
    ...shelf,
    drops: preferPinnedOrder(shelf.drops, pinnedIds, (drop) =>
      storeDropPinId(drop.collectionId)
    ),
    listings: preferPinnedOrder(shelf.listings, pinnedIds, (listing) =>
      storeListingPinId(listing.key)
    ),
  };
}
