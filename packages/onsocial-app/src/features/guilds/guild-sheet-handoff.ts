import type { GlassSheetPresentation } from '@onsocial/ui';
import type { GuildSettingsActionId } from '@/features/guilds/guild-settings-actions';

/** Matches `glass-sheet-crossfade` — settle only after the replace fade. */
export const GUILD_SETTINGS_HANDOFF_CROSSFADE_MS = 180;

/**
 * Settings → rooms crossfades once. Latch that swap so clearing the handoff
 * flag does not restart the rooms sheet, and later drawers open on their own.
 */
export function latchOpenedSwap(
  open: boolean,
  handoff: boolean,
  latched: boolean
): boolean {
  if (!open) return false;
  return latched || handoff;
}

/**
 * While the provider is active, pass `enter` so GlassSheet rewrites to swap
 * *with* the crossfade. After settle, hold explicit `swap` so clearing the
 * handoff flag does not restart a bottom slide.
 */
export function guildSettingsDrawerPresentation(
  open: boolean,
  handoff: boolean,
  latched: boolean
): GlassSheetPresentation {
  if (!open) return 'enter';
  if (handoff) return 'enter';
  if (latched) return 'swap';
  return 'enter';
}

/**
 * Hug successors replace Settings via handoff. Edit is a slide-over — close
 * Settings with a normal dismiss, no swap.
 */
export function guildSettingsHandoffIsReplace(
  id: GuildSettingsActionId
): boolean {
  return id !== 'edit';
}
