/** Create DAO place title — and the connected footer submit. */
export const DAO_CREATE_TITLE = 'Create DAO';

export const DAO_CREATE_FORM_ID = 'dao-create-form';

/** Logged-out Create DAO CTA — never Connect wallet. */
export const DAO_CREATE_CONNECT_CTA = 'Connect';

/** Create DAO place body — footer owns Connect. */
export const DAO_CREATE_CONNECT_HINT = 'Connect to create a DAO.';

/** Header deal line — attach amount only, no gas / bond. */
export function daoCreateWhisper(nearLabel: string): string {
  return `You start as council · ~${nearLabel} NEAR`;
}

/** Same hint slot as Connect — spendable short of the attach. */
export function daoCreateNearShortHint(nearLabel: string): string {
  return `Need ~${nearLabel} more NEAR`;
}

/** Optional face publish — same create step, no Call / bond explainer. */
export const DAO_CREATE_PUBLISH = 'Publish OnSocial profile';

/** Edit config batch toggle — Face outcome + honest two-proposal count. */
export const DAO_EDIT_PUBLISH_HINT = 'Also write Face · two proposals';

/** Starter governance — always on Create DAO (SheetFact section). */
export const DAO_CREATE_DEFAULT_POLICY = 'Default policy';

/** Same toggle voice as Open a hub About. */
export function daoCreatePurposeToggle(opts: {
  open: boolean;
  hasText: boolean;
}): string {
  if (opts.open) return 'Hide purpose';
  return opts.hasText ? 'Edit purpose' : 'Add a purpose';
}

/** Same toggle voice as Add a purpose. */
export function daoCreateLinksToggle(opts: {
  open: boolean;
  hasText: boolean;
}): string {
  if (opts.open) return 'Hide links';
  return opts.hasText ? 'Edit links' : 'Add links';
}

/** DAO portfolio look — Cover + Crest on the cover. Not Banner. Not Badge. */
export const DAO_CREATE_ADD_COVER = 'Add cover';
export const DAO_CREATE_ADD_CREST = 'Add crest';
export const DAO_CREATE_CHANGE_COVER = 'Change cover';
export const DAO_CREATE_CHANGE_CREST = 'Change crest';
export const DAO_CREATE_REMOVE_COVER = 'Remove cover';
export const DAO_CREATE_REMOVE_CREST = 'Remove crest';
