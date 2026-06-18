'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/layout/page-shell';
import { ProfileModal } from '@/components/profile-modal';
import { useProfile } from '@/contexts/profile-context';
import { useWallet } from '@/contexts/wallet-context';
import { useNavBack } from '@/hooks/use-nav-back';
import { usePageNavBadge } from '@/hooks/use-page-nav-badge';
import { formatProfilePageNavLabel } from '@/lib/nav-badge-label';
import type { PortalProfileShell } from '@/lib/portal-profile-server';

function decodeRouteAccountId(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return '';
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

export default function ProfilePage({
  accountId: accountIdParam,
  initialShell = null,
}: {
  accountId: string;
  initialShell?: PortalProfileShell | null;
}) {
  const router = useRouter();
  const { accountId: viewerAccountId } = useWallet();
  const profileState = useProfile();

  const accountId = useMemo(
    () => decodeRouteAccountId(accountIdParam),
    [accountIdParam]
  );

  const isSelf = Boolean(
    accountId && viewerAccountId && accountId === viewerAccountId
  );

  const [profileNavLabel, setProfileNavLabel] = useState<string | null>(null);

  useEffect(() => {
    setProfileNavLabel(null);
  }, [accountId, isSelf]);

  const navBadgeLabel =
    profileNavLabel ??
    formatProfilePageNavLabel({ isSelf, accountId, profileLoaded: false });

  useNavBack('Back');

  usePageNavBadge(navBadgeLabel, 'blue');

  if (!accountId) {
    return (
      <PageShell size="standard">
        <p className="text-center text-sm text-muted-foreground">
          Profile not found.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell size="form" className="px-0">
      <ProfileModal
        variant="page"
        open
        accountId={accountId}
        initialShell={initialShell}
        viewerAccountId={viewerAccountId}
        selfProfile={profileState.profile}
        selfAvatarUrl={profileState.avatarUrl}
        selfBannerUrl={profileState.bannerUrl}
        hasSocialSession={profileState.hasSocialSession}
        isAuthorizingSession={profileState.isAuthorizingSession}
        onOpenChange={() => router.push('/discover')}
        onEditProfile={() => {}}
        onPageNavLabel={setProfileNavLabel}
        onUpdateStanding={profileState.updateStanding}
        onEndorse={profileState.endorse}
        onRemoveEndorsement={profileState.removeEndorsement}
        onSupportProfile={profileState.supportProfile}
        onSupportEndorsement={profileState.supportEndorsement}
        onClaimSupportBalance={profileState.claimSupportBalance}
        isSupportingProfile={profileState.isSupportingProfile}
        isClaimingSupportBalance={profileState.isClaimingSupportBalance}
      />
    </PageShell>
  );
}
