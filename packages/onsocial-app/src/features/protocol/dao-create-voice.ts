/** Logged-out Create DAO CTA — never Connect wallet. */
export const DAO_CREATE_CONNECT_CTA = 'Connect';

/** Create DAO sheet body — footer owns Connect. */
export const DAO_CREATE_CONNECT_HINT = 'Connect to create a DAO.';

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
