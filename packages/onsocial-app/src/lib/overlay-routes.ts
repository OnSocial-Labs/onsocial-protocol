import {
  APP_DROPS_PATH,
  APP_HOME_PATH,
  COLLECTIBLES_SEARCH_PARAM,
  MARKET_KIND_PARAM,
  parseInAppDropLayerHref,
} from '@/lib/app-routes';
import {
  isProfileSearchQuery,
  normalizeProfileSearchQuery,
} from '@/lib/profile-account-search';
import {
  applyDiscoverTabParam,
  type DiscoverTab,
} from '@/features/discover/discover-tabs';
import {
  essayReturnSearch,
  parsePortfolioEssayFromParam,
  PORTFOLIO_ESSAY_FROM_PARAM,
  PORTFOLIO_ESSAY_PARAM,
  withEssayReturnSearch,
} from '@/lib/essay-return-href';
import { parseSourcePostPath } from '@/features/scarces/drop-writing';

export {
  essayReturnSearch,
  parsePortfolioEssayFromParam,
  parsePortfolioEssayParam,
  PORTFOLIO_ESSAY_FROM_PARAM,
  PORTFOLIO_ESSAY_PARAM,
  withEssayReturnSearch,
} from '@/lib/essay-return-href';

const ENDORSEMENT_FOCUS_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const OVERLAY_PANELS = [
  'discover',
  'about',
  'endorsements',
  'feed',
  'standing',
  'network',
  'collectibles',
  'writing',
] as const;

export type OverlayPanel = (typeof OVERLAY_PANELS)[number];

/** Portfolio panel URLs that always render as full pages — never the glass overlay. */
const FULL_PAGE_PORTFOLIO_PANELS = new Set<string>(['feed', 'collectibles']);

export type { StanceDetailKind } from '@/lib/profile-social-standings';
export { standingPath } from '@/lib/profile-social-standings';

export const PORTFOLIO_FEED_SECTION_ID = 'portfolio-feed';

export function portfolioPath(accountId: string): string {
  return `/@${encodeURIComponent(accountId)}`;
}

/** `/@id/writing/{postId}` — the article overlay, not the Writing shelf. */
export function parseWritingArticleHref(
  href: string | null | undefined
): { accountId: string; postId: string } | null {
  const from = parsePortfolioEssayFromParam(href);
  if (!from) return null;
  const pathname = from.split('?')[0] ?? '';
  const match = pathname.match(/^\/@([^/]+)\/writing\/([^/]+)\/?$/);
  if (!match) return null;
  try {
    const accountId = decodeURIComponent(match[1] ?? '').trim();
    const postId = decodeURIComponent(match[2] ?? '').trim();
    return accountId && postId ? { accountId, postId } : null;
  } catch {
    return null;
  }
}

/** Dock leave after a real-face hop — same overlay you left, not the shelf. */
export function essayLeaveHref(
  accountId: string,
  essayId: string,
  fromHref?: string | null
): string {
  const from = parsePortfolioEssayFromParam(fromHref);
  if (from) return from;
  return writingArticlePath(accountId, essayId);
}

/** Real face from an open article. Chevron returns to that same overlay. */
export function portfolioFromEssayPath(
  accountId: string,
  postId: string,
  fromHref?: string | null
): string {
  const id = postId.trim();
  if (!id) return portfolioPath(accountId);
  const params = new URLSearchParams();
  params.set(PORTFOLIO_ESSAY_PARAM, id);
  const from = parsePortfolioEssayFromParam(fromHref);
  if (from) params.set(PORTFOLIO_ESSAY_FROM_PARAM, from);
  return `${portfolioPath(accountId)}?${params.toString()}`;
}

/** Shareable owner sheets on the profile face (`?sheet=`). */
export const PORTFOLIO_SHEET_PARAM = 'sheet';

/** `?sheet=rally&season=<seasonId>` — opens that rally, including past ones. */
export const RALLY_SEASON_PARAM = 'season';

const RALLY_SEASON_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/i;

export function parseRallySeasonParam(
  raw: string | null | undefined
): string | null {
  const value = (raw ?? '').trim();
  return RALLY_SEASON_ID_PATTERN.test(value) ? value : null;
}

