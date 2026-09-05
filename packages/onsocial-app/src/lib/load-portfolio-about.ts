import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { PortfolioAboutPanelProps } from '@/components/portfolio/portfolio-about-panel';
import {
  loadPortfolioDaoContextWithProfile,
  type PortfolioDaoEntity,
} from '@/lib/load-dao-page';
import { resolvePortfolioMood } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import { fetchPublicPageData } from '@/lib/page-data';
import { resolvePortfolioAboutBio } from '@/lib/profile-bio-face';
import { displayName } from '@/lib/profile-display';
import { loadProfileShell } from '@/lib/profile-shell';
import { resolveAccountId } from '@/lib/resolve-account';

export type PortfolioAboutPageData = {
  accountId: string;
  titleLabel: string;
  aboutBio: string | null;
  mood: ResolvedMood;
  panel: PortfolioAboutPanelProps;
  daoEntity: PortfolioDaoEntity;
};

export const loadPortfolioAboutForAccount = cache(
  async (accountId: string): Promise<PortfolioAboutPageData> => {
    const data = await fetchPublicPageData(accountId);
    if (!data) {
      notFound();
    }

    const mood = resolvePortfolioMood(data.config);
    const shellPromise = loadProfileShell(accountId);
    const [shell, daoContext] = await Promise.all([
      shellPromise,
      shellPromise.then((profileShell) =>
        loadPortfolioDaoContextWithProfile(accountId, profileShell)
      ),
    ]);
    const { entity: daoEntity, page: daoPage } = daoContext;
    const profileName = shell?.name ?? daoPage?.branding.name ?? null;
    const titleLabel = displayName(accountId, profileName ?? undefined);
    const aboutBio = resolvePortfolioAboutBio({
      shellBio: shell?.bio,
      shellAbout: shell?.about,
      daoDescription: daoPage?.branding.description,
      daoPurpose: daoPage?.configPurpose,
    });

    return {
      accountId,
      titleLabel,
      aboutBio,
      mood,
      daoEntity,
      panel: {
        accountId,
        profileName,
        bio: shell?.bio ?? null,
        about: shell?.about ?? null,
        lead: shell?.lead ?? null,
        aboutAlign: shell?.aboutAlign ?? 'left',
        tags: shell?.tags ?? [],
        photos: shell?.photos ?? [],
        isDao: daoEntity.isDao,
        profileKind: shell?.kind ?? null,
        industry: shell?.industry ?? null,
      },
    };
  }
);

export async function loadPortfolioAboutPage(
  params: Promise<{ accountId: string }>
): Promise<PortfolioAboutPageData> {
  const accountId = await resolveAccountId(params);
  return loadPortfolioAboutForAccount(accountId);
}
