import type {
  PageAvatarMode,
  PageHeroSource,
  PublicPageConfig,
  ResolvedPageHero,
} from '@/lib/page-data';

export function resolvePageHeroSource(
  config: PublicPageConfig,
  avatarMode: PageAvatarMode
): PageHeroSource {
  const explicit = config.face?.heroSource;
  if (explicit === 'banner' || explicit === 'avatar' || explicit === 'none') {
    return explicit;
  }

  return avatarMode === 'cover' ? 'avatar' : 'banner';
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

/** Strip legacy `face.heroMedia` URLs from page config when persisting layout. */
export function sanitizePageFace(face: PublicPageConfig['face'] | undefined) {
  if (!face) {
    return face;
  }

  const { heroMedia: _legacy, ...rest } = face as PublicPageConfig['face'] & {
    heroMedia?: unknown;
  };
  return rest;
}
