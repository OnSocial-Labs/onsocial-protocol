'use client';

import { usePathname } from 'next/navigation';
import { StandingOverlaySheet } from '@/components/panels/standing-panel';
import { getStandingOpeningFace } from '@/components/panels/network-standing-handoff';
import { accountIdFromPath } from '@/lib/overlay-routes';
import { parseStandingKindFromPathname } from '@/lib/profile-social-standings';

/**
 * Shown while the standing list is still loading.
 * The sheet chrome is the same one a profile opens, with the name already
 * known from the map, instead of an empty page.
 */
export function StandingSheetOpening() {
  const pathname = usePathname() ?? '';
  const accountId = accountIdFromPath(pathname);
  const kind = parseStandingKindFromPathname(pathname) ?? 'incoming';
  if (!accountId) return null;
  const face = getStandingOpeningFace(accountId);

  return (
    <StandingOverlaySheet
      accountId={accountId}
      kind={kind}
      displayName={face?.displayName || accountId}
      avatarUrl={face?.avatarUrl ?? null}
      initialCounts={{ incoming: 0, outgoing: 0, mutual: 0 }}
      listPreview
    />
  );
}