export type PortfolioShareSheetId = 'boost' | 'rally';

export function parsePortfolioSheetParam(
  raw: string | null | undefined
): PortfolioShareSheetId | null {
  const value = (raw ?? '').trim().toLowerCase();
  return value === 'boost' || value === 'rally' ? value : null;
}

/** Owner boost drawer on the profile face. */
export function portfolioBoostPath(accountId: string): string {
  return `${portfolioPath(accountId)}?${PORTFOLIO_SHEET_PARAM}=boost`;
}

/** Owner rally player on the profile face. */
export function portfolioRallyPath(accountId: string): string {
  return `${portfolioPath(accountId)}?${PORTFOLIO_SHEET_PARAM}=rally`;
}

/** Viewer rally player from Home (same `sheet=` key as wallet). */
export function homeRallyPath(seasonId?: string | null): string {
  const base = `${APP_HOME_PATH}?${PORTFOLIO_SHEET_PARAM}=rally`;
  const season = parseRallySeasonParam(seasonId);
  return season
    ? `${base}&${RALLY_SEASON_PARAM}=${encodeURIComponent(season)}`
    : base;
}

/** Viewer Boost sheet from Home — guest lock, same `sheet=` key as profile. */
export function homeBoostPath(): string {
  return `${APP_HOME_PATH}?${PORTFOLIO_SHEET_PARAM}=boost`;
}

/** After the gate connects, keep Boost / Rally intent on the owner page. */
export function gateContinuePath(
  accountId: string,
  search: string | URLSearchParams
): string {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search;
  const sheet = parsePortfolioSheetParam(params.get(PORTFOLIO_SHEET_PARAM));
  if (sheet === 'boost') return portfolioBoostPath(accountId);
  if (sheet === 'rally') return portfolioRallyPath(accountId);
  return portfolioPath(accountId);
}

/** One-shot deep link — opens the portfolio page drawer, hash is stripped after. */
export function portfolioFeedPath(accountId: string): string {
  return `${portfolioPath(accountId)}#${PORTFOLIO_FEED_SECTION_ID}`;
}

export function overlayPath(accountId: string, panel: OverlayPanel): string {
  return `${portfolioPath(accountId)}/${panel}`;
}

/**
 * Endorsements overlay. Received is the default (bare URL). Given is
 * `?mode=given` so face signals can land on the matching rail — same idea as
 * `/standing/incoming` vs `/standing/outgoing`.
 */
export function endorsementsPath(
  accountId: string,
  options?: { mode?: 'received' | 'given' | string | null }
): string {
  const base = overlayPath(accountId, 'endorsements');
  const mode = (options?.mode ?? '').toString().trim().toLowerCase();
  return mode === 'given' ? `${base}?mode=given` : base;
}

/**
 * Shareable endorsement focus on the person face — same idea as
 * `/@dao?proposal=12`. List stays the overlay peek; this query opens a sheet.
 */
export const ENDORSEMENT_FOCUS_PARAM = 'endorsement';
export const ENDORSEMENT_ISSUER_PARAM = 'issuer';
export const ENDORSEMENT_TOPIC_PARAM = 'topic';

export type PortfolioEndorsementFocus = {
  id: string | null;
  issuer: string | null;
  topic: string | null;
};

export function parsePortfolioEndorsementFocus(searchParams: {
  get(name: string): string | null;
}): PortfolioEndorsementFocus | null {
  const id = searchParams.get(ENDORSEMENT_FOCUS_PARAM)?.trim() || null;
  const issuer = searchParams.get(ENDORSEMENT_ISSUER_PARAM)?.trim() || null;
  const topic = searchParams.get(ENDORSEMENT_TOPIC_PARAM)?.trim() || null;
  if (!id && !issuer) return null;
  return { id, issuer, topic };
}

