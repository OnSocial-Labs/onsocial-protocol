'use client';

import Link from 'next/link';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, Shield, User, Users } from 'lucide-react';
import {
  compactModalBodyClass,
  compactModalBodyDenseClass,
  compactModalFooterYClass,
  compactModalHeaderDenseClass,
  compactModalInsetShellPadClass,
  compactModalPanelSectionClass,
  compactModalSectionLabelClass,
  compactModalSectionYClass,
  compactModalShellClass,
  compactModalStatGridCellClass,
  floatingPanelItemClass,
  portalElevatedShadowClass,
} from '@/components/ui/floating-panel';
import { ModalCloseButton } from '@/components/ui/modal-close-button';
import { ModalHeader } from '@/components/ui/modal-header';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { TokenIcon } from '@/components/ui/token-icon';
import {
  GovernanceAccountChip,
  prefetchGovernanceCardAccounts,
} from '@/features/governance/governance-account-chip';
import { buildGovernancePathWithBoard } from '@/features/governance/governance-dao-board';
import type { GovernanceDaoBoard } from '@/features/governance/governance-dao-board';
import { fetchDaoPolicy } from '@/features/governance/api';
import { GovernanceViewerPositionCard } from '@/features/governance/governance-viewer-position-card';
import {
  buildDaoQuorumPresetOptions,
  formatDaoRoleDisplayName,
  formatVoteThresholdFraction,
  getDaoGroupMembershipRoleNames,
  readDefaultVotePolicyQuorum,
  readDefaultVotePolicyThreshold,
  resolveCouncilVotePoolSize,
  resolveDaoRoleKind,
  resolveDaoVoteThresholdPreset,
  resolveVoteThresholdPresetId,
  sortDaoPolicyRolesForDisplay,
} from '@/features/governance/governance-proposal-builders';
import type {
  GovernanceDaoPolicy,
  GovernanceDaoRole,
} from '@/features/governance/types';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import { useMemberAccountLookup } from '@/hooks/use-member-account-lookup';
import { formatNearCompact, formatSocialCompact } from '@/lib/leaderboard';
import { fadeMotion, scaleFadeMotion } from '@/lib/motion';
import {
  getGovernanceDaoConfig,
  getGovernanceEligibility,
  getGovernanceProposalBond,
  yoctoToNear,
  yoctoToSocial,
} from '@/lib/near-rpc';
import {
  ACTIVE_NEAR_EXPLORER_URL,
  getPortalProfileUrl,
} from '@/lib/portal-config';
import { cn } from '@/lib/utils';

const NS_PER_DAY = 86_400_000_000_000n;

const microLabelClass = 'portal-eyebrow-wide text-muted-foreground/50';

const NEAR_TOKEN_ICON = '/near.svg';

function rulesGridCellClass(index: number) {
  return cn(
    compactModalStatGridCellClass,
    index > 0 && 'border-l border-fade-detail'
  );
}

const snapshotLabelClass =
  'portal-eyebrow text-[9px] leading-none text-muted-foreground sm:text-[10px]';

const snapshotValueClass =
  'font-mono text-[11px] font-semibold tabular-nums leading-none text-portal-neutral';

function splitPurposeSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function DaoPurposeSection({ text }: { text: string }) {
  const sentences = splitPurposeSentences(text);

  return (
    <section
      aria-label="DAO purpose"
      className={cn(
        'border-b border-fade-section pt-0',
        compactModalSectionYClass
      )}
    >
      <p
        className={cn(
          microLabelClass,
          compactModalSectionLabelClass,
          'text-center'
        )}
      >
        Purpose
      </p>
      <div className="mx-auto max-w-[40ch] space-y-0.5 text-center">
        {sentences.map((sentence, index) => {
          const isPunchLine =
            index > 0 && sentence.length <= 40 && !sentence.includes('—');

          return (
            <p
              key={sentence}
              className={cn(
                'portal-type-body-sm leading-snug text-muted-foreground/72',
                isPunchLine && 'font-medium'
              )}
            >
              {sentence}
            </p>
          );
        })}
      </div>
    </section>
  );
}

