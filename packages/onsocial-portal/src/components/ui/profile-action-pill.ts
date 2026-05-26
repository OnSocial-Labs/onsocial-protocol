export type ProfileActionPillTone = 'blue' | 'purple' | 'slate';

export const profileActionButtonBaseClass =
  'inline-flex h-7 min-w-[88px] shrink-0 items-center justify-center rounded-full border px-2.5 text-xs font-medium shadow-none transition-[border-color,background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50 md:h-7 md:px-2.5';

export function profileActionToneClass(tone: ProfileActionPillTone): string {
  switch (tone) {
    case 'blue':
      return 'border-[var(--portal-blue-frame-border)] bg-[var(--portal-blue-bg)] text-[var(--portal-blue)] hover:border-[var(--portal-blue-border-strong)] hover:bg-[var(--portal-blue-frame-bg)] hover:text-[var(--portal-blue)] hover:shadow-[0_4px_6px_-1px_var(--portal-blue-shadow),0_2px_4px_-2px_var(--portal-blue-shadow)] focus-visible:ring-[var(--portal-blue-border)] focus-visible:shadow-[0_4px_6px_-1px_var(--portal-blue-shadow),0_2px_4px_-2px_var(--portal-blue-shadow)]';
    case 'purple':
      return 'border-[var(--portal-purple-frame-border)] bg-[var(--portal-purple-bg)] text-[var(--portal-purple)] hover:border-[var(--portal-purple-border-strong)] hover:bg-[var(--portal-purple-frame-bg)] hover:text-[var(--portal-purple)] hover:shadow-[0_4px_6px_-1px_var(--portal-purple-shadow),0_2px_4px_-2px_var(--portal-purple-shadow)] focus-visible:ring-[var(--portal-purple-border)] focus-visible:shadow-[0_4px_6px_-1px_var(--portal-purple-shadow),0_2px_4px_-2px_var(--portal-purple-shadow)]';
    case 'slate':
      return 'border-[var(--portal-slate-frame-border)] bg-[var(--portal-slate-bg)] text-[var(--portal-slate)] hover:border-[var(--portal-slate-border-strong)] hover:bg-[var(--portal-slate-frame-bg)] hover:text-[var(--portal-slate)] hover:shadow-[0_4px_6px_-1px_var(--portal-slate-shadow),0_2px_4px_-2px_var(--portal-slate-shadow)] focus-visible:ring-[var(--portal-slate-border-strong)] focus-visible:shadow-[0_4px_6px_-1px_var(--portal-slate-shadow),0_2px_4px_-2px_var(--portal-slate-shadow)]';
  }
}

export function profileActionButtonClass(
  tone: ProfileActionPillTone
): string {
  return `${profileActionButtonBaseClass} ${profileActionToneClass(tone)}`;
}
