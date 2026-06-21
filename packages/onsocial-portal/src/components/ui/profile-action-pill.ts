import { cn } from '@/lib/utils';
import { portalType } from '@/lib/portal-typography';

export type ProfileActionPillTone =
  | 'blue'
  | 'purple'
  | 'gold'
  | 'green'
  | 'neutral';

export const profileActionButtonBaseClass = `group inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-0.5 ${portalType.label} font-medium transition-all duration-150 hover:backdrop-blur-sm active:scale-[0.98] active:opacity-90 focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50`;

export function profileActionToneClass(tone: ProfileActionPillTone): string {
  switch (tone) {
    case 'blue':
      return 'border-[var(--portal-blue-border)] bg-[var(--portal-blue-bg)] text-[var(--portal-blue)] hover:border-[var(--portal-blue-border-strong)] hover:bg-[var(--portal-blue-bg)] hover:text-[var(--portal-blue)] active:text-[var(--portal-blue)] focus-visible:ring-[var(--portal-blue-border)]';
    case 'purple':
      return 'border-[var(--portal-purple-border)] bg-[var(--portal-purple-bg)] text-[var(--portal-purple)]/90 hover:border-[var(--portal-purple-border-strong)] hover:bg-[var(--portal-purple-bg)] hover:text-[var(--portal-purple)] active:text-[var(--portal-purple)] focus-visible:ring-[var(--portal-purple-border)]';
    case 'gold':
      return 'border-[var(--portal-gold-border)] bg-[var(--portal-gold-bg)] text-[var(--portal-gold)]/90 hover:border-[var(--portal-gold-border-strong)] hover:bg-[var(--portal-gold-bg)] hover:text-[var(--portal-gold)] active:text-[var(--portal-gold)] focus-visible:ring-[var(--portal-gold-border)]';
    case 'green':
      return 'border-[var(--portal-green-border)] bg-[var(--portal-green-bg)] text-[var(--portal-green)] hover:border-[var(--portal-green-border-strong)] hover:bg-[var(--portal-green-bg)] hover:text-[var(--portal-green)] active:text-[var(--portal-green)] focus-visible:ring-[var(--portal-green-border)]';
    case 'neutral':
      return 'border-[var(--portal-neutral-frame-border)] bg-[var(--portal-neutral-bg)] text-[var(--portal-neutral)]/90 hover:border-[var(--portal-neutral-border-strong)] hover:bg-[var(--portal-neutral-bg)] hover:text-[var(--portal-neutral)] active:text-[var(--portal-neutral)] focus-visible:ring-[var(--portal-neutral-border-strong)]';
  }
}

export function profileActionButtonClass(tone: ProfileActionPillTone): string {
  return `${profileActionButtonBaseClass} ${profileActionToneClass(tone)}`;
}

/** Shared compact pill shell (layout only). */
export const portalCompactPillShellClass = `group inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 ${portalType.label} font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 active:scale-[0.98] active:opacity-90 disabled:pointer-events-none disabled:opacity-50`;

/** Neutral rounded pill for wallet + profile compact actions. */
export const portalCompactActionPillClass = cn(
  portalCompactPillShellClass,
  'portal-neutral-control focus-visible:ring-[var(--portal-neutral-border-strong)]'
);

export type WalletMenuActionVariant =
  | 'edit'
  | 'create'
  | 'claim'
  | 'claim-ready';

export function walletMenuActionButtonClass(
  variant: WalletMenuActionVariant
): string {
  if (variant === 'claim-ready') {
    return cn(
      portalCompactPillShellClass,
      'portal-green-surface focus-visible:ring-[var(--portal-green-border)]'
    );
  }

  return cn(
    portalCompactActionPillClass,
    variant === 'edit' && 'text-muted-foreground/70',
    variant === 'create' && 'text-muted-foreground/70',
    variant === 'claim' && 'text-muted-foreground/45'
  );
}

export type ProfileSocialActionLayout = 'pill' | 'bar';

const profileSocialActionBarShellClass =
  'inline-flex min-h-[32px] w-full items-center justify-center gap-1 rounded-lg px-2 py-1.5 whitespace-nowrap leading-none';

/** Equal thirds — Stand / Endorse / Support on profile social strip. */
export const profileSocialActionBarClass = 'grid grid-cols-3 gap-1';

