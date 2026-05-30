export const portalElevatedShadowClass =
  'shadow-[var(--portal-overlay-shadow)]';

/** Shared shell for max-w-md modals — rewards, account facts, assets. */
export const compactModalShellClass =
  'relative flex max-h-[min(640px,calc(100vh-2rem))] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border/67 bg-background/98';

export const compactModalBodyClass =
  'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 md:px-5';

export const floatingPanelClass = `rounded-xl md:rounded-2xl border border-border/67 bg-background/98 ${portalElevatedShadowClass}`;

export const floatingPanelItemClass =
  'w-full flex items-center gap-2 md:gap-3 rounded-lg md:rounded-xl px-2.5 py-1.5 md:px-3 md:py-2.5 text-[13px] md:text-sm text-muted-foreground transition-colors hover:bg-[var(--portal-slate-bg)] hover:text-foreground focus-visible:bg-[var(--portal-slate-bg)] focus-visible:text-foreground focus-visible:outline-none text-left';

/** Menu row with trailing ProtocolMotionArrow (e.g. View on Explorer). */
export const floatingPanelItemWithMotionClass = `${floatingPanelItemClass} group`;

export const floatingPanelItemActiveClass =
  'bg-[var(--portal-slate-bg)] text-foreground';

export const floatingPanelItemSelectedClass =
  'bg-[var(--portal-slate-frame-bg)] text-foreground font-medium';

export const floatingPanelDividerClass =
  'h-px divider-section mx-1.5 md:mx-2 my-0.5';

/** Wallet dropdown — single panel surface with section dividers. */
export const walletMenuSectionShellClass = 'p-1';

export const walletMenuCardClass =
  'flex flex-col gap-2 px-2 py-1.5 md:gap-2.5 md:px-2.5 md:py-2';

/** @deprecated Use walletMenuCardClass — kept for any stale imports. */
export const walletMenuSectionContentClass = walletMenuCardClass;

export const walletMenuSectionLabelClass =
  'text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/60';

/** Inset divider inside the wallet menu card (matches portal divider-section). */
export const walletMenuInnerDividerClass =
  'h-px w-full shrink-0 divider-section';

/** Profile hover row — same radius and vertical padding as floatingPanelItemClass. */
export const walletMenuProfileHoverClass =
  'rounded-lg transition-colors hover:bg-[var(--portal-slate-bg)] md:rounded-xl';

/** Icon row — flush with card; separated by walletMenuInnerDividerClass above. */
export const walletMenuActionDockClass = 'flex items-center gap-0';

export const walletMenuActionDockGroupClass = 'grid min-w-0 flex-1 grid-cols-3';

export const walletMenuActionDockButtonClass =
  'inline-flex h-8 w-full items-center justify-center rounded-lg text-muted-foreground/65 transition-colors hover:bg-[var(--portal-slate-bg)] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--portal-slate-border-strong)] md:h-9';

export const walletMenuActionDockDisconnectClass =
  'text-[var(--portal-red)]/80 hover:bg-[var(--portal-red-bg)] hover:text-[var(--portal-red)] focus-visible:ring-[var(--portal-red-border)]';

/** Vertical split before disconnect — portal divider-v-section. */
export const walletMenuActionDockDividerClass =
  'mx-1.5 h-5 w-px shrink-0 divider-v-section md:mx-2';

/** @deprecated Vertical action rows — use walletMenuActionDock instead. */
export const walletMenuActionRowClass =
  'flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-[11px] text-muted-foreground/70 transition-colors hover:bg-[var(--portal-slate-bg)] hover:text-foreground focus-visible:bg-[var(--portal-slate-bg)] focus-visible:text-foreground focus-visible:outline-none md:py-1.5 md:text-[12px]';

export const walletMenuActionIconClass = 'h-3 w-3 shrink-0 opacity-75';

export const walletMenuDisconnectRowClass =
  'text-[var(--portal-red)]/85 hover:bg-[var(--portal-red-bg)] hover:text-[var(--portal-red)] focus-visible:bg-[var(--portal-red-bg)] focus-visible:text-[var(--portal-red)]';

/** Identity block — mobile sizes feel right; scale up on desktop with the wider panel. */
export const walletMenuIdentityNameClass =
  'text-[13px] font-medium leading-tight md:text-sm';

export const walletMenuIdentityHandleClass =
  'text-[10px] leading-tight text-muted-foreground/55 md:text-[11px]';

/** Compact wallet panel — fits dock + metrics without feeling wide. */
export const walletMenuPanelWidthClass =
  'w-[min(100vw-1rem,15.25rem)] sm:w-56 md:w-[15.75rem]';

/** Lucide icons in wallet menu action rows — Discover, Explorer, etc. */
export const walletMenuIconClass = 'h-3.5 w-3.5 shrink-0 md:h-4 md:w-4';
