/**
 * Inline "What's your craft?" prompt on the owner's About — one field, no
 * form flow. Dismissal persists per account so skipping survives reloads.
 */

const ABOUT_CRAFT_PROMPT_DISMISS_PREFIX =
  'onsocial.about-craft-prompt.dismissed.';

export function aboutCraftPromptDismissKey(accountId: string): string {
  return `${ABOUT_CRAFT_PROMPT_DISMISS_PREFIX}${accountId.trim().toLowerCase()}`;
}

export function readAboutCraftPromptDismissed(accountId: string): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return (
      window.localStorage.getItem(aboutCraftPromptDismissKey(accountId)) === '1'
    );
  } catch {
    return false;
  }
}

export function writeAboutCraftPromptDismissed(accountId: string): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(aboutCraftPromptDismissKey(accountId), '1');
  } catch {
    // Private mode / denied — the prompt simply returns next visit.
  }
}

/** Owner-only, craft kinds, nothing set yet, not skipped. */
export function shouldShowAboutCraftPrompt(input: {
  viewerAccountId: string | null;
  profileAccountId: string;
  showsCrafts: boolean;
  hasCrafts: boolean;
  dismissed: boolean;
}): boolean {
  if (!input.viewerAccountId) return false;
  if (
    input.viewerAccountId.trim().toLowerCase() !==
    input.profileAccountId.trim().toLowerCase()
  ) {
    return false;
  }
  if (!input.showsCrafts || input.hasCrafts) return false;
  return !input.dismissed;
}
