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

const PINNED_SONG_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Collection id pinned on the portfolio hero, or null. */
export function readPinnedSongId(config: PublicPageConfig): string | null {
  return normalizePinnedSongId(config.face?.songId);
}

export function normalizePinnedSongId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  if (!PINNED_SONG_ID.test(id)) return null;
  return id;
}

/** Strip legacy `face.heroMedia` URLs from page config when persisting layout. */
export function sanitizePageFace(face: PublicPageConfig['face'] | undefined) {
  if (!face) {
    return face;
  }

  const { heroMedia: _legacy, songId: rawSongId, ...rest } =
    face as PublicPageConfig['face'] & {
      heroMedia?: unknown;
    };
  const songId = normalizePinnedSongId(rawSongId);
  return songId ? { ...rest, songId } : rest;
}
