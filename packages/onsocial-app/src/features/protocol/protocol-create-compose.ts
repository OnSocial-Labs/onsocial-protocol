import type { ProtocolCreateKind } from '@/features/protocol/protocol-create';
import {
  isBoundedNoteReady,
  PROPOSAL_DESCRIPTION_LIMITS,
} from '@/lib/bounded-note-field';
import { socialToYocto } from '@/lib/social-spend-profile';

export type ProtocolCreateDescriptionContext = {
  roleId?: string;
};

export function protocolCreateWhisper(
  kind: ProtocolCreateKind,
  bondLabel: string | null
): string {
  const bond = bondLabel ? ` · ${bondLabel} bond on confirm` : '';

  switch (kind) {
    case 'add_member':
      return `Role and account${bond || ' · confirm to submit'}.`;
    case 'remove_member':
      return `Remove from a role${bond || ' · confirm to submit'}.`;
    case 'join_self':
      return `Join a role${bond || ' · confirm to submit'}.`;
    case 'leave_self':
      return `Leave a role${bond || ' · confirm to submit'}.`;
    case 'signal':
      return `Write the signal${bond || ' · confirm to submit'}.`;
    case 'transfer':
      return `Asset, recipient, and amount${bond || ' · confirm to submit'}.`;
    case 'transfer_ownership':
      return `Contract and new owner${bond || ' · confirm to submit'}.`;
    case 'contract_upgrade':
      return `Contract and code hash${bond || ' · confirm to submit'}.`;
    case 'fund_season_pool':
      return `Season and amount${bond || ' · confirm to submit'}.`;
    case 'withdraw_boost_infra':
      return `Infra pool to treasury${bond || ' · confirm to submit'}.`;
    case 'set_boost_infra_authority':
      return `Boost authority${bond || ' · confirm to submit'}.`;
    case 'contract_config':
      return `Setting and routing split${bond || ' · confirm to submit'}.`;
    case 'season_config':
      return `Season, name, and duration${bond || ' · confirm to submit'}.`;
    default:
      return `Fill the form${bond || ' · confirm to submit'}.`;
  }
}

export function protocolCreateBoundedSocialAmountReady(
  amountSocial: string,
  maxYocto: string
): boolean {
  const trimmed = amountSocial.trim();
  if (!trimmed) return false;

  try {
    const amountYocto = BigInt(socialToYocto(trimmed));
    const poolYocto = BigInt(maxYocto || '0');
    return amountYocto > 0n && amountYocto <= poolYocto;
  } catch {
    return false;
  }
}

export function protocolCreateBoostWithdrawReady(
  amountSocial: string,
  opts: {
    canWithdraw: boolean;
    infraPoolYocto: string;
  }
): boolean {
  if (!opts.canWithdraw) return false;
  return protocolCreateBoundedSocialAmountReady(
    amountSocial,
    opts.infraPoolYocto
  );
}

export function protocolCreateDescriptionLabel(
  kind: ProtocolCreateKind
): string {
  return kind === 'signal' ? 'Signal' : 'Description';
}

export function protocolCreateDescriptionPlaceholder(
  kind: ProtocolCreateKind,
  context: ProtocolCreateDescriptionContext = {}
): string {
  const roleLabel = context.roleId?.trim() || 'the role';

  switch (kind) {
    case 'signal':
      return 'What should the DAO consider?';
    case 'transfer':
      return 'Why the DAO should send these funds';
    case 'fund_season_pool':
      return 'Why the DAO should sponsor this rally pool';
    case 'withdraw_boost_infra':
      return 'Why the DAO should withdraw boost infra funds now';
    case 'set_boost_infra_authority':
      return 'Why treasury DAO should receive boost infra withdraw authority';
    case 'transfer_ownership':
      return 'Why ownership should move to this account';
    case 'contract_upgrade':
      return 'Why this contract should upgrade to the published hash';
    case 'contract_config':
      return 'Why this contract setting should change';
    case 'season_config':
      return 'Why this rally should start';
    case 'leave_self':
      return 'Why you are stepping back from this role';
    case 'remove_member':
      return `Why they should leave ${roleLabel}`;
    case 'join_self':
      return `Why you should join ${roleLabel}`;
    case 'add_member':
      return `Why they should join ${roleLabel}`;
    default:
      return 'Why the DAO should approve this proposal';
  }
}

export function protocolCreateDescriptionReady(value: string): boolean {
  return isBoundedNoteReady(value, PROPOSAL_DESCRIPTION_LIMITS);
}
