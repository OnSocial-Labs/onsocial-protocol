/**
 * Stake-gated Members role copy — threshold, progress, CTA.
 * Keep amounts pre-formatted (compact); this only assembles voice.
 */

export const DAO_STAKE_ROLE_PROGRESS_LABEL = 'Your stake';
export const DAO_STAKE_ROLE_META = 'Stake';
export const DAO_STAKE_ROLE_MET_STATUS = "You're in";
export const DAO_STAKE_ROLE_CONNECT_CTA = 'Connect to stake';

/** Gate line — requirement only; CTA carries the verb. */
export function daoStakeRoleGateCopy(
  thresholdLabel: string,
  tokenLabel: string
): string {
  return `${thresholdLabel} ${tokenLabel} required to propose.`;
}

/** Right-side metric value: `0 / 500 SOCIAL`. */
export function daoStakeRoleProgressValue(
  delegatedLabel: string,
  thresholdLabel: string,
  tokenLabel: string
): string {
  return `${delegatedLabel} / ${thresholdLabel} ${tokenLabel}`;
}

export function daoStakeRoleCtaLabel(
  remainingLabel: string,
  tokenLabel: string
): string {
  return `Stake ${remainingLabel} ${tokenLabel}`;
}
