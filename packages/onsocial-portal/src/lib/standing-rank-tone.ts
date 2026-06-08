export type StandingRankTone = 'gold' | 'silver' | 'purple' | 'neutral';

export function standingRankTone(rank: number): StandingRankTone {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'purple';
  if (rank === 3) return 'silver';
  return 'neutral';
}

export const STANDING_RANK_SCORE_CLASS: Record<StandingRankTone, string> = {
  gold: 'portal-gold-text',
  silver: 'portal-neutral-text',
  purple: 'portal-purple-text',
  neutral: 'text-foreground',
};

export const STANDING_RANK_FOCUS_RING_CLASS: Record<StandingRankTone, string> =
  {
    gold: 'focus-visible:ring-[var(--portal-gold)]',
    silver: 'focus-visible:ring-[var(--portal-neutral)]',
    purple: 'focus-visible:ring-[var(--portal-purple)]',
    neutral: 'focus-visible:ring-[var(--portal-gold)]',
  };

export const STANDING_RANK_MIX_BAR_CLASS: Record<StandingRankTone, string> = {
  gold: 'bg-[var(--portal-gold)]/50',
  silver: 'bg-[var(--portal-neutral)]/50',
  purple: 'bg-[var(--portal-purple)]/50',
  neutral: 'bg-foreground/12',
};

export const STANDING_RANK_PODIUM = {
  gold: {
    ring: 'ring-2 ring-[var(--portal-gold)]',
    badge: 'bg-[var(--portal-gold)]',
    chip: 'bg-[var(--portal-gold)]',
    ink: 'text-[#16120b]',
  },
  silver: {
    ring: 'ring-2 ring-[var(--portal-neutral-border-strong)]',
    badge: 'bg-[var(--portal-neutral)]',
    chip: 'bg-[var(--portal-neutral)]',
    ink: 'text-[#f8fafc]',
  },
  purple: {
    ring: 'ring-2 ring-[var(--portal-purple)]',
    badge: 'bg-[var(--portal-purple)]',
    chip: 'bg-[var(--portal-purple)]',
    ink: 'text-[#140a28]',
  },
} as const;
