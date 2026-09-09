import { osChromePageClassName } from '@/lib/os-chrome-page';

/**
 * Create-place form root. Inset is `.os-app-chrome-page` →
 * `--os-screen-body-inset` on OsAppScreen. Feature classes add layout only.
 */
export function osCreatePageClassName(
  ...parts: Array<string | false | null | undefined>
): string {
  return osChromePageClassName(...parts);
}

export const GUILD_CREATE_FORM_CLASS = osCreatePageClassName('guild-create-form');

export const HUB_CREATE_FORM_CLASS = osCreatePageClassName(
  'drop-create-form',
  'hub-create-form'
);

export const DROP_CREATE_FORM_CLASS = osCreatePageClassName('drop-create-form');

export const DAO_CREATE_FORM_CLASS = osCreatePageClassName(
  'protocol-task-form',
  'dao-create-form'
);
