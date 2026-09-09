/** Same toggle voice as New drop description and Create DAO purpose. */
export function hubCreateAboutToggle(opts: {
  open: boolean;
  hasText: boolean;
}): string {
  if (opts.open) return 'Hide about';
  return opts.hasText ? 'Edit about' : 'Add about';
}

/** Hub page look — Banner / Logo, not Cover / Crest. */
export const HUB_CREATE_ADD_BANNER = 'Add banner';
export const HUB_CREATE_ADD_LOGO = 'Add logo';
export const HUB_CREATE_CHANGE_BANNER = 'Change banner';
export const HUB_CREATE_CHANGE_LOGO = 'Change logo';
export const HUB_CREATE_REMOVE_BANNER = 'Remove banner';
export const HUB_CREATE_REMOVE_LOGO = 'Remove logo';
export const HUB_CREATE_CONNECT = 'Connect';
export const HUB_CREATE_SUBMIT = 'Open hub';
export const HUB_CREATE_FORM_ID = 'hub-create-form';