/** Face URL that opens the endorsement focus sheet. */
export function portfolioEndorsementPath(
  accountId: string,
  options?: {
    id?: string | null;
    issuer?: string | null;
    topic?: string | null;
  }
): string {
  const params = new URLSearchParams();
  const id = options?.id?.trim() || '';
  const issuer = options?.issuer?.trim() || '';
  const topic = options?.topic?.trim() || '';
  if (id) params.set(ENDORSEMENT_FOCUS_PARAM, id);
  const needsIssuer =
    Boolean(issuer) && (!id || ENDORSEMENT_FOCUS_UUID_PATTERN.test(id));
  if (needsIssuer) params.set(ENDORSEMENT_ISSUER_PARAM, issuer);
  if (topic && !id) params.set(ENDORSEMENT_TOPIC_PARAM, topic);
  const qs = params.toString();
  return qs ? `${portfolioPath(accountId)}?${qs}` : portfolioPath(accountId);
}

/** Legacy portal supporters links carried `endorsementId` — accept both keys. */
const LEGACY_ENDORSEMENT_ID_PARAM = 'endorsementId';

function firstSearchValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || null;
}

/**
 * Hard-load target for the bare `/endorsements` route. The list is a face
 * peek, so bounce to the portfolio — but forward a vouch deep link
 * (`?endorsement=`, or legacy portal `?endorsementId=`) so the focus sheet
 * still opens on the exact vouch.
 */
export function endorsementsHardLoadPath(
  accountId: string,
  search?: Record<string, string | string[] | undefined>
): string {
  const id =
    firstSearchValue(search?.[ENDORSEMENT_FOCUS_PARAM]) ??
    firstSearchValue(search?.[LEGACY_ENDORSEMENT_ID_PARAM]);
  const issuer = firstSearchValue(search?.[ENDORSEMENT_ISSUER_PARAM]);
  const topic = firstSearchValue(search?.[ENDORSEMENT_TOPIC_PARAM]);
  if (!id && !issuer) return portfolioPath(accountId);
  return portfolioEndorsementPath(accountId, { id, issuer, topic });
}

