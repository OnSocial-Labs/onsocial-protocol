'use client';

import { useCallback, useState, type MouseEvent, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  BoxCheckIcon,
  SecurityShieldIcon,
  ShieldCheckIcon,
} from '@onsocial/ui';
import { PROTOCOL_NESTED_CHOICE_Z } from '@/features/protocol/protocol-sheet-z';
import {
  GOVERNANCE_DAO_ACCOUNT,
  TREASURY_DAO_ACCOUNT,
} from '@/lib/app-config';
import { portfolioPath } from '@/lib/overlay-routes';
import type { ProtocolDaoProposerFlags } from '@/lib/protocol-dao-memberships';

export type ProtocolIdentityMarkTone =
  | 'guardian'
  | 'governance'
  | 'treasury'
  | 'proposer';

function isAlreadyOnPortfolio(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Shared mark control — stroked Mage icon at `1em` of the name, tone color,
 * explain sheet on tap + optional DAO portfolio action.
 */
export function ProtocolIdentityMarkButton({
  tone,
  label,
  hint,
  icon,
  actionHref = null,
  actionLabel = null,
}: {
  tone: ProtocolIdentityMarkTone;
  label: string;
  hint: string;
  icon: ReactNode;
  /** Portfolio route for the related protocol DAO. */
  actionHref?: string | null;
  actionLabel?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const showAction =
    Boolean(actionHref && actionLabel) &&
    Boolean(actionHref && !isAlreadyOnPortfolio(pathname, actionHref));

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
  }, [closing]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    setOpen(false);
  }, []);

  const openDao = useCallback(() => {
    if (!actionHref) return;
    requestClose();
    router.push(actionHref);
  }, [actionHref, requestClose, router]);

  const sheetOpen = open && !closing;

  return (
    <>
      <button
        type="button"
        className={`protocol-identity-mark protocol-identity-mark--${tone}`}
        title={label}
        aria-label={`${label} — what this means`}
        onClick={(event: MouseEvent<HTMLButtonElement>) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <span className="protocol-identity-mark-glyph" aria-hidden>
          {icon}
        </span>
      </button>
      <OsHugSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        label={label}
        closeAriaLabel={`Close ${label} details`}
        backdropLabel={`Close ${label} details`}
        zIndex={PROTOCOL_NESTED_CHOICE_Z}
        initialDetent="peek"
        peekRatio={showAction ? 0.42 : 0.34}
        bodyClassName="protocol-identity-mark-hint-body"
        footer={
          showAction ? (
            <div className="protocol-identity-mark-hint-footer">
              <OsSheetActions layout="stack" tone="frosted-primary" borderless>
                <OsSheetAction type="button" ready onClick={openDao}>
                  {actionLabel}
                </OsSheetAction>
              </OsSheetActions>
            </div>
          ) : null
        }
      >
        <p className="protocol-identity-mark-hint">{hint}</p>
      </OsHugSheet>
    </>
  );
}

export function ProtocolGuardianRoleMark({
  roleId,
}: {
  roleId: 'guardians' | 'council';
}) {
  const label = roleId === 'guardians' ? 'Guardian' : 'Council';
  return (
    <ProtocolIdentityMarkButton
      tone="guardian"
      label={label}
      hint="Votes on protocol proposals."
      actionHref={portfolioPath(GOVERNANCE_DAO_ACCOUNT)}
      actionLabel="View Governance"
      icon={<ShieldCheckIcon className="protocol-identity-mark-icon" />}
    />
  );
}

export function ProtocolGovernanceMemberMark({
  roleId,
}: {
  roleId: 'guardians' | 'council';
}) {
  const roleLabel = roleId === 'guardians' ? 'Guardian' : 'Council';
  return (
    <ProtocolIdentityMarkButton
      tone="governance"
      label={`Governance · ${roleLabel}`}
      hint="Votes on protocol proposals."
      actionHref={portfolioPath(GOVERNANCE_DAO_ACCOUNT)}
      actionLabel="View Governance"
      icon={<ShieldCheckIcon className="protocol-identity-mark-icon" />}
    />
  );
}

export function ProtocolTreasuryMemberMark({
  roleId,
}: {
  roleId: 'guardians' | 'council';
}) {
  const roleLabel = roleId === 'guardians' ? 'Guardian' : 'Council';
  return (
    <ProtocolIdentityMarkButton
      tone="treasury"
      label={`Treasury · ${roleLabel}`}
      hint="Helps steward protocol funds."
      actionHref={portfolioPath(TREASURY_DAO_ACCOUNT)}
      actionLabel="View Treasury"
      icon={<SecurityShieldIcon className="protocol-identity-mark-icon" />}
    />
  );
}

function proposerMarkCopy(proposer: ProtocolDaoProposerFlags): {
  hint: string;
  actionHref: string;
  actionLabel: string;
} {
  if (proposer.governance && proposer.treasury) {
    return {
      hint: 'Has submitted proposals to Governance and Treasury.',
      actionHref: portfolioPath(GOVERNANCE_DAO_ACCOUNT),
      actionLabel: 'View Governance',
    };
  }
  if (proposer.governance) {
    return {
      hint: 'Has submitted proposals to Governance.',
      actionHref: portfolioPath(GOVERNANCE_DAO_ACCOUNT),
      actionLabel: 'View Governance',
    };
  }
  return {
    hint: 'Has submitted proposals to Treasury.',
    actionHref: portfolioPath(TREASURY_DAO_ACCOUNT),
    actionLabel: 'View Treasury',
  };
}

/** Purple box-check — at least one protocol DAO proposal submitted. */
export function ProtocolProposerMark({
  proposer,
}: {
  proposer: ProtocolDaoProposerFlags;
}) {
  if (!proposer.governance && !proposer.treasury) return null;

  const copy = proposerMarkCopy(proposer);

  return (
    <ProtocolIdentityMarkButton
      tone="proposer"
      label="Proposer"
      hint={copy.hint}
      actionHref={copy.actionHref}
      actionLabel={copy.actionLabel}
      icon={<BoxCheckIcon className="protocol-identity-mark-icon" />}
    />
  );
}
