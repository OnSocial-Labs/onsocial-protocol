'use client';

import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';
import { Shield, Sparkles, Trophy } from 'lucide-react';
import { FloatingPanelMenu } from '@/components/ui/floating-panel-menu';
import { floatingPanelItemClass } from '@/components/ui/floating-panel';
import type { ProfileRallyParticipation } from '@/features/season/profile-rally-credentials';
import {
  buildProfileCredentialsLayout,
  formatProfileRallyMenuTitle,
  hasProfileCredentials,
  type ProfileProtocolCredential,
} from '@/features/profile/profile-identity-credentials';
import { useDropdown } from '@/hooks/use-dropdown';
import { ARCHIVED_GENESIS_SEASON_ID } from '@/lib/active-season';
import { cn } from '@/lib/utils';

const credentialIconClass = 'h-3 w-3 shrink-0';
const credentialControlClass =
  'inline-flex shrink-0 items-center justify-center rounded-md p-0.5 text-muted-foreground/45 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border/60';

function credentialHoverClass(accent: 'gold' | 'blue' | 'neutral'): string {
  if (accent === 'gold') {
    return 'hover:text-[var(--portal-gold)] focus-visible:text-[var(--portal-gold)]';
  }
  if (accent === 'blue') {
    return 'hover:text-[var(--portal-blue-hover)] focus-visible:text-[var(--portal-blue-hover)]';
  }
  return 'hover:text-muted-foreground/75 focus-visible:text-muted-foreground/75';
}

function formatRank(rank: number): string {
  if (!Number.isFinite(rank) || rank <= 0) return '';
  return `#${new Intl.NumberFormat('en-US').format(rank)}`;
}

function CredentialIconControl({
  ariaLabel,
  hoverAccent,
  href,
  onClick,
  ariaExpanded,
  ariaHasPopup,
  children,
}: {
  ariaLabel: string;
  hoverAccent: 'gold' | 'blue' | 'neutral';
  href?: string;
  onClick?: () => void;
  ariaExpanded?: boolean;
  ariaHasPopup?: boolean | 'menu';
  children: ReactNode;
}) {
  const className = cn(
    credentialControlClass,
    credentialHoverClass(hoverAccent)
  );

  if (href) {
    return (
      <Link href={href} className={className} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function RallyCredentialIcon({
  participations,
  featured,
  ariaLabel,
}: {
  participations: ProfileRallyParticipation[];
  featured: boolean;
  ariaLabel: string;
}) {
  const { isOpen, toggle, close, containerRef } = useDropdown();

  const icon = (
    <Trophy
      className={credentialIconClass}
      strokeWidth={2.25}
      aria-hidden="true"
    />
  );
  const hoverAccent = featured ? 'gold' : 'neutral';

  return (
    <div ref={containerRef} className="relative inline-flex shrink-0">
      <CredentialIconControl
        ariaLabel={ariaLabel}
        hoverAccent={hoverAccent}
        ariaExpanded={isOpen}
        ariaHasPopup="menu"
        onClick={toggle}
      >
        {icon}
      </CredentialIconControl>
      <FloatingPanelMenu
        open={isOpen}
        align="right"
        offsetClass="mt-1"
        className="w-[min(100vw-2rem,14rem)] sm:w-56"
        role="menu"
        aria-label="Rally seasons"
      >
        <div className="border-b border-fade-section px-3 py-2.5 md:px-4 md:py-3">
          <p className="portal-type-label text-muted-foreground/70">
            Rally seasons
          </p>
        </div>
        <ul className="space-y-0.5 p-1 md:p-1.5" role="none">
          {participations.map((season) => {
            const rankLabel = formatRank(season.rank);
            const title = formatProfileRallyMenuTitle(season);
            const isGenesis = season.seasonId === ARCHIVED_GENESIS_SEASON_ID;
            return (
              <li key={season.seasonId} role="none">
                <Link
                  href={season.presentation.rallyPath}
                  role="menuitem"
                  onClick={close}
                  className={cn(
                    floatingPanelItemClass,
                    'justify-between gap-3'
                  )}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {isGenesis ? (
                      <Sparkles
                        className="h-3 w-3 shrink-0 text-[var(--portal-gold)]/55"
                        strokeWidth={2.25}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span className="truncate">{title}</span>
                    {season.live ? (
                      <span className="shrink-0 text-[var(--portal-gold)]/80">
                        Live
                      </span>
                    ) : null}
                  </span>
                  {rankLabel ? (
                    <span className="shrink-0 tabular-nums text-muted-foreground/45">
                      {rankLabel}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </FloatingPanelMenu>
    </div>
  );
}

function ProtocolCredentialIcon({
  credential,
}: {
  credential: ProfileProtocolCredential;
}) {
  const { isOpen, toggle, close, containerRef } = useDropdown();

  return (
    <div ref={containerRef} className="relative inline-flex shrink-0">
      <CredentialIconControl
        ariaLabel={credential.ariaLabel}
        hoverAccent="blue"
        ariaExpanded={isOpen}
        ariaHasPopup="menu"
        onClick={toggle}
      >
        <Shield
          className={credentialIconClass}
          strokeWidth={2.25}
          aria-hidden="true"
        />
      </CredentialIconControl>
      <FloatingPanelMenu
        open={isOpen}
        align="right"
        offsetClass="mt-1"
        className="w-[min(100vw-2rem,14rem)] sm:w-56"
        role="menu"
        aria-label="Protocol roles"
      >
        <div className="border-b border-fade-section px-3 py-2.5 md:px-4 md:py-3">
          <p className="portal-type-label text-muted-foreground/70">
            {credential.headerLabel}
          </p>
        </div>
        <ul className="space-y-0.5 p-1 md:p-1.5" role="none">
          {credential.destinations.map((destination) => (
            <li key={destination.board} role="none">
              <Link
                href={destination.href}
                role="menuitem"
                onClick={close}
                className={floatingPanelItemClass}
              >
                {destination.label}
              </Link>
            </li>
          ))}
        </ul>
      </FloatingPanelMenu>
    </div>
  );
}

export function ProfileCredentialsMeta({
  participations,
  protocol = null,
  className,
}: {
  participations: ProfileRallyParticipation[];
  protocol?: ProfileProtocolCredential | null;
  className?: string;
}) {
  const layout = useMemo(
    () =>
      buildProfileCredentialsLayout({
        rallyParticipations: participations,
        protocol,
      }),
    [participations, protocol]
  );

  if (!hasProfileCredentials(layout)) {
    return null;
  }

  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-0.5', className)}
    >
      {layout.protocol ? (
        <ProtocolCredentialIcon credential={layout.protocol} />
      ) : null}
      {layout.rally ? (
        <RallyCredentialIcon
          participations={layout.rally.participations}
          featured={layout.rally.featured}
          ariaLabel={layout.rally.ariaLabel}
        />
      ) : null}
    </span>
  );
}
