'use client';

import Link from 'next/link';
import {
  GovernanceAccountChip,
  GovernanceAccountChipSkeleton,
} from '@/features/governance/governance-account-chip';
import { getPortalProfileUrl } from '@/lib/portal-config';
import {
  resolveProposalTargetEyebrowLabel,
  type ProposalPresentation,
  type ProposalTargetKind,
} from '@/features/governance/governance-proposal-presentation';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import { splitRoutingTargetDisplay } from '@/features/governance/governance-proposal-routing-display';
import { cn } from '@/lib/utils';

const TARGET_COLUMN_CLASS =
  'flex shrink-0 basis-[38%] min-w-[5rem] max-w-[44%] flex-col items-end gap-0.5 text-right sm:max-w-[11rem] md:max-w-[13rem]';

const ROUTING_TARGET_COLUMN_CLASS =
  'flex shrink-0 basis-[44%] min-w-[5.75rem] max-w-[48%] flex-col items-end gap-0.5 text-right sm:max-w-[13rem] md:max-w-[16rem]';

function shouldShowContractAccountId(
  targetKind: ProposalTargetKind | null,
  targetValue: string,
  targetAccountId: string | null
): boolean {
  if (targetKind !== 'contract' || !targetAccountId) {
    return false;
  }

  return targetAccountId.toLowerCase() !== targetValue.trim().toLowerCase();
}

function GovernanceProposalTargetLine({
  targetKind,
  targetValue,
  targetAccountId,
  footer,
}: {
  targetKind: ProposalTargetKind | null;
  targetValue: string;
  targetAccountId: string | null;
  footer?: React.ReactNode;
}) {
  const isRoutingTarget = targetKind === 'routing';
  const routingDisplay = isRoutingTarget
    ? splitRoutingTargetDisplay(targetValue)
    : null;
  const valueClass = cn(
    'portal-type-body font-semibold tracking-[-0.01em] text-foreground/90 leading-snug break-words',
    targetKind === 'community' && 'block w-full truncate',
    targetKind === 'code_hash' &&
      'font-mono text-[0.8125rem] break-all sm:break-normal'
  );
  const columnClass = isRoutingTarget
    ? ROUTING_TARGET_COLUMN_CLASS
    : TARGET_COLUMN_CLASS;
  const showContractAccountId = shouldShowContractAccountId(
    targetKind,
    targetValue,
    targetAccountId
  );
  const tooltip =
    targetKind === 'code_hash' && targetAccountId
      ? targetAccountId
      : showContractAccountId
        ? `${targetValue} · ${targetAccountId}`
        : targetValue;
  const eyebrowLabel = resolveProposalTargetEyebrowLabel(targetKind);

  const routingValue = routingDisplay ? (
    <span className="flex min-w-0 max-w-full flex-col items-end gap-0.5 text-right">
      {routingDisplay.minLabel ? (
        <span className={valueClass}>{routingDisplay.minLabel}</span>
      ) : null}
      {routingDisplay.routingLabel ? (
        <>
          <span
            className={cn(
              valueClass,
              'hidden text-foreground/80 sm:block'
            )}
          >
            {routingDisplay.routingLabel}
          </span>
          <span className="flex flex-col items-end gap-0.5 text-right sm:hidden">
            {routingDisplay.routingParts.map((part) => (
              <span
                key={part}
                className={cn(valueClass, 'text-foreground/80')}
              >
                {part}
              </span>
            ))}
          </span>
        </>
      ) : null}
    </span>
  ) : (
    <span className={cn(valueClass, 'text-right')}>{targetValue}</span>
  );

  if (!eyebrowLabel) {
    return (
      <div className={columnClass}>
        <PortalHoverTooltip
          tooltip={tooltip}
          className="flex min-w-0 max-w-full flex-col items-end gap-0.5 text-right"
        >
          {routingValue}
        </PortalHoverTooltip>
        {footer}
      </div>
    );
  }

  return (
    <div className={columnClass}>
      <span className="portal-eyebrow leading-none text-muted-foreground/70">
        {eyebrowLabel}
      </span>
      <PortalHoverTooltip
        tooltip={tooltip}
        className="flex min-w-0 max-w-full flex-col items-end gap-0.5 text-right"
      >
        {routingValue}
        {showContractAccountId && targetAccountId ? (
          <Link
            href={getPortalProfileUrl(targetAccountId)}
            className="max-w-full truncate font-mono portal-type-caption leading-none text-muted-foreground/65 transition-opacity hover:opacity-90"
          >
            {targetAccountId}
          </Link>
        ) : null}
      </PortalHoverTooltip>
      {footer}
    </div>
  );
}

