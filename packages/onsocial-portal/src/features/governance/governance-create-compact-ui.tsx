'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import {
  floatingPanelItemActiveClass,
  floatingPanelItemClass,
  floatingPanelItemSelectedClass,
} from '@/components/ui/floating-panel';
import { cn } from '@/lib/utils';
import { portalConnectCtaLabel } from '@/lib/portal-connect-copy';
import { governanceSegmentButtonClass } from '@/features/governance/governance-segment-button';

export const governanceCreateFieldLabelClass =
  'mb-2 block portal-type-label font-medium uppercase tracking-[0.16em] text-muted-foreground';

export const governanceCreateFieldShellClass =
  'portal-field-focus rounded-2xl border border-border/40 bg-background/45';

export function governanceCreateFieldTriggerClass(open: boolean) {
  return cn(
    'portal-field-focus flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm outline-none md:py-3.5',
    open ? 'border-border bg-background/60' : 'border-border/40 bg-background/45'
  );
}

export const governanceCreateActionMenuShellClass =
  'max-h-[min(18rem,50dvh)] overflow-y-auto overscroll-y-contain touch-pan-y [-webkit-overflow-scrolling:touch] p-0';

export const governanceCreateActionMenuListClass =
  'space-y-0.5 p-1 md:p-1.5';

export const governanceCreateActionMenuCategoryStripClass =
  'sticky top-0 z-10 shrink-0 overflow-x-auto overscroll-x-contain border-b border-fade-section bg-background/98 px-1.5 py-1.5 backdrop-blur-sm md:px-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';

