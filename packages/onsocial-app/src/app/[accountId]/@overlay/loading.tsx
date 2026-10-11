'use client';

import { usePathname } from 'next/navigation';
import { StandingSheetOpening } from '@/components/panels/standing-sheet-opening';

/**
 * Standing paints its sheet immediately. Other overlays stay empty so a
 * shared fallback cannot flash over a profile that is already on screen.
 */
export default function OverlayLoading() {
  const pathname = usePathname() ?? '';
  if (!pathname.includes('/standing/')) return null;
  return <StandingSheetOpening />;
}
