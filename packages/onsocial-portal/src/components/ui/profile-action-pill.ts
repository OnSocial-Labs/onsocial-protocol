export type ProfileActionPillTone =
  | 'blue'
  | 'purple'
  | 'gold'
  | 'green'
  | 'slate';

export const profileActionButtonBaseClass =
  'group inline-flex shrink-0 items-center gap-1 rounded-lg border border-transparent px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] transition-all duration-150 hover:border-border/40 hover:bg-background/50 hover:backdrop-blur-sm active:scale-95 active:opacity-80 focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50';

export function profileActionToneClass(tone: ProfileActionPillTone): string {
  switch (tone) {
    case 'blue':
      return 'text-[var(--portal-blue)]/75 hover:text-[var(--portal-blue)] active:text-[var(--portal-blue)] focus-visible:ring-[var(--portal-blue-border)]';
    case 'purple':
      return 'text-[var(--portal-purple)]/75 hover:text-[var(--portal-purple)] active:text-[var(--portal-purple)] focus-visible:ring-[var(--portal-purple-border)]';
    case 'gold':
      return 'text-[var(--portal-gold)]/75 hover:text-[var(--portal-gold)] active:text-[var(--portal-gold)] focus-visible:ring-[var(--portal-gold-border)]';
    case 'green':
      return 'border-[var(--portal-green-border)] bg-[var(--portal-green-bg)] text-[var(--portal-green)] hover:border-[var(--portal-green-border)] hover:bg-[var(--portal-green-bg)] hover:text-[var(--portal-green)] active:text-[var(--portal-green)] focus-visible:ring-[var(--portal-green-border)]';
    case 'slate':
      return 'text-muted-foreground/55 hover:text-muted-foreground/80 active:text-muted-foreground/80 focus-visible:ring-[var(--portal-slate-border-strong)]';
  }
}

export function profileActionButtonClass(tone: ProfileActionPillTone): string {
  return `${profileActionButtonBaseClass} ${profileActionToneClass(tone)}`;
}
