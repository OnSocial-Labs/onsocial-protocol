/** Logged-out Create DAO CTA — never Connect wallet. */
export const DAO_CREATE_CONNECT_CTA = 'Connect';

/** Create DAO sheet body — footer owns Connect. */
export const DAO_CREATE_CONNECT_HINT = 'Connect to create a DAO.';

/** Header deal line — attach amount only, no gas / bond. */
export function daoCreateWhisper(nearLabel: string): string {
  return `You start as council · ~${nearLabel} NEAR`;
}

/** Same hint slot as Connect — spendable short of the attach. */
export function daoCreateNearShortHint(nearLabel: string): string {
  return `Need ~${nearLabel} more NEAR.`;
}

/** Same toggle voice as New drop Advanced. */
export const DAO_CREATE_ADVANCED = 'Advanced';
export const DAO_CREATE_ADVANCED_HIDE = 'Hide advanced';

/** Optional face publish — same create step, no Call / bond explainer. */
export const DAO_CREATE_PUBLISH = 'Publish OnSocial profile';

/** Same toggle voice as New drop description. */
export function daoCreatePurposeToggle(opts: {
  open: boolean;
  hasText: boolean;
}): string {
  if (opts.open) return 'Hide purpose';
  return opts.hasText ? 'Edit purpose' : 'Add a purpose';
}

/** DAO page look — Cover + Crest beside the name. Not Banner. Not Badge. */
export const DAO_CREATE_ADD_COVER = 'Add cover';
export const DAO_CREATE_ADD_CREST = 'Add crest';
export const DAO_CREATE_CHANGE_COVER = 'Change cover';
export const DAO_CREATE_CHANGE_CREST = 'Change crest';
export const DAO_CREATE_REMOVE_COVER = 'Remove cover';
export const DAO_CREATE_REMOVE_CREST = 'Remove crest';
