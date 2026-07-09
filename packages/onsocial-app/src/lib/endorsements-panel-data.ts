import type { EndorsementListItem } from '@onsocial/sdk';

export type EndorsementPanelItem = EndorsementListItem & {
  issuerName: string | null;
  issuerAvatarUrl: string | null;
  targetName: string | null;
  targetAvatarUrl: string | null;
};

export interface EndorsementsPanelResponse {
  accountId: string;
  counts: { received: number; given: number };
  received: EndorsementPanelItem[];
  given: EndorsementPanelItem[];
}
