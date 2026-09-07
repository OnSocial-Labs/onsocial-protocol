/** Same toggle voice as New drop description and Create DAO purpose. */
export function hubCreateAboutToggle(opts: {
  open: boolean;
  hasText: boolean;
}): string {
  if (opts.open) return 'Hide about';
  return opts.hasText ? 'Edit about' : 'Add about';
}

/** Same write-dock tools as Create DAO Cover/Crest — hub words match Edit look. */
export const HUB_CREATE_ADD_BANNER = 'Add banner';
export const HUB_CREATE_ADD_LOGO = 'Add logo';
export const HUB_CREATE_REMOVE_BANNER = 'Remove banner';
export const HUB_CREATE_REMOVE_LOGO = 'Remove logo';
export const HUB_CREATE_BANNER_CAPTION = 'Banner';
export const HUB_CREATE_LOGO_CAPTION = 'Logo';
