import Link from 'next/link';
import { compactModalSectionLabelClass } from '@/components/ui/floating-panel';
import { PortalBadge } from '@/components/ui/portal-badge';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { Skeleton } from '@/components/ui/skeleton';
import {
  formatDaoRoleDisplayName,
  resolveDaoRoleKind,
} from '@/features/governance/governance-proposal-builders';
import type { GovernanceDaoRole } from '@/features/governance/types';
import type { GovernanceEligibilitySnapshot } from '@/lib/near-rpc';
import { yoctoToSocial } from '@/lib/near-rpc';
import { cn } from '@/lib/utils';

const sectionEyebrowClass = 'portal-eyebrow-wide text-muted-foreground/50';

function formatGovernanceSocial(value: string) {
  const numeric = Number(yoctoToSocial(value));

  if (!Number.isFinite(numeric)) {
    return '0';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: numeric >= 1000 ? 0 : 2,
  }).format(numeric);
}

export function resolveDelegationProgress(
  delegatedYocto: string,
  requiredYocto: string
): number {
  try {
    const delegated = BigInt(delegatedYocto || '0');
    const required = BigInt(requiredYocto || '0');

    if (required <= 0n) {
      return delegated > 0n ? 100 : 0;
    }

    const pct = Number((delegated * 100n) / required);
    return Math.min(100, Math.max(0, pct));
  } catch {
    return 0;
  }
}

function getViewerCouncilRoleIds(
  viewerRoles: string[],
  roles: GovernanceDaoRole[]
): string[] {
  return viewerRoles.filter((roleId) => {
    const role = roles.find((candidate) => candidate.name === roleId);
    return role != null && resolveDaoRoleKind(role) === 'council';
  });
}

export function resolveViewerPositionStatus(
  viewerRoles: string[],
  roles: GovernanceDaoRole[],
  eligibility: GovernanceEligibilitySnapshot
): { label: string; canPropose: boolean } {
  const councilRoleIds = getViewerCouncilRoleIds(viewerRoles, roles);

  if (councilRoleIds.length > 0) {
    const roleLabel = formatDaoRoleDisplayName(councilRoleIds[0]);
    return { label: `${roleLabel} · Can propose`, canPropose: true };
  }

  if (eligibility.canPropose) {
    return { label: 'Can propose', canPropose: true };
  }

  return {
    label: `${formatGovernanceSocial(eligibility.remainingToThreshold)} SOCIAL needed`,
    canPropose: false,
  };
}

export interface GovernanceViewerPositionCardProps {
  viewerRoles: string[];
  roles: GovernanceDaoRole[];
  eligibility: GovernanceEligibilitySnapshot;
  manageHref?: string;
  onManageNavigate?: () => void;
  label?: string;
  className?: string;
}

export function GovernanceViewerPositionCard({
  viewerRoles,
  roles,
  eligibility,
  manageHref,
  onManageNavigate,
  label = 'You',
  className,
}: GovernanceViewerPositionCardProps) {
  const { label: statusLabel, canPropose } = resolveViewerPositionStatus(
    viewerRoles,
    roles,
    eligibility
  );
  const progress = resolveDelegationProgress(
    eligibility.delegatedWeight,
    eligibility.requiredWeight
  );
  const showManage = manageHref != null;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div
        className={cn(
          compactModalSectionLabelClass,
          'flex items-center justify-between gap-2'
        )}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <p className={sectionEyebrowClass}>{label}</p>
          {viewerRoles.map((roleId) => {
            const matchedRole = roles.find((role) => role.name === roleId);
            const isCouncil =
              matchedRole != null &&
              resolveDaoRoleKind(matchedRole) === 'council';

            return (
              <PortalBadge
                key={roleId}
                accent={isCouncil ? 'gold' : 'neutral'}
                size="xs"
              >
                {formatDaoRoleDisplayName(roleId)}
              </PortalBadge>
            );
          })}
        </div>
        {showManage ? (
          <Link
            href={manageHref}
            className="portal-action-link group inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium"
            onClick={onManageNavigate}
          >
            Manage
            <ProtocolMotionArrow className="h-3 w-3" />
          </Link>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5">
        <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-border/40">
          <div
            className={cn(
              'h-full rounded-full transition-[width]',
              canPropose
                ? 'bg-[var(--portal-green)]'
                : 'bg-[var(--portal-blue)]'
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-foreground/80 sm:text-[11px]">
          {formatGovernanceSocial(eligibility.delegatedWeight)}
          <span className="text-muted-foreground/40">/</span>
          {formatGovernanceSocial(eligibility.requiredWeight)}
        </span>
      </div>

      <p
        className={cn(
          'text-[10px] font-medium sm:text-[11px]',
          canPropose ? 'portal-green-text' : 'text-muted-foreground/70'
        )}
      >
        {statusLabel}
      </p>
    </div>
  );
}

export function GovernanceViewerPositionCardSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-2.5 w-16 rounded-full bg-foreground/[0.06]" />
        <Skeleton className="h-2.5 w-12 rounded-full bg-foreground/[0.06]" />
      </div>
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-1 min-w-0 flex-1 rounded-full bg-foreground/[0.05]" />
        <Skeleton className="h-3 w-14 rounded-full bg-foreground/[0.06]" />
      </div>
      <Skeleton className="h-2.5 w-28 rounded-full bg-foreground/[0.06]" />
    </div>
  );
}
