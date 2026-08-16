import type { EndorsementListItem, MediaRef } from '@onsocial/sdk';

export const ENDORSEMENTS_PAGE_SIZE = 24;

export type EndorsementsMode = 'received' | 'given';

export type EndorsementPanelItem = EndorsementListItem & {
  issuerName: string | null;
  issuerAvatarUrl: string | null;
  targetName: string | null;
  targetAvatarUrl: string | null;
  mediaUrl: string | null;
};

export interface EndorsementsPanelResponse {
  accountId: string;
  counts: { received: number; given: number };
  received: EndorsementPanelItem[];
  given: EndorsementPanelItem[];
  receivedHasMore: boolean;
  givenHasMore: boolean;
}

export interface EndorsementsModePageResponse {
  accountId: string;
  mode: EndorsementsMode;
  counts: { received: number; given: number };
  items: EndorsementPanelItem[];
  hasMore: boolean;
  nextOffset: number | null;
}

/** Draft used to prefill / edit an existing vouch. */
export type EndorseExistingDraft = {
  id?: string | null;
  topic?: string | null;
  note?: string | null;
  media?: MediaRef | null;
  mediaUrl?: string | null;
};
