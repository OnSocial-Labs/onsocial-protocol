/** Same toggle voice as Open a hub About and Create DAO purpose. */
export function guildCreateAboutToggle(opts: {
  open: boolean;
  hasText: boolean;
}): string {
  if (opts.open) return 'Hide about';
  return opts.hasText ? 'Edit about' : 'Add about';
}

export const GUILD_CREATE_TITLE = 'Create guild';
export const GUILD_CREATE_HELP_TITLE = 'Your guild';
export const GUILD_CREATE_CLOSE = 'Close';
export const GUILD_CREATE_CONNECT = 'Connect';
export const GUILD_CREATE_SUBMIT = 'Create guild';
export const GUILD_CREATE_FORM_ID = 'guild-create-form';

/** Guild page look — Banner + Badge beside the name. Not Logo. Not Cover. */
export const GUILD_CREATE_ADD_BANNER = 'Add banner';
export const GUILD_CREATE_ADD_BADGE = 'Add badge';
export const GUILD_CREATE_CHANGE_BANNER = 'Change banner';
export const GUILD_CREATE_CHANGE_BADGE = 'Change badge';
export const GUILD_CREATE_REMOVE_BANNER = 'Remove banner';
export const GUILD_CREATE_REMOVE_BADGE = 'Remove badge';
