'use client';

import { useEffect, useState } from 'react';
import { ProfileDiscoveryModal } from '@/components/profile-discovery-modal';
import { ProfileModal } from '@/components/profile-modal';
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import { useWallet } from '@/contexts/wallet-context';
import { useProfile } from '@/hooks/use-profile';
import { ACTIVE_API_URL } from '@/lib/portal-config';

interface ProtocolPulse {
  generatedAt: string;
  windowHours: number;
  totals: {
    profiles: number;
    groups: number;
  };
  recent24h: {
    posts: number;
  };
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function formatUpdatedAt(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return 'Live protocol pulse';
  }

  const diffMinutes = Math.max(
    0,
    Math.round((Date.now() - timestamp) / 60_000)
  );
  if (diffMinutes < 1) {
    return 'Live protocol pulse · updated just now';
  }
  if (diffMinutes < 60) {
    return `Live protocol pulse · updated ${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  return `Live protocol pulse · updated ${diffHours}h ago`;
}

export function HeroProtocolPulse() {
  const { accountId } = useWallet();
  const profileState = useProfile();
  const [pulse, setPulse] = useState<ProtocolPulse | null>(null);
  const [profileDiscoveryOpen, setProfileDiscoveryOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileModalAccountId, setProfileModalAccountId] = useState<
    string | null
  >(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPulse() {
      try {
        const res = await fetch(`${ACTIVE_API_URL}/graph/protocol-pulse`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error('Failed to load protocol pulse');
        }
        const data = (await res.json()) as ProtocolPulse;
        if (!cancelled) {
          setPulse(data);
        }
      } catch {
        if (!cancelled) {
          setPulse(null);
        }
      }
    }

    void loadPulse();
    const interval = window.setInterval(() => {
      void loadPulse();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (!pulse) {
    return null;
  }

  const openProfileModal = (targetAccountId: string) => {
    setProfileDiscoveryOpen(false);
    setProfileModalAccountId(targetAccountId);
    setProfileModalOpen(true);
  };

  const openProfileDiscoveryFromProfile = () => {
    setProfileModalOpen(false);
    setProfileModalAccountId(null);
    setProfileDiscoveryOpen(true);
  };

  return (
    <>
      <div className="mx-auto mt-8 max-w-2xl rounded-[1.25rem] border border-border/40 bg-background/35 backdrop-blur-sm">
        <StatStrip columns={3} mobileColumns={3}>
          <StatStripCell label="Profiles" showDivider>
            <button
              type="button"
              onClick={() => setProfileDiscoveryOpen(true)}
              className="rounded-sm font-mono text-sm font-bold text-foreground/80 transition-colors hover:text-[var(--portal-blue)] focus-visible:text-[var(--portal-blue)] focus-visible:outline-none md:text-base"
              aria-label={`Discover ${formatCompact(pulse.totals.profiles)} profiles`}
            >
              {formatCompact(pulse.totals.profiles)}
            </button>
          </StatStripCell>
          <StatStripCell
            label={`Posts ${pulse.windowHours}h`}
            value={formatCompact(pulse.recent24h.posts)}
            showDivider
          />
          <StatStripCell
            label="Groups"
            value={formatCompact(pulse.totals.groups)}
          />
        </StatStrip>
        <p className="px-4 py-3 text-center text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {formatUpdatedAt(pulse.generatedAt)}
        </p>
      </div>

      <ProfileDiscoveryModal
        open={profileDiscoveryOpen}
        viewerAccountId={accountId}
        totalProfiles={pulse.totals.profiles}
        onOpenChange={setProfileDiscoveryOpen}
        onSelectAccount={openProfileModal}
        onUpdateStanding={accountId ? profileState.updateStanding : undefined}
        onEndorse={accountId ? profileState.endorse : undefined}
        onRemoveEndorsement={
          accountId ? profileState.removeEndorsement : undefined
        }
      />

      <ProfileModal
        open={profileModalOpen}
        accountId={profileModalAccountId}
        viewerAccountId={accountId}
        selfProfile={profileState.profile}
        selfAvatarUrl={profileState.avatarUrl}
        hasSocialSession={profileState.hasSocialSession}
        isUpdatingStanding={profileState.isUpdatingStanding}
        onOpenChange={(open) => {
          setProfileModalOpen(open);
          if (!open) setProfileModalAccountId(null);
        }}
        onEditProfile={() => {}}
        onSelectAccount={openProfileModal}
        onDiscoverProfiles={openProfileDiscoveryFromProfile}
        onUpdateStanding={profileState.updateStanding}
        onEndorse={profileState.endorse}
        onRemoveEndorsement={profileState.removeEndorsement}
      />
    </>
  );
}
