import type {
  PageAvatarMode,
  PageHeroSource,
  PublicPageConfig,
  ResolvedPageHero,
} from '@/lib/page-data';

/** Stored hero source on page config (defaults to banner). */
export function readPageHeroSourceExplicit(
  config: PublicPageConfig
): PageHeroSource {
  const explicit = config.face?.heroSource;
  if (explicit === 'banner' || explicit === 'avatar' || explicit === 'none') {
    return explicit;
  }

  return 'banner';
}

export function resolvePageHeroSource(
  config: PublicPageConfig,
  avatarMode: PageAvatarMode
): PageHeroSource {
  const explicit = config.face?.heroSource;
  if (explicit === 'none') {
    return 'none';
  }

  /* Cover always uses profile avatar for the hero square — no split circle/banner. */
  if (avatarMode === 'cover') {
    return 'avatar';
  }

  if (explicit === 'banner' || explicit === 'avatar') {
    return explicit;
  }

  return 'banner';
}

export function resolvePageFace(input: {
  config: PublicPageConfig;
  avatarMode: PageAvatarMode;
  avatarMedia: ResolvedPageHero | null;
  bannerMedia: ResolvedPageHero | null;
}): {
  hero: ResolvedPageHero | null;
  heroSource: PageHeroSource;
  isCoverLayout: boolean;
} {
  const { config, avatarMode, avatarMedia, bannerMedia } = input;
  const heroSource = resolvePageHeroSource(config, avatarMode);

  if (heroSource === 'none') {
    return { hero: null, heroSource, isCoverLayout: false };
  }

  const hero = heroSource === 'avatar' ? avatarMedia : bannerMedia;
  const isCoverLayout = avatarMode === 'cover';

  return {
    hero,
    heroSource,
    isCoverLayout: Boolean(isCoverLayout && hero),
  };
}

const PINNED_DROP_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Collection id for a pinned song, book, or issue. */
export function normalizePinnedDropId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  if (!PINNED_DROP_ID.test(id)) return null;
  return id;
}

/** Track index that plays first. Track one is stored as omitted. */
export function normalizeSongStart(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return null;
  if (raw < 1 || raw > 98) return null;
  return raw;
}

export function normalizePinnedSongId(raw: unknown): string | null {
  return normalizePinnedDropId(raw);
}

/** Audio collection pinned on the portfolio, or null. */
export function readPinnedSongId(config: PublicPageConfig): string | null {
  return normalizePinnedDropId(config.face?.songId);
}

/** Opening track for the pinned song. Null means the first track. */
export function readPinnedSongStart(config: PublicPageConfig): number | null {
  if (!readPinnedSongId(config)) return null;
  return normalizeSongStart(config.face?.songStart);
}

/** Book or issue collection pinned on the portfolio, or null. */
export function readPinnedBookId(config: PublicPageConfig): string | null {
  return normalizePinnedDropId(config.face?.bookId);
}

/** Strip legacy `face.heroMedia` URLs from page config when persisting layout. */
export function sanitizePageFace(face: PublicPageConfig['face'] | undefined) {
  if (!face) {
    return face;
  }

  const {
    heroMedia: _legacy,
    songId: rawSongId,
    bookId: rawBookId,
    songStart: rawSongStart,
    ...rest
  } = face as PublicPageConfig['face'] & {
    heroMedia?: unknown;
  };
  const songId = normalizePinnedDropId(rawSongId);
  const bookId = normalizePinnedDropId(rawBookId);
  const songStart = songId ? normalizeSongStart(rawSongStart) : null;
  return {
    ...rest,
    ...(songId ? { songId } : {}),
    ...(bookId ? { bookId } : {}),
    ...(songStart != null ? { songStart } : {}),
  };
}