export function GovernanceProposalIdentityRow({
  presentation,
  className,
  targetFooter,
  subjectLoading = false,
}: {
  presentation: ProposalPresentation;
  className?: string;
  targetFooter?: React.ReactNode;
  subjectLoading?: boolean;
}) {
  const {
    subjectAccount,
    subjectEyebrow,
    subjectText,
    targetKind,
    targetValue,
    targetAccountId,
  } = presentation;

  if (!subjectAccount && !subjectText && !targetValue) {
    return (
      <h3
        className={cn(
          'portal-type-lead font-semibold tracking-[-0.02em] text-foreground',
          className
        )}
      >
        {presentation.headline}
      </h3>
    );
  }

  return (
    <div
      className={cn(
        'flex min-w-0 items-start justify-between gap-2 sm:gap-3',
        className
      )}
    >
      {subjectLoading ? (
        <div className="min-w-0 flex-1">
          <GovernanceAccountChipSkeleton dense className="max-w-full" />
        </div>
      ) : subjectAccount ? (
        <div className="min-w-0 flex-1">
          {subjectEyebrow ? (
            <span className="mb-0.5 block portal-eyebrow leading-none text-muted-foreground/70">
              {subjectEyebrow}
            </span>
          ) : null}
          <GovernanceAccountChip
            accountId={subjectAccount}
            dense
            className="max-w-full"
          />
        </div>
      ) : subjectText ? (
        <div className="min-w-0 flex-1">
          {subjectEyebrow ? (
            <span className="mb-0.5 block portal-eyebrow leading-none text-muted-foreground/70">
              {subjectEyebrow}
            </span>
          ) : null}
          <span className="portal-type-body font-semibold tracking-[-0.01em] text-foreground/90">
            {subjectText}
          </span>
        </div>
      ) : (
        <h3 className="min-w-0 flex-1 portal-type-lead font-semibold tracking-[-0.02em] text-foreground">
          {presentation.headline}
        </h3>
      )}

      {targetValue ? (
        <GovernanceProposalTargetLine
          targetKind={targetKind}
          targetValue={targetValue}
          targetAccountId={targetAccountId}
          footer={targetFooter}
        />
      ) : null}
    </div>
  );
}

export function GovernanceProposalOnChainRefLabel({
  presentation,
}: {
  presentation: ProposalPresentation;
}) {
  if (!presentation.onChainAction) {
    return null;
  }

  const tooltip =
    presentation.onChainActionKind === 'method'
      ? 'Contract method'
      : presentation.onChainActionKind === 'policy'
        ? 'DAO permission'
        : 'On-chain action';

  return (
    <>
      <span className="shrink-0 text-foreground/20" aria-hidden="true">
        ·
      </span>
      <PortalHoverTooltip
        tooltip={tooltip}
        className="min-w-0 truncate font-mono portal-type-caption text-muted-foreground/65"
      >
        {presentation.onChainAction}
      </PortalHoverTooltip>
      {presentation.onChainAction === 'vote' ? (
        <span className="shrink-0 portal-type-caption text-muted-foreground/50">
          signal
        </span>
      ) : null}
    </>
  );
}

export function GovernanceProposerRow({
  proposer,
  asSelf = false,
  className,
}: {
  proposer?: string;
  asSelf?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1.5 text-muted-foreground',
        className
      )}
    >
      <span className="portal-eyebrow leading-none">Proposer</span>
      {asSelf ? (
        <span className="portal-type-body font-semibold tracking-[-0.01em] text-foreground/90">
          Self
        </span>
      ) : proposer ? (
        <GovernanceAccountChip
          accountId={proposer}
          avatarClassName="h-5 w-5"
          compact
          className="max-w-full"
        />
      ) : null}
    </div>
  );
}

export function GovernanceProposalSummary({
  presentation,
  className,
  targetFooter,
  subjectLoading = false,
}: {
  presentation: ProposalPresentation;
  className?: string;
  targetFooter?: React.ReactNode;
  subjectLoading?: boolean;
}) {
  return (
    <GovernanceProposalIdentityRow
      presentation={presentation}
      className={className}
      targetFooter={targetFooter}
      subjectLoading={subjectLoading}
    />
  );
}
