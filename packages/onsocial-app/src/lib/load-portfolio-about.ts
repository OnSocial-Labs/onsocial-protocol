import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { PortfolioAboutPanelProps } from '@/components/portfolio/portfolio-about-panel';
import {
  loadPortfolioDaoContextWithProfile,
  type PortfolioDaoEntity,
} from '@/lib/load-dao-page';
import { resolvePortfolioMood } from '@/lib/moods/resolve';
import { fetchPublicPageData } from '@/lib/page-data';
import { resolvePortfolioAboutBio } from '@/lib/profile-bio-face';
import { displayName } from '@/lib/profile-display';
import { loadProfileShell } from '@/lib/profile-shell';
import { resolveAccountId } from '@/lib/resolve-account';

export type PortfolioAboutPageData = {
  accountId: string;
  titleLabel: string;
  aboutBio: string | null;
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
      daoDescription: daoPage?.branding.description,
      daoPurpose: daoPage?.configPurpose,
    });

    return {
      accountId,
      titleLabel,
      aboutBio,
      daoEntity,
      panel: {
        accountId,
        profileName,
        bio: aboutBio,
        tags: shell?.tags ?? [],
        photos: shell?.photos ?? [],
        avatarUrl: shell?.avatarUrl ?? daoPage?.branding.avatarUrl ?? null,
        mood,
        isDao: daoEntity.isDao,
        profileKind: shell?.kind ?? null,
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