export function GovernanceCreateActionCategoryStrip({
  categories,
  value,
  onChange,
}: {
  categories: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  if (categories.length <= 1) {
    return null;
  }

  return (
    <div
      className={governanceCreateActionMenuCategoryStripClass}
      role="tablist"
      aria-label="Proposal action categories"
    >
      <div className="flex min-w-max items-center gap-2.5 md:gap-3">
        {categories.map((category) => {
          const active = category.id === value;

          return (
            <Button
              key={category.id}
              type="button"
              role="tab"
              aria-selected={active}
              variant="outline"
              size="xs"
              onClick={() => onChange(category.id)}
              className={governanceSegmentButtonClass(active)}
            >
              {category.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function governanceCreateActionMenuItemClass(
  selected: boolean,
  active: boolean
) {
  return cn(
    floatingPanelItemClass,
    'items-start gap-2.5 py-2 md:gap-3 md:py-2.5',
    selected
      ? floatingPanelItemSelectedClass
      : active
        ? floatingPanelItemActiveClass
        : undefined
  );
}

export function GovernanceCreateActionMenuCopy({
  label,
  description,
}: {
  label: string;
  description?: string;
}) {
  return (
    <span className="min-w-0 flex-1 text-left">
      <span className="block text-sm font-medium leading-snug">{label}</span>
      {description ? (
        <span className="mt-0.5 block line-clamp-2 text-[11px] leading-snug text-muted-foreground/75">
          {description}
        </span>
      ) : null}
    </span>
  );
}

export function GovernanceCreateActionMenuOption({
  label,
  description,
  selected,
  active,
  onClick,
  onMouseEnter,
  optionRef,
  optionId,
  tabIndex,
}: {
  label: string;
  description?: string;
  selected: boolean;
  active: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  optionRef?: (element: HTMLButtonElement | null) => void;
  optionId?: string;
  tabIndex: number;
}) {
  return (
    <button
      ref={optionRef}
      id={optionId}
      type="button"
      role="option"
      aria-selected={selected}
      tabIndex={tabIndex}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={governanceCreateActionMenuItemClass(selected, active)}
    >
      <GovernanceCreateActionMenuCopy label={label} description={description} />
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
        {selected ? <Check className="h-4 w-4" /> : null}
      </span>
    </button>
  );
}

export function GovernanceCreateActionPolicyLink({
  label,
  description,
  href,
  onClick,
}: {
  label: string;
  description?: string;
  href: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      role="option"
      onClick={onClick}
      className={governanceCreateActionMenuItemClass(false, false)}
    >
      <GovernanceCreateActionMenuCopy label={label} description={description} />
      <ProtocolMotionArrow className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function formatGovernanceRoleLabel(roleId: string): string {
  const words = roleId
    .trim()
    .toLowerCase()
    .split('_')
    .filter(Boolean);

  if (words.length === 0) {
    return 'Member';
  }

  const lastIndex = words.length - 1;
  const lastWord = words[lastIndex]!;
  if (lastWord.endsWith('s') && lastWord.length > 1) {
    words[lastIndex] = lastWord.slice(0, -1);
  }

  return words
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatMemberRoles(memberRoles: readonly string[]): string {
  if (memberRoles.length === 0) {
    return 'Member';
  }

  return memberRoles.map(formatGovernanceRoleLabel).join(' · ');
}

export type GovernanceCreateNoActionsMessage =
  | {
      kind: 'policy_only';
    }
  | {
      kind: 'delegation';
      remainingToThresholdDisplay: string;
    }
  | {
      kind: 'bond';
      bondDisplay: string;
    }
  | {
      kind: 'delegation_and_bond';
      remainingToThresholdDisplay: string;
      bondDisplay: string;
    }
  | {
      kind: 'member_no_permissions';
    }
  | {
      kind: 'delegation_met_no_permissions';
    }
  | {
      kind: 'chain_unavailable';
    };

export function resolveGovernanceCreateNoActionsMessage(input: {
  isDaoMember: boolean;
  hasEnoughDelegation: boolean;
  hasEnoughBond: boolean;
  remainingToThresholdDisplay: string;
  bondDisplay: string;
  baseProposalActionCount: number;
  availableProposalActionCount: number;
  hasPolicyActions: boolean;
}): GovernanceCreateNoActionsMessage | null {
  if (input.availableProposalActionCount > 0) {
    return null;
  }

  if (input.hasPolicyActions) {
    return { kind: 'policy_only' };
  }

  if (input.baseProposalActionCount === 0) {
    if (input.isDaoMember) {
      return { kind: 'member_no_permissions' };
    }

    if (!input.hasEnoughDelegation && !input.hasEnoughBond) {
      return {
        kind: 'delegation_and_bond',
        remainingToThresholdDisplay: input.remainingToThresholdDisplay,
        bondDisplay: input.bondDisplay,
      };
    }

    if (!input.hasEnoughDelegation) {
      return {
        kind: 'delegation',
        remainingToThresholdDisplay: input.remainingToThresholdDisplay,
      };
    }

    if (!input.hasEnoughBond) {
      return {
        kind: 'bond',
        bondDisplay: input.bondDisplay,
      };
    }

    return { kind: 'delegation_met_no_permissions' };
  }

  if (input.baseProposalActionCount > 0) {
    return { kind: 'chain_unavailable' };
  }

  return { kind: 'delegation_met_no_permissions' };
}

export function resolveGovernanceCreateBlockedSubmitLabel(
  message: GovernanceCreateNoActionsMessage | null
): string | null {
  if (!message) {
    return null;
  }

  switch (message.kind) {
    case 'delegation':
      return `Delegate ${message.remainingToThresholdDisplay} SOCIAL to propose`;
    case 'bond':
      return `Add ${message.bondDisplay} NEAR bond to propose`;
    case 'delegation_and_bond':
      return `Delegate ${message.remainingToThresholdDisplay} SOCIAL to propose`;
    case 'policy_only':
      return 'Open policy to propose';
    case 'member_no_permissions':
      return 'No proposal permissions';
    case 'delegation_met_no_permissions':
      return 'No public proposals';
    case 'chain_unavailable':
      return 'Nothing actionable now';
  }
}

export function resolveGovernancePolicyBlockedSubmitLabel(input: {
  isConnected: boolean;
  canEditPolicy: boolean;
  canCoverBond: boolean;
  bondDisplay: string;
  availablePolicyActionCount: number;
  canProposeSelectedPolicyAction: boolean;
}): string | null {
  if (!input.isConnected) {
    return portalConnectCtaLabel('governance.policy');
  }

  if (!input.canEditPolicy || input.availablePolicyActionCount === 0) {
    return 'No policy permissions';
  }

  if (!input.canCoverBond) {
    return `Add ${input.bondDisplay} NEAR bond to propose`;
  }

  if (!input.canProposeSelectedPolicyAction) {
    return 'No permission for this change';
  }

  return null;
}

export function GovernanceCreateNoActionsPlaceholder({
  message,
  policyPath,
}: {
  message: GovernanceCreateNoActionsMessage;
  policyPath: string;
}) {
  const bodyClass =
    'portal-type-body-sm leading-snug text-pretty text-muted-foreground/80';

  if (message.kind === 'policy_only') {
    return (
      <p className={bodyClass}>
        Policy updates only — no public proposals here.{' '}
        <Link href={policyPath} className="portal-action-link font-medium">
          Open policy
        </Link>
      </p>
    );
  }

  if (message.kind === 'delegation') {
    return (
      <p className={bodyClass}>
        Delegate{' '}
        <span className="font-semibold tabular-nums text-foreground/85">
          {message.remainingToThresholdDisplay}
        </span>{' '}
        SOCIAL to propose here.
      </p>
    );
  }

  if (message.kind === 'bond') {
    return (
      <p className={bodyClass}>
        Add{' '}
        <span className="font-semibold tabular-nums text-foreground/85">
          {message.bondDisplay}
        </span>{' '}
        NEAR bond to propose here.
      </p>
    );
  }

  if (message.kind === 'delegation_and_bond') {
    return (
      <p className={bodyClass}>
        Delegate{' '}
        <span className="font-semibold tabular-nums text-foreground/85">
          {message.remainingToThresholdDisplay}
        </span>{' '}
        SOCIAL and add{' '}
        <span className="font-semibold tabular-nums text-foreground/85">
          {message.bondDisplay}
        </span>{' '}
        NEAR bond to propose here.
      </p>
    );
  }

  if (message.kind === 'member_no_permissions') {
    return (
      <p className={bodyClass}>
        Your role has no proposal permissions on this DAO.
      </p>
    );
  }

  if (message.kind === 'delegation_met_no_permissions') {
    return (
      <p className={bodyClass}>
        Threshold met — no public proposal permissions on this DAO.
      </p>
    );
  }

  return (
    <p className={bodyClass}>No on-chain actions available right now.</p>
  );
}

export function GovernanceCreateEligibilityLine({
  delegatedDisplay,
  thresholdDisplay,
  bondDisplay,
  hasEnoughDelegation,
  hasEnoughBond,
  memberRoles = [],
  positionPath = '/governance/manage',
}: {
  delegatedDisplay: string;
  thresholdDisplay: string;
  bondDisplay: string;
  hasEnoughDelegation: boolean;
  hasEnoughBond: boolean;
  memberRoles?: readonly string[];
  positionPath?: string;
}) {
  const isDaoMember = memberRoles.length > 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <p className="min-w-0 flex-1 portal-type-caption leading-snug text-muted-foreground/80">
        {isDaoMember ? (
          <>
            <span className="font-medium portal-green-text">
              {formatMemberRoles(memberRoles)}
            </span>
            <span className="text-muted-foreground/45"> · </span>
            <span
              className={cn(
                'font-semibold tabular-nums',
                hasEnoughBond ? 'portal-green-text' : 'portal-red-text'
              )}
            >
              {bondDisplay}
            </span>
            <span className="text-muted-foreground/60"> NEAR bond</span>
            <span className="text-muted-foreground/45"> · </span>
            <span className="tabular-nums text-muted-foreground/65">
              {delegatedDisplay}/{thresholdDisplay} delegated
            </span>
          </>
        ) : (
          <>
            <span
              className={cn(
                'font-semibold tabular-nums',
                hasEnoughDelegation ? 'portal-green-text' : 'portal-red-text'
              )}
            >
              {delegatedDisplay}
            </span>
            <span className="text-muted-foreground/60"> / </span>
            <span className="tabular-nums text-muted-foreground/70">
              {thresholdDisplay}
            </span>
            <span className="text-muted-foreground/60"> SOCIAL delegated</span>
            <span className="text-muted-foreground/45"> · </span>
            <span
              className={cn(
                'font-semibold tabular-nums',
                hasEnoughBond ? 'portal-green-text' : 'portal-red-text'
              )}
            >
              {bondDisplay}
            </span>
            <span className="text-muted-foreground/60"> NEAR bond</span>
          </>
        )}
      </p>
      <Link
        href={positionPath}
        className="portal-action-link group inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground/75 hover:text-foreground"
      >
        Position
        <ProtocolMotionArrow className="h-3 w-3" />
      </Link>
    </div>
  );
}

export function GovernanceCreateProposalSummaryBlock({
  summary,
}: {
  summary: {
    primary: string;
    secondary: string | null;
    secondaryWarning: boolean;
  } | null;
}) {
  if (!summary) {
    return null;
  }

  return (
    <div className="min-w-0 border-t border-fade-detail pt-3">
      <p className="portal-eyebrow-wide text-muted-foreground/50">If approved</p>
      <p className="mt-1.5 min-w-0 break-words portal-type-body-sm font-medium leading-snug text-foreground/85 text-pretty">
        {summary.primary}
      </p>
      {summary.secondary ? (
        <p
          className={cn(
            'mt-1 min-w-0 break-words portal-type-caption text-pretty',
            summary.secondaryWarning
              ? 'text-amber-700'
              : 'text-muted-foreground/65'
          )}
        >
          {summary.secondary}
        </p>
      ) : null}
    </div>
  );
}
