'use client';

import { SecurityShieldIcon, ShieldCheckIcon } from '@onsocial/ui';
import { ProtocolIdentityMarkButton } from '@/features/protocol/protocol-identity-mark-button';
import { portfolioPath } from '@/lib/overlay-routes';
import {
  resolveProtocolFaceDaoKind,
  type ProtocolFaceDaoKind,
} from '@/lib/portfolio-dao-entity';

const FACE_COPY: Record<
  ProtocolFaceDaoKind,
  { label: string; hint: string; actionLabel: string }
> = {
  governance: {
    label: 'Governance',
    hint: 'Votes on protocol upgrades and policy.',
    actionLabel: 'View Governance',
  },
  treasury: {
    label: 'Treasury',
    hint: 'Holds and allocates protocol funds.',
    actionLabel: 'View Treasury',
  },
};

/**
 * Quiet mark for protocol Governance (green shield-check) or Treasury
 * (blue security-shield). Config ids only — no RPC. Size follows name `em`.
 */
export function ProtocolFaceDaoMark({ accountId }: { accountId: string }) {
  const kind = resolveProtocolFaceDaoKind(accountId);
  if (!kind) return null;

  const { label, hint, actionLabel } = FACE_COPY[kind];
  const Icon = kind === 'treasury' ? SecurityShieldIcon : ShieldCheckIcon;

  return (
    <ProtocolIdentityMarkButton
      tone={kind}
      label={label}
      hint={hint}
      actionHref={portfolioPath(accountId)}
      actionLabel={actionLabel}
      icon={<Icon className="protocol-identity-mark-icon" />}
    />
  );
}
