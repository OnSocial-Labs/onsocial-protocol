import {
  marketMediumLabel,
  normalizeMediumKind,
} from '@/features/market/market-medium';
import type { WritingReleaseFormat } from '@/features/scarces/drop-writing';

/** Inputs shared by Market listings and profile drop rows. */
export interface ScarceRowKindInput {
  mediumKind?: string | null;
  audioFormat?: 'single' | 'album' | 'podcast' | 'audiobook' | null;
  writingFormat?: WritingReleaseFormat | null;
}

/**
 * Row format label — Album, Ticket, Writing… (party lead + deal/meta).
 * Singular on rows; plural stays on filters.
 */
export function scarceRowFormatLabel(input: ScarceRowKindInput): string | null {
  const medium = normalizeMediumKind(input.mediumKind);
  if (medium === 'audio') {
    if (input.audioFormat === 'album') return 'Album';
    if (input.audioFormat === 'single') return 'Single';
    if (input.audioFormat === 'podcast') return 'Podcast';
    if (input.audioFormat === 'audiobook') return 'Audiobook';
    return 'Audio';
  }
  if (medium === 'writing') {
    if (input.writingFormat === 'book') return 'Book';
    if (input.writingFormat === 'issue') return 'Issue';
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

export type ScarceRowPartyRole = 'creator' | 'listed' | 'bought' | 'series';

/**
 * Quiet party stamp above the face — `{Kind} by`, or a commerce/role verb.
 * Never concatenates the account name (identity stays on `.drops-discovery-by`).
 */
export function scarceRowPartyLead(
  input: ScarceRowKindInput,
  opts?: {
    role?: ScarceRowPartyRole;
    /** Events catalog — Ticket medium reads as Event. */
    voice?: 'default' | 'event';
    /** Medium tab already names the kind (or kind is on a fact line). */
    omitKind?: boolean;
  }
): string | false {
  const role = opts?.role ?? 'creator';
  if (role === 'listed') return 'Listed by';
  if (role === 'bought') return 'Bought by';
  if (role === 'series') return 'Series by';

  if (opts?.omitKind) return 'by';
  if (opts?.voice === 'event') return 'Event by';

  const kind = scarceRowFormatLabel(input);
  return kind ? `${kind} by` : 'by';
}