function profileSocialGesturePillShell(
  layout: ProfileSocialActionLayout = 'pill',
  iconOnly = false
): string {
  return cn(
    portalCompactActionPillClass,
    layout === 'bar'
      ? profileSocialActionBarShellClass
      : iconOnly
        ? 'inline-flex h-[24px] w-[24px] items-center justify-center p-0 leading-none'
        : 'inline-flex h-[24px] items-center justify-center whitespace-nowrap leading-none text-muted-foreground/80 hover:text-foreground'
  );
}

/** Stand with — neutral shell, blue arrow. Standing — outline secondary (matches page back actions). */
export function profileSocialStandingButtonClass(
  active = false,
  layout: ProfileSocialActionLayout = 'pill'
): string {
  const shell = cn(
    portalCompactPillShellClass,
    layout === 'bar'
      ? profileSocialActionBarShellClass
      : 'inline-flex h-[24px] items-center justify-center whitespace-nowrap leading-none'
  );

  if (active) {
    return cn(
      shell,
      'border-border/50 bg-transparent text-muted-foreground',
      'shadow-[0_1px_2px_-1px_var(--portal-neutral-shadow)]',
      'hover:border-border hover:bg-[var(--portal-neutral-bg)] hover:text-foreground',
      'hover:shadow-[0_4px_6px_-1px_var(--portal-neutral-shadow),0_2px_4px_-2px_var(--portal-neutral-shadow)]',
      'focus-visible:ring-[var(--portal-neutral-border-strong)]'
    );
  }

  return profileSocialGesturePillShell(layout);
}

/** Endorse — neutral shell, gold motion arrow. */
export function profileSocialEndorseButtonClass(
  layout: ProfileSocialActionLayout = 'pill'
): string {
  return profileSocialGesturePillShell(layout);
}

/** Support — neutral shell; arrow + heart (pill) or label room (bar). */
export function profileSocialSupportButtonClass(
  layout: ProfileSocialActionLayout = 'pill'
): string {
  return profileSocialGesturePillShell(layout);
}

/** Collect — neutral shell; arrow + gift + amount (no verb label). */
export function profileSocialCollectButtonClass(
  layout: ProfileSocialActionLayout = 'pill'
): string {
  return profileSocialGesturePillShell(layout);
}

/** Shared glyph box for profile Stand / Endorse / Support actions. */
export const profileSocialGestureIconClass = 'h-2.5 w-2.5 shrink-0';

export function profileSocialEndorseArrowClass(): string {
  return cn(
    profileSocialGestureIconClass,
    'text-[var(--portal-gold)]/75 group-hover:text-[var(--portal-gold)]'
  );
}

export function profileSocialSupportArrowClass(): string {
  return cn(
    profileSocialGestureIconClass,
    'text-[var(--portal-green)]/75 group-hover:text-[var(--portal-green)]'
  );
}

export function profileSocialCollectArrowClass(): string {
  return cn(
    profileSocialGestureIconClass,
    'text-[var(--portal-gold)]/75 group-hover:text-[var(--portal-gold)]'
  );
}

/** Inherits pill muted → foreground hover like the Endorse label. */
export function profileSocialSupportHeartClass(): string {
  return 'h-3 w-3 shrink-0';
}

/** Inherits pill muted → foreground hover like the Endorse label. */
export function profileSocialCollectGiftClass(): string {
  return 'h-3 w-3 shrink-0';
}

export function profileSocialStandingArrowClass(): string {
  return cn(
    profileSocialGestureIconClass,
    'text-[var(--portal-blue)]/80 group-hover:text-[var(--portal-blue)]'
  );
}

export const profileSocialStandingIconSlotClass =
  'inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center';

export const profileSocialStandingDotClass =
  'h-1 w-1 rounded-full bg-[var(--portal-blue)]/55';

export const profileSocialStandingStepBackArrowClass = cn(
  profileSocialGestureIconClass,
  'text-[var(--portal-red)] opacity-100'
);

/** Stack Standing / Step back so the pill keeps a fixed width. */
export const profileSocialStandingToggleClass =
  'relative inline-grid grid-cols-1 grid-rows-1 items-center justify-items-center';

export const profileSocialStandingToggleStateClass =
  'col-start-1 row-start-1 inline-flex h-3.5 items-center gap-1 leading-none';

/** Shared 20px meta row — matches avatar height for exact vertical alignment. */
export const profileSocialMetaRowClass =
  'mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1';

export const profileSocialMetaRowItemClass = 'inline-flex items-center';
