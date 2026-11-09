'use client';

import { useTranslations } from 'next-intl';

/** Face chip. One offer stays Offers; a longer list adds the count. */
export function useOfferFaceLabel(count: number): string {
  const t = useTranslations('shell');
  if (count <= 1) return t('discover.offers');
  return t('profileFace.offersCount', { count });
}

/** Face chip. One role stays Hiring; a longer list adds the count. */
export function useHiringFaceLabel(count: number): string {
  const t = useTranslations('shell');
  if (count <= 1) return t('discover.hiring');
  return t('profileFace.hiringCount', { count });
}

export function useOfferViewAria(count: number): string {
  const t = useTranslations('shell');
  if (count <= 1) return t('profileFace.viewOffers');
  return t('profileFace.viewOffersCount', { count });
}

export function useHiringViewAria(count: number): string {
  const t = useTranslations('shell');
  if (count <= 1) return t('profileFace.viewRole');
  return t('profileFace.viewRoles', { count });
}