/** Held catalog for an account — Launch See all + OS vault when connected. */
export function portfolioCollectiblesPath(
  accountId: string,
  options?: { kind?: string | null; q?: string | null }
): string {
  const base = overlayPath(accountId, 'collectibles');
  const params = new URLSearchParams();
  const kind = options?.kind?.trim().toLowerCase() ?? '';
  if (kind && kind !== 'all') params.set(MARKET_KIND_PARAM, kind);
  const q = options?.q?.trim() ?? '';
  if (q) params.set(COLLECTIBLES_SEARCH_PARAM, q);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Shareable About page — overlay on soft nav, full page on hard refresh. */
export function aboutPath(accountId: string): string {
  return overlayPath(accountId, 'about');
}

/**
 * Standing orbit map. Always the full screen — the portal
 * `/u/:accountId/network` redirect lands here too.
 */
export function networkPath(
  accountId: string,
  options?: { filter?: string | null; q?: string | null }
): string {
  const base = overlayPath(accountId, 'network');
  const params = new URLSearchParams();
  const filter = options?.filter?.trim().toLowerCase() ?? '';
  if (filter === 'mutual' || filter === 'incoming' || filter === 'outgoing') {
    params.set('filter', filter);
  }
  const q = normalizeProfileSearchQuery(options?.q);
  if (isProfileSearchQuery(q)) {
    params.set('q', q);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Account id from `/@id/network`, or null when the path is another screen. */
export function networkAccountIdFromPath(pathname: string): string | null {
  const match = pathname.match(/\/@([^/]+)\/network\/?$/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** Account id from `/@id` and any screen under it. */
export function accountIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/@([^/]+)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** Author Writing shelf — titled longform posts. */
export function writingPath(accountId: string): string {
  return overlayPath(accountId, 'writing');
}

/** Real Writing shelf from an open article. Chevron returns to that reader. */
export function writingFromEssayPath(
  accountId: string,
  postId: string,
  fromHref?: string | null
): string {
  const marked = portfolioFromEssayPath(accountId, postId, fromHref);
  const query = marked.indexOf('?');
  return query === -1
    ? writingPath(accountId)
    : `${writingPath(accountId)}${marked.slice(query)}`;
}

function accountSegmentEquals(left: string, right: string): boolean {
  try {
    return (
      decodeURIComponent(left).toLowerCase() ===
      decodeURIComponent(right).toLowerCase()
    );
  } catch {
    return left.toLowerCase() === right.toLowerCase();
  }
}

/** Collectibles index, vault, or the face drawer — not the bare profile. */
export function collectiblesReturnHref(
  pathname: string | null | undefined,
  search?: string | URLSearchParams | null
): string | null {
  const bare = ((pathname ?? '').split('#')[0] ?? '').trim();
  const queryAt = bare.indexOf('?');
  const path = queryAt === -1 ? bare : bare.slice(0, queryAt);
  const inline = queryAt === -1 ? '' : bare.slice(queryAt + 1);
  if (!path) return null;
  if (path === '/collectibles' || path.startsWith('/collectibles/')) {
    return queryAt === -1 ? path : bare;
  }
  if (/^\/@[^/]+\/collectibles\/?$/.test(path)) {
    return queryAt === -1 ? path : bare;
  }
  const params =
    search instanceof URLSearchParams
      ? search
      : new URLSearchParams(
          typeof search === 'string'
            ? search.startsWith('?')
              ? search.slice(1)
              : search
            : inline
        );
  if (params.get('tab') === 'collection' && /^\/@[^/]+\/?$/.test(path)) {
    return `${path}?tab=collection`;
  }
  return null;
}

/** This author's face or Writing — the shelf's parent, not an outside opener. */
export function isAuthorPortfolioPlace(
  accountId: string,
  href: string | null | undefined
): boolean {
  const path = ((href ?? '').split('#')[0] ?? '').split('?')[0] ?? '';
  if (!path || !accountId.trim()) return false;
  const face = portfolioPath(accountId);
  if (path === face || path === `${face}/`) return true;
  return isAccountWritingPlace(accountId, path);
}

/** Drops index — Writing leave prefers this over a drop opened from it. */
export function dropsIndexReturnHref(
  href: string | null | undefined
): string | null {
  const bare = ((href ?? '').split('#')[0] ?? '').trim();
  const path = bare.split('?')[0] ?? '';
  if (path === APP_DROPS_PATH || path.startsWith(`${APP_DROPS_PATH}/`)) {
    return bare || APP_DROPS_PATH;
  }
  return null;
}

/** Collectibles or Drops — catalogs win over a drop in between. */
export function writingCatalogOpenerHref(
  href: string | null | undefined
): string | null {
  return collectiblesReturnHref(href) ?? dropsIndexReturnHref(href);
}

/**
 * Outside place that opened Writing — Drop, Collectibles, feed, …
 * Never an article, this shelf, or this face.
 */
export function writingOutsideOpenerHref(
  href: string | null | undefined,
  accountId: string
): string | null {
  const bare = ((href ?? '').split('#')[0] ?? '').trim();
  if (!bare) return null;
  const catalog = writingCatalogOpenerHref(bare);
  if (catalog) return catalog;
  if (parseWritingArticleHref(bare) || parseWritingArticlePathname(bare)) {
    return null;
  }
  if (isAuthorPortfolioPlace(accountId, bare)) return null;
  const path = bare.split('?')[0] ?? '';
  if (!path || path === '/') return null;
  return bare;
}

/**
 * Place that opened Writing.
 * Skip articles and the shelf. Prefer Collectibles / Drops over a drop
 * opened from that catalog. The face stops the walk.
 */
export function writingShelfOpenerHref(
  hrefs: readonly string[],
  accountId: string
): string | null {
  let dropOpener: string | null = null;
  for (let i = hrefs.length - 1; i >= 0; i--) {
    const href = hrefs[i]?.split('#')[0]?.trim() ?? '';
    if (!href) continue;
    const catalog = writingCatalogOpenerHref(href);
    if (catalog) return catalog;
    const opener = writingOutsideOpenerHref(href, accountId);
    if (opener) {
      if (parseInAppDropLayerHref(opener)) {
        dropOpener ??= opener;
        continue;
      }
      return opener;
    }
    const path = href.split('?')[0] ?? '';
    const face = portfolioPath(accountId);
    if (path === face || path === `${face}/`) return null;
  }
  return dropOpener;
}

/** Shelf URL that still returns to the place that opened the article. */
export function writingShelfHrefKeepingOpener(opts: {
  accountId: string;
  postId: string;
  pathname: string;
  search?: string | URLSearchParams | null;
  openerHref?: string | null;
}): string {
  const shelf = writingFromArticleHref(
    opts.accountId,
    opts.postId,
    opts.pathname,
    opts.search
  );
  const preferred =
    writingCatalogOpenerHref(opts.openerHref) ??
    writingOutsideOpenerHref(opts.openerHref, opts.accountId) ??
    writingCatalogOpenerHref(opts.pathname) ??
    writingOutsideOpenerHref(opts.pathname, opts.accountId);
  if (!preferred) {
    return withEssayReturnSearch(writingPath(opts.accountId), opts.search);
  }
  const query = shelf.includes('?') ? shelf.slice(shelf.indexOf('?') + 1) : '';
  const current = writingShelfBackHref(opts.accountId, query);
  const face = portfolioPath(opts.accountId);
  const currentCatalog = writingCatalogOpenerHref(current);
  const preferredCatalog = writingCatalogOpenerHref(preferred);
  // Keep a catalog already on the URL. Upgrade a drop to Collectibles / Drops.
  if (current !== face && currentCatalog && !preferredCatalog) return shelf;
  if (current !== face && !parseInAppDropLayerHref(current) && !preferredCatalog) {
    return shelf;
  }
  if (current === preferred) return shelf;
  const params = new URLSearchParams(essayReturnSearch(opts.search));
  params.set(PORTFOLIO_ESSAY_FROM_PARAM, preferred);
  return `${writingPath(opts.accountId)}?${params.toString()}`;
}

/**
 * Solid Writing dock Back from the URL alone.
 * Prefer {@link resolveWritingShelfLeaveHref} when the in-tab trail is known.
 */
export function writingShelfBackHref(
  accountId: string,
  search?: string | URLSearchParams | null
): string {
  const face = portfolioPath(accountId);
  if (!search) return face;
  const src =
    typeof search === 'string'
      ? new URLSearchParams(
          search.startsWith('?') ? search.slice(1) : search
        )
      : search;
  const from = parsePortfolioEssayFromParam(
    src.get(PORTFOLIO_ESSAY_FROM_PARAM)
  );
  return writingOutsideOpenerHref(from, accountId) ?? face;
}

/**
 * Writing dock leave — Collectibles / Drops win over a drop opened from them.
 */
export function resolveWritingShelfLeaveHref(
  accountId: string,
  search: string | URLSearchParams | null | undefined,
  trail: readonly string[]
): string {
  const face = portfolioPath(accountId);
  const marked = writingShelfBackHref(accountId, search);
  const fromTrail = writingShelfOpenerHref(trail, accountId);
  return (
    writingCatalogOpenerHref(fromTrail) ??
    writingCatalogOpenerHref(marked !== face ? marked : null) ??
    fromTrail ??
    (marked !== face ? marked : null) ??
    face
  );
}

/** The shelf itself, not an article on it. */
export function isWritingShelfPath(
  accountId: string,
  pathname: string | null | undefined
): boolean {
  const path = (pathname ?? '').split('?')[0] ?? '';
  const shelf = writingPath(accountId);
  return path === shelf || path === `${shelf}/`;
}

/** `usePathname()` on `/@id/writing/{postId}` — not essay `from` query parsing. */
export function parseWritingArticlePathname(
  pathname: string | null | undefined
): { accountId: string; postId: string } | null {
  const path = (pathname ?? '').split('?')[0] ?? '';
  const match = path.match(/^\/@([^/]+)\/writing\/([^/]+)\/?$/);
  if (!match?.[1] || !match[2]) return null;
  try {
    const accountId = decodeURIComponent(match[1]).trim();
    const postId = decodeURIComponent(match[2]).trim();
    return accountId && postId ? { accountId, postId } : null;
  } catch {
    return null;
  }
}

/** Already on this author's Writing shelf or one of their articles. */
export function isAccountWritingPlace(
  accountId: string,
  pathname: string | null | undefined
): boolean {
  const article = parseWritingArticlePathname(pathname);
  if (article) return accountSegmentEquals(article.accountId, accountId);
  const path = (pathname ?? '').split('?')[0] ?? '';
  return (
    path === writingPath(accountId) || path === `${writingPath(accountId)}/`
  );
}

/**
 * Writing in the byline: mark a return when leaving the reader,
 * or stay on this shelf when already in Writing.
 */
export function writingFromArticleHref(
  accountId: string,
  postId: string,
  pathname: string,
  search?: string | URLSearchParams | null
): string {
  if (isAccountWritingPlace(accountId, pathname)) {
    return withEssayReturnSearch(writingPath(accountId), search);
  }
  const opener =
    writingOutsideOpenerHref(
      collectiblesReturnHref(pathname, search) ?? pathname,
      accountId
    ) ?? null;
  return writingFromEssayPath(accountId, postId, opener);
}

/** Reader byline → author Writing shelf (listed post, folio, or shelf alone). */
export function authorWritingShelfHref(opts: {
  authorId?: string | null;
  sourcePostPath?: string | null;
  pathname?: string | null;
  search?: string | URLSearchParams | null;
  /** In-tab opener — Collectibles under a drop wins over the drop. */
  openerHref?: string | null;
}): string | null {
  const coords = parseSourcePostPath(opts.sourcePostPath ?? '');
  const author = (opts.authorId?.trim() || coords?.author || '').trim();
  if (!author) return null;
  if (coords) {
    return writingShelfHrefKeepingOpener({
      accountId: coords.author,
      postId: coords.postId,
      pathname: opts.pathname ?? '',
      search: opts.search,
      openerHref: opts.openerHref,
    });
  }
  const shelf = writingPath(author);
  const opener =
    writingCatalogOpenerHref(opts.openerHref) ??
    writingOutsideOpenerHref(opts.openerHref, author) ??
    writingOutsideOpenerHref(
      collectiblesReturnHref(opts.pathname, opts.search) ?? opts.pathname,
      author
    );
  if (!opener) return shelf;
  const params = new URLSearchParams();
  params.set(PORTFOLIO_ESSAY_FROM_PARAM, opener);
  return `${shelf}?${params.toString()}`;
}

/** One article on the Writing shelf. */
export function writingArticlePath(accountId: string, postId: string): string {
  return `${writingPath(accountId)}/${encodeURIComponent(postId)}`;
}

/** Discover hub href. Contextual entries can deep-link a tab (e.g. Profiles). */
export function discoverPath(
  accountId: string,
  options?: { q?: string | null; tab?: DiscoverTab }
): string {
  const base = overlayPath(accountId, 'discover');
  const params = new URLSearchParams();
  if (options?.tab) {
    applyDiscoverTabParam(params, options.tab);
  }
  const normalized = normalizeProfileSearchQuery(options?.q);
  if (isProfileSearchQuery(normalized)) {
    params.set('q', normalized);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export const OVERLAY_PANEL_LABELS: Record<OverlayPanel, string> = {
  discover: 'Discover',
  about: 'About',
  endorsements: 'Endorsements',
  feed: 'Feed',
  standing: 'Standing',
  network: 'Network',
  collectibles: 'Collectibles',
  writing: 'Writing',
};

export function panelLabel(panel: OverlayPanel): string {
  return OVERLAY_PANEL_LABELS[panel];
}

/** Stable key for cross-drawer swap + scroll cache (e.g. `standing:incoming`, `discover`). */
export function parseOverlayPanelKey(pathname: string): string | null {
  const standingMatch = pathname.match(
    /\/standing\/(incoming|outgoing|mutual)(?:\/|$|\?)/
  );
  if (standingMatch) {
    return `standing:${standingMatch[1]}`;
  }

  if (/\/standing(?:\/|$|\?)/.test(pathname)) {
    return 'standing:incoming';
  }

  const writingArticle = pathname.match(/\/writing\/([^/?#]+)(?:\/|$|\?)/);
  if (writingArticle?.[1]) {
    try {
      return `writing:${decodeURIComponent(writingArticle[1])}`;
    } catch {
      return `writing:${writingArticle[1]}`;
    }
  }
  if (/\/writing(?:\/|$|\?)/.test(pathname)) {
    return 'writing';
  }

  for (const panel of OVERLAY_PANELS) {
    if (panel === 'standing' || panel === 'writing') {
      continue;
    }
    if (new RegExp(`/${panel}(?:/|$|\\?)`).test(pathname)) {
      return panel;
    }
  }

  return null;
}

/** True when pathname is an open portfolio glass overlay (standing, discover, etc.). */
export function isPortfolioOverlayPath(pathname: string): boolean {
  const panelKey = parseOverlayPanelKey(pathname);
  if (panelKey == null) {
    return false;
  }
  if (FULL_PAGE_PORTFOLIO_PANELS.has(panelKey)) {
    return false;
  }
  // Article is a solid reader — not a glass panel.
  if (panelKey.startsWith('writing:')) {
    return false;
  }
  return true;
}

/** Intercepting @overlay slot is active (soft nav). Empty on hard refresh / default slot. */
export function isOverlayInterceptActive(
  overlaySegments: readonly string[]
): boolean {
  return overlaySegments.length > 0;
}

/** Main `[accountId]` child route is a full-page panel (hard refresh / direct URL). */
export function isFullPagePanelLayout(segments: readonly string[]): boolean {
  if (segments.length === 0) {
    return false;
  }

  const root = segments[0];
  if (root === 'standing' || root === 'posts') {
    return true;
  }

  return (OVERLAY_PANELS as readonly string[]).includes(root);
}

/**
 * Open the portfolio glass drawer only for soft-nav intercepts over the profile
 * page.
 *
 * Face peeks — endorsements and standing — stay overlay-only.
 * Reputation opens a short facts drawer on the face, not this glass sheet.
 * Feed opens the portfolio page drawer (`#portfolio-feed` one-shot signal);
 * hard refresh on `/feed` redirects to that anchor.
 *
 * Discover, About, and Writing list stay real pages on hard refresh
 * (full-page `children`, no glass). Articles are always a solid reader.
 * Collectibles vault is always PanelPage — drawer Collectibles tab is preview-only.
 */
export function shouldOpenPortfolioGlassOverlay(
  pathname: string,
  layoutSegments: readonly string[]
): boolean {
  const panelKey = parseOverlayPanelKey(pathname);
  if (panelKey == null) {
    return false;
  }

  if (FULL_PAGE_PORTFOLIO_PANELS.has(panelKey)) {
    return false;
  }

  if (panelKey.startsWith('writing:')) {
    return false;
  }

  return !isFullPagePanelLayout(layoutSegments);
}

export interface OverlayPanelChromeHint {
  ariaTitle: string;
  title?: string;
  /** Close only — the panel body is the title (About). */
  hideTitle?: boolean;
  expectsToolbar: boolean;
}

/** Route-derived chrome before panel providers register toolbar/title. */
export function resolveOverlayPanelChrome(
  panelKey: string | null
): OverlayPanelChromeHint | null {
  if (!panelKey) {
    return null;
  }

  if (panelKey.startsWith('standing:')) {
    return { ariaTitle: 'Standing', expectsToolbar: true };
  }

  if (panelKey === 'network') {
    return { ariaTitle: 'Network', expectsToolbar: true };
  }

  if (panelKey === 'discover') {
    return { ariaTitle: 'Discover', expectsToolbar: true };
  }

  if (panelKey === 'about') {
    return { ariaTitle: 'About', hideTitle: true, expectsToolbar: false };
  }

  if (panelKey === 'writing') {
    return { ariaTitle: 'Writing', hideTitle: true, expectsToolbar: false };
  }

  // `feed` never reaches glass chrome — it redirects into the page drawer.
  if ((OVERLAY_PANELS as readonly string[]).includes(panelKey)) {
    const label = panelLabel(panelKey as OverlayPanel);
    return { ariaTitle: label, title: label, expectsToolbar: false };
  }

  return null;
}