function formatProposalPeriodDays(periodNs: string | undefined): string {
  if (!periodNs) {
    return '…';
  }

  try {
    const days = Number(BigInt(periodNs) / NS_PER_DAY);
    return `${days}d`;
  } catch {
    return '…';
  }
}

function formatNearBond(value: string) {
  const numeric = Number(yoctoToNear(value));
  if (!Number.isFinite(numeric)) {
    return '0';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: numeric >= 100 ? 2 : 4,
  }).format(numeric);
}

function formatSocialThreshold(value: string): string {
  const numeric = Number(yoctoToSocial(value));
  if (!Number.isFinite(numeric)) {
    return '0';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: numeric >= 1000 ? 0 : 0,
  }).format(numeric);
}

function roleMetaLabel(role: GovernanceDaoRole): string {
  const members = role.kind?.Group ?? [];
  const memberThreshold = role.kind?.Member;

  if (members.length > 0) {
    return `${members.length} member${members.length === 1 ? '' : 's'}`;
  }

  if (memberThreshold) {
    return `≥${formatSocialThreshold(memberThreshold)} SOCIAL`;
  }

  if (resolveDaoRoleKind(role) === 'public') {
    return 'Open membership';
  }

  return '—';
}

function PanelSection({
  label,
  action,
  children,
  className,
}: {
  label?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(compactModalPanelSectionClass, className)}>
      {label ? (
        <div
          className={cn(
            compactModalSectionLabelClass,
            'flex items-center justify-between gap-2'
          )}
        >
          <p className={microLabelClass}>{label}</p>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function formatCompactApprovalLabel(
  threshold: [number, number] | null | undefined
): string {
  if (!threshold) {
    return '…';
  }

  const matchedPreset = resolveDaoVoteThresholdPreset(
    resolveVoteThresholdPresetId(threshold)
  );

  if (matchedPreset) {
    return matchedPreset.id === 'pct_100'
      ? matchedPreset.percentLabel
      : `≥${matchedPreset.percentLabel}`;
  }

  return formatVoteThresholdFraction(threshold);
}

function formatCompactQuorumLabel(
  quorum: string,
  councilSize: number | null,
  threshold: [number, number] | null
): string {
  const option = buildDaoQuorumPresetOptions(
    councilSize,
    threshold,
    quorum
  ).find((candidate) => candidate.quorum === quorum);

  if (option) {
    return option.nameLabel;
  }

  return quorum;
}

function DaoTreasuryBalanceCell({
  iconSrc,
  label,
  value,
  className,
}: {
  iconSrc?: string | null;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        compactModalInsetShellPadClass,
        'flex min-w-0 items-center justify-center gap-2',
        className
      )}
    >
      <TokenIcon src={iconSrc} label={label} size="sm" className="shrink-0" />
      <p className={snapshotValueClass}>{value}</p>
      <p className={snapshotLabelClass}>{label}</p>
    </div>
  );
}

function DaoSnapshotGrid({
  nearBalanceYocto,
  socialBalanceYocto,
  socialIcon,
  bondLabel,
  periodLabel,
  approvalLabel,
  quorumLabel,
}: {
  nearBalanceYocto: string;
  socialBalanceYocto: string;
  socialIcon?: string | null;
  bondLabel: string;
  periodLabel: string;
  approvalLabel: string;
  quorumLabel: string;
}) {
  const ruleItems = [
    { label: 'Bond', value: `${bondLabel} NEAR` },
    { label: 'Period', value: periodLabel },
    { label: 'Approval', value: approvalLabel },
    { label: 'Quorum', value: quorumLabel },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 border-b border-fade-detail">
        <DaoTreasuryBalanceCell
          iconSrc={NEAR_TOKEN_ICON}
          label="NEAR"
          value={formatNearCompact(nearBalanceYocto)}
        />
        <DaoTreasuryBalanceCell
          iconSrc={socialIcon}
          label="SOCIAL"
          value={formatSocialCompact(socialBalanceYocto)}
          className="border-l border-fade-detail"
        />
      </div>

      <div className="grid grid-cols-4">
        {ruleItems.map((item, index) => (
          <div key={item.label} className={rulesGridCellClass(index)}>
            <p className={snapshotLabelClass}>{item.label}</p>
            <p
              className={cn(
                snapshotValueClass,
                'mt-1 break-words leading-tight'
              )}
            >
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoleMemberAvatar({
  accountId,
  stackIndex = 0,
}: {
  accountId: string;
  stackIndex?: number;
}) {
  const lookup = useMemberAccountLookup(accountId);

  return (
    <Link
      href={getPortalProfileUrl(accountId)}
      prefetch
      className={cn(
        'relative block h-5 w-5 shrink-0 overflow-hidden rounded-full border border-background bg-muted/30 transition-opacity hover:opacity-90',
        stackIndex > 0 && '-ml-1.5'
      )}
      aria-label={lookup.displayName ?? accountId}
    >
      {lookup.avatarUrl ? (
        <img
          src={lookup.avatarUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-muted-foreground">
          <User className="h-2.5 w-2.5" strokeWidth={2} />
        </span>
      )}
    </Link>
  );
}

function DaoRoleInfoRow({ role }: { role: GovernanceDaoRole }) {
  const roleId = role.name?.trim() ?? '';
  const [expanded, setExpanded] = useState(false);
  const members = role.kind?.Group ?? [];
  const hasMembers = members.length > 0;
  const isCouncil = resolveDaoRoleKind(role) === 'council';
  const displayName = formatDaoRoleDisplayName(roleId);
  const reduceMotion = useReducedMotion();

  return (
    <div>
      <button
        type="button"
        disabled={!hasMembers}
        onClick={() => {
          if (hasMembers) {
            setExpanded((current) => !current);
          }
        }}
        className={cn(
          floatingPanelItemClass,
          'min-h-9 gap-2 py-1 text-[12px] text-foreground',
          !hasMembers && 'hover:bg-transparent hover:text-foreground'
        )}
      >
        {hasMembers ? (
          <div className="flex shrink-0 items-center">
            {members.slice(0, 3).map((memberId, index) => (
              <RoleMemberAvatar
                key={memberId}
                accountId={memberId}
                stackIndex={index}
              />
            ))}
          </div>
        ) : (
          <span
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-muted/20',
              isCouncil
                ? 'border-[var(--portal-gold-border)] bg-[var(--portal-gold-bg)]'
                : 'border-border/50'
            )}
          >
            {isCouncil ? (
              <Shield
                className="portal-gold-icon h-2.5 w-2.5"
                strokeWidth={2}
              />
            ) : (
              <Users className="h-2.5 w-2.5" strokeWidth={2} />
            )}
          </span>
        )}

        <span className="min-w-0 flex-1 text-[12px] leading-snug">
          <span className="block truncate font-medium text-foreground sm:inline">
            {displayName}
          </span>
          <span className="block text-muted-foreground/70 sm:inline">
            <span className="hidden text-muted-foreground/50 sm:inline">
              {' '}
              ·{' '}
            </span>
            {roleMetaLabel(role)}
          </span>
        </span>

        {hasMembers ? (
          <ChevronDown
            className={cn(
              'h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform',
              expanded && 'rotate-180'
            )}
          />
        ) : null}
      </button>

      <AnimatePresence initial={false}>
        {expanded && hasMembers ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: reduceMotion ? 0 : 0.16,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 py-1 pl-2">
              {members.map((memberId) => (
                <GovernanceAccountChip
                  key={memberId}
                  accountId={memberId}
                  dense
                  compact
                  className="max-w-full"
                />
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function DaoInfoSkeleton() {
  return (
    <div>
      <div className="grid grid-cols-2 border-b border-fade-detail">
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={`treasury-${index}`}
            className={cn(
              compactModalInsetShellPadClass,
              'flex min-w-0 items-center justify-center gap-2',
              index > 0 && 'border-l border-fade-detail'
            )}
          >
            <div className="h-4 w-4 animate-pulse rounded-full bg-muted/30" />
            <div className="h-3.5 w-10 animate-pulse rounded-full bg-muted/30" />
            <div className="h-2.5 w-8 animate-pulse rounded-full bg-muted/30" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`rule-${index}`}
            className={cn(
              compactModalStatGridCellClass,
              'flex flex-col items-center justify-center',
              index > 0 && 'border-l border-fade-detail'
            )}
          >
            <div className="h-2.5 w-8 animate-pulse rounded-full bg-muted/30" />
            <div className="mt-1 h-3.5 w-10 animate-pulse rounded-full bg-muted/30" />
          </div>
        ))}
      </div>
    </div>
  );
}

function DaoInfoPanel({
  nearBalanceYocto,
  socialBalanceYocto,
  socialIcon,
  bondLabel,
  periodLabel,
  approvalLabel,
  quorumLabel,
  viewerAccountId,
  viewerRoles,
  eligibility,
  positionPath,
  onNavigate,
  roles,
  hasPurposeAbove,
}: {
  nearBalanceYocto: string;
  socialBalanceYocto: string;
  socialIcon?: string | null;
  bondLabel: string;
  periodLabel: string;
  approvalLabel: string;
  quorumLabel: string;
  viewerAccountId: string | null;
  viewerRoles: string[];
  eligibility: Awaited<ReturnType<typeof getGovernanceEligibility>> | null;
  positionPath: string;
  onNavigate: () => void;
  roles: GovernanceDaoRole[];
  hasPurposeAbove: boolean;
}) {
  return (
    <>
      <section
        aria-label="DAO snapshot"
        className={cn(
          'border-b border-fade-section',
          compactModalSectionYClass,
          !hasPurposeAbove && 'border-t'
        )}
      >
        <DaoSnapshotGrid
          nearBalanceYocto={nearBalanceYocto}
          socialBalanceYocto={socialBalanceYocto}
          socialIcon={socialIcon}
          bondLabel={bondLabel}
          periodLabel={periodLabel}
          approvalLabel={approvalLabel}
          quorumLabel={quorumLabel}
        />
      </section>

      {viewerAccountId && eligibility ? (
        <section
          aria-label="Your position"
          className={cn(
            'border-b border-fade-section',
            compactModalSectionYClass
          )}
        >
          <GovernanceViewerPositionCard
            viewerRoles={viewerRoles}
            roles={roles}
            eligibility={eligibility}
            manageHref={positionPath}
            onManageNavigate={onNavigate}
          />
        </section>
      ) : null}

      <PanelSection label="Roles">
        {roles.length === 0 ? (
          <p className="text-center text-[12px] text-muted-foreground/65">
            No roles on this DAO yet.
          </p>
        ) : (
          <div className="divide-y divide-fade-detail">
            {roles.map((role) => (
              <DaoRoleInfoRow key={role.name} role={role} />
            ))}
          </div>
        )}
      </PanelSection>
    </>
  );
}

function useGovernanceDaoInfoData(
  daoAccountId: string,
  open: boolean,
  viewerAccountId: string | null
) {
  const requestIdRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [policy, setPolicy] = useState<GovernanceDaoPolicy | null>(null);
  const [nearBalanceYocto, setNearBalanceYocto] = useState('0');
  const [socialBalanceYocto, setSocialBalanceYocto] = useState('0');
  const [socialIcon, setSocialIcon] = useState<string | null>(null);
  const [proposalBondYocto, setProposalBondYocto] = useState('0');
  const [eligibility, setEligibility] = useState<Awaited<
    ReturnType<typeof getGovernanceEligibility>
  > | null>(null);
  const [daoPurpose, setDaoPurpose] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    setDaoPurpose('');
    setSocialIcon(null);

    void (async () => {
      try {
        const [
          nextPolicy,
          assetsResponse,
          bondYocto,
          nextEligibility,
          daoConfig,
        ] = await Promise.all([
          fetchDaoPolicy(daoAccountId),
          fetch(
            `/api/wallet/assets?accountId=${encodeURIComponent(daoAccountId)}`,
            { cache: 'no-store' }
          ),
          getGovernanceProposalBond(daoAccountId).catch(() => '0'),
          viewerAccountId
            ? getGovernanceEligibility(viewerAccountId, daoAccountId).catch(
                () => null
              )
            : Promise.resolve(null),
          getGovernanceDaoConfig(daoAccountId).catch(() => null),
        ]);

        if (requestId !== requestIdRef.current) {
          return;
        }

        const assetsPayload = (await assetsResponse
          .json()
          .catch(() => null)) as {
          nearBalanceYocto?: string;
          socialBalanceYocto?: string;
          social?: { icon?: string | null };
          error?: string;
        } | null;

        if (!assetsResponse.ok) {
          throw new Error(assetsPayload?.error ?? 'Balances unavailable');
        }

        setPolicy(nextPolicy);
        setNearBalanceYocto(assetsPayload?.nearBalanceYocto ?? '0');
        setSocialBalanceYocto(assetsPayload?.socialBalanceYocto ?? '0');
        setSocialIcon(assetsPayload?.social?.icon ?? null);
        setProposalBondYocto(bondYocto ?? '0');
        setEligibility(nextEligibility);
        setDaoPurpose(daoConfig?.purpose?.trim() ?? '');

        const memberIds =
          nextPolicy?.roles?.flatMap((role) => role.kind?.Group ?? []) ?? [];
        prefetchGovernanceCardAccounts(memberIds);
      } catch (loadError) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'DAO info unavailable'
        );
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    })();
  }, [daoAccountId, open, viewerAccountId]);

  return {
    loading,
    error,
    policy,
    nearBalanceYocto,
    socialBalanceYocto,
    socialIcon,
    proposalBondYocto,
    eligibility,
    daoPurpose,
  };
}

export function GovernanceDaoInfoModal({
  open,
  onOpenChange,
  daoAccountId,
  boardLabel,
  activeBoard,
  viewerAccountId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  daoAccountId: string;
  boardLabel: string;
  activeBoard: GovernanceDaoBoard;
  viewerAccountId: string | null;
}) {
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    loading,
    error,
    policy,
    nearBalanceYocto,
    socialBalanceYocto,
    socialIcon,
    proposalBondYocto,
    eligibility,
    daoPurpose,
  } = useGovernanceDaoInfoData(daoAccountId, open, viewerAccountId);

  useBodyScrollLock(open, scrollRef);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenChange, open]);

  const roles = useMemo(
    () => sortDaoPolicyRolesForDisplay(policy?.roles),
    [policy?.roles]
  );
  const councilSize = useMemo(
    () => resolveCouncilVotePoolSize(policy),
    [policy]
  );
  const voteThreshold = useMemo(
    () => readDefaultVotePolicyThreshold(policy?.default_vote_policy),
    [policy?.default_vote_policy]
  );
  const voteQuorum = useMemo(
    () => readDefaultVotePolicyQuorum(policy?.default_vote_policy),
    [policy?.default_vote_policy]
  );
  const viewerRoles = useMemo(
    () =>
      viewerAccountId && policy
        ? getDaoGroupMembershipRoleNames(policy, viewerAccountId)
        : [],
    [policy, viewerAccountId]
  );

  const policyPath = buildGovernancePathWithBoard(
    '/governance/policy',
    activeBoard
  );
  const positionPath = buildGovernancePathWithBoard(
    '/governance/manage',
    activeBoard
  );
  const explorerUrl = `${ACTIVE_NEAR_EXPLORER_URL}/address/${daoAccountId}`;
  const bondLabel = formatNearBond(policy?.proposal_bond ?? proposalBondYocto);
  const periodLabel = formatProposalPeriodDays(policy?.proposal_period);
  const approvalLabel = formatCompactApprovalLabel(voteThreshold);
  const quorumLabel = formatCompactQuorumLabel(
    voteQuorum,
    councilSize,
    voteThreshold
  );

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          {...fadeMotion(reduceMotion ? 0 : 0.18)}
          data-lenis-prevent
          className="fixed inset-0 z-[2147483645] flex items-center justify-center px-4 py-6"
        >
          <button
            type="button"
            className="absolute inset-0 bg-background/72 backdrop-blur-md"
            aria-label="Close DAO info"
            onClick={() => onOpenChange(false)}
          />

          <motion.div
            {...scaleFadeMotion(!!reduceMotion, {
              y: 14,
              scale: 0.98,
              duration: 0.22,
              exitY: 8,
              exitScale: 0.99,
            })}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={cn(
              compactModalShellClass,
              portalElevatedShadowClass,
              'w-full min-w-0 max-w-md shrink-0',
              'max-h-[min(640px,calc(100dvh-2rem))]'
            )}
          >
            <ModalHeader
              titleId={titleId}
              title={boardLabel}
              description={`@${daoAccountId}`}
              descriptionVariant="meta"
              bordered
              className={compactModalHeaderDenseClass}
              titleClassName="text-base tracking-tight"
              descriptionClassName="font-mono portal-type-caption text-muted-foreground/60"
              actions={
                <ModalCloseButton
                  ariaLabel="Close DAO info"
                  onClick={() => onOpenChange(false)}
                />
              }
            />

            <div
              ref={scrollRef}
              className={cn(compactModalBodyClass, compactModalBodyDenseClass)}
            >
              {!loading && !error && daoPurpose ? (
                <DaoPurposeSection text={daoPurpose} />
              ) : null}

              {loading ? (
                <div className="space-y-1">
                  <div className="flex justify-center py-1">
                    <PulsingDots size="sm" />
                  </div>
                  <section
                    aria-label="DAO snapshot"
                    className={cn(
                      'border-y border-fade-section',
                      compactModalSectionYClass
                    )}
                  >
                    <DaoInfoSkeleton />
                  </section>
                </div>
              ) : error ? (
                <p className="py-3 text-center text-sm portal-red-text">
                  {error}
                </p>
              ) : (
                <>
                  <DaoInfoPanel
                    nearBalanceYocto={nearBalanceYocto}
                    socialBalanceYocto={socialBalanceYocto}
                    socialIcon={socialIcon}
                    bondLabel={bondLabel}
                    periodLabel={periodLabel}
                    approvalLabel={approvalLabel}
                    quorumLabel={quorumLabel}
                    viewerAccountId={viewerAccountId}
                    viewerRoles={viewerRoles}
                    eligibility={eligibility}
                    positionPath={positionPath}
                    onNavigate={() => onOpenChange(false)}
                    roles={roles}
                    hasPurposeAbove={!!daoPurpose}
                  />

                  <div
                    className={cn(
                      'flex items-center justify-center gap-x-2.5 border-t border-fade-section portal-type-caption text-muted-foreground/65',
                      compactModalFooterYClass
                    )}
                  >
                    <Link
                      href={policyPath}
                      className="portal-action-link font-medium"
                      onClick={() => onOpenChange(false)}
                    >
                      Policy
                    </Link>
                    <span aria-hidden className="text-muted-foreground/30">
                      ·
                    </span>
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="portal-action-link group inline-flex items-center gap-0.5 font-medium"
                      onClick={() => onOpenChange(false)}
                    >
                      Explorer
                      <ProtocolMotionArrow className="h-3 w-3" />
                    </a>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
