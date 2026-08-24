import {
  marketMediumLabel,
  normalizeMediumKind,
} from '@/features/market/market-medium';
import type { WritingReleaseFormat } from '@/features/scarces/drop-writing';

/** Inputs shared by Market listings and profile drop rows. */
export interface ScarceRowKindInput {
  mediumKind?: string | null;
  audioFormat?: 'single' | 'album' | 'podcast' | null;
  writingFormat?: WritingReleaseFormat | null;
}

/**
 * Row format label — Album, Ticket, Writing… (Drops deal line + optional eyebrow).
 * Matches Drops discovery vocabulary; singular on rows, plural stays on filters.
 */
export function scarceRowFormatLabel(input: ScarceRowKindInput): string | null {
  const medium = normalizeMediumKind(input.mediumKind);
  if (medium === 'audio') {
    if (input.audioFormat === 'album') return 'Album';
    if (input.audioFormat === 'single') return 'Single';
    if (input.audioFormat === 'podcast') return 'Podcast';
    return 'Audio';
  }
  if (medium === 'writing') {
    if (input.writingFormat === 'book') return 'Book';
    if (input.writingFormat === 'article') return 'Article';
    return 'Writing';
  }
  if (!medium) return null;
  const label = marketMediumLabel(medium);
  if (!label) return null;
  if (label === 'Tickets') return 'Ticket';
  if (label === 'Coupons') return 'Coupon';
  if (label === 'Memberships') return 'Membership';
  if (label === 'Thoughts') return 'Thought';
  return label;
}

/** @deprecated Use {@link scarceRowFormatLabel} — same label, prefer deal-line placement. */
export const scarceRowKindEyebrow = scarceRowFormatLabel;
