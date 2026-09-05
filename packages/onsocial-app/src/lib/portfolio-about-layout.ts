import { resolveStoredProfileFaceAbout } from '@/lib/profile-bio-face';
import {
  profileAboutBlocks,
  type ProfileAboutBlock,
} from '@/lib/profile-bio-rich';
import {
  profileKindShowsIndustry,
  type ProfileKind,
} from '@onsocial/sdk';

export type PortfolioAboutStill = {
  url: string;
  alt: string;
};

export function aboutStillAlt(
  name: string,
  index: number,
  total: number
): string {
  const label = name.trim() || 'Photo';
  if (total <= 1) return label;
  return `${label}, ${index + 1} of ${total}`;
}

/**
 * Studio stills — About photos only. First is the print, the rest are the film.
 * Face avatar stays on the face. No print if there are no stills.
 */
export function resolvePortfolioAboutStills(opts: {
  titleLabel: string;
  photos?: { url: string }[] | null;
}): {
  print: PortfolioAboutStill | null;
  film: PortfolioAboutStill[];
  viewer: PortfolioAboutStill[];
} {
  const urls = (opts.photos ?? [])
    .map((photo) => photo.url.trim())
    .filter(Boolean);
  const viewer = urls.map((url, index) => ({
    url,
    alt: aboutStillAlt(opts.titleLabel, index, urls.length),
  }));
  return {
    print: viewer[0] ?? null,
    film: viewer.slice(1),
    viewer,
  };
}

/**
 * Split keys: face bio vs More for About.
 * The panel only paints face bio as a soft lede when the room would otherwise
 * have no words (see {@link shouldShowPortfolioAboutFaceLede}).
 */
export function resolvePortfolioAboutCopy(opts: {
  bio?: string | null;
  about?: string | null;
}): {
  intro: ProfileAboutBlock[];
  rest: ProfileAboutBlock[];
  essay: ProfileAboutBlock[];
} {
  const { face, about } = resolveStoredProfileFaceAbout(opts.bio, opts.about);
  const essaySource = [face, about].filter((part) => part.trim()).join('\n');
  return {
    intro: profileAboutBlocks(face),
    rest: profileAboutBlocks(about),
    essay: profileAboutBlocks(essaySource),
  };
}

/**
 * Film lead — centered above the 2nd/3rd stills (not above the print).
 * Own field (`profile/lead`); independent of More for About headings.
 */
export function resolvePortfolioAboutFilmLead(opts: {
  lead?: string | null;
  filmCount: number;
}): string | null {
  if (opts.filmCount <= 0) return null;
  return opts.lead?.trim() || null;
}

/** Closer into Launch — only when About has a story or stills. */
export function shouldShowPortfolioAboutWork(opts: {
  hasEssay: boolean;
  stillCount: number;
}): boolean {
  return opts.hasEssay || opts.stillCount > 0;
}

/**
 * Studio masthead always carries the name — overlay and hard-refresh alike.
 * Face already showed it once; here it’s a quiet lockup — name, then crafts
 * (person) or industry (org / DAO) — not a second hero.
 */
export function shouldShowPortfolioAboutName(): boolean {
  return true;
}

/**
 * Quiet house-sector line under the About name. Same visual slot as crafts.
 * Only the set industry — never the face “Organization” fallback.
 * Live About opens Orgs · industry or DAOs · industry, not Hiring.
 */
export function resolvePortfolioAboutIndustryLabel(opts: {
  kind?: ProfileKind | null;
  industry?: string | null;
}): string | null {
  if (!profileKindShowsIndustry(opts.kind)) return null;
  return opts.industry?.trim() || null;
}

/**
 * Face bio lives on the face. Only echo it on About when there is no
 * continuation and no stills — soft words so an empty room isn’t blank.
 */
export function shouldShowPortfolioAboutFaceLede(opts: {
  hasContinuation: boolean;
  stillCount: number;
}): boolean {
  return !opts.hasContinuation && opts.stillCount === 0;
}
