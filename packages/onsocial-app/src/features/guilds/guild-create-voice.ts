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
