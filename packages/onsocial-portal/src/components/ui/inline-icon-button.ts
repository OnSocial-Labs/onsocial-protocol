import { cn } from '@/lib/utils';

/** Trailing icon control inside compact rows (search clear, wallet copy, rewards help). */
export const inlineAccessoryIconButtonBaseClass =
  'inline-flex shrink-0 items-center justify-center rounded-full border border-transparent text-muted-foreground/55 transition-all duration-150 hover:border-border/40 hover:bg-background/50 hover:text-muted-foreground/80 hover:backdrop-blur-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--portal-slate-border-strong)] active:scale-95 active:opacity-80 active:text-muted-foreground/80';

export const inlineAccessoryIconButtonSizeClass = {
  sm: 'h-5 w-5',
  md: 'h-6 w-6',
} as const;

export const inlineAccessoryIconSizeClass = {
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
} as const;

export function inlineAccessoryIconButtonClass(
  size: keyof typeof inlineAccessoryIconButtonSizeClass = 'md'
): string {
  return cn(
    inlineAccessoryIconButtonBaseClass,
    inlineAccessoryIconButtonSizeClass[size]
  );
}

export function inlineAccessoryIconClass(
  size: keyof typeof inlineAccessoryIconSizeClass = 'md'
): string {
  return inlineAccessoryIconSizeClass[size];
}

/** Wallet dropdown inline controls — copy, help (same size + stroke). */
export const walletDropdownAccessoryButtonClass =
  inlineAccessoryIconButtonClass('md');

export const walletDropdownAccessoryIconClass = inlineAccessoryIconClass('sm');

export const walletDropdownAccessoryIconStroke = 1.75;
