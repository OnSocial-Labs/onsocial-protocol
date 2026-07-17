import type { SupportPotAction, SupportReceivedRow } from '@onsocial/sdk';

export const SUPPORT_POT_LEGEND: ReadonlyArray<{
  action: SupportPotAction;
  label: string;
  detail: string;
}> = [
  {
    action: 'support_profile',
    label: 'Profile support',
    detail: 'SOCIAL sent to you with Support.',
  },
  {
    action: 'support_endorsement',
    label: 'Endorsement support',
    detail: 'SOCIAL backing an endorsement of you.',
  },
  {
    action: 'boost_post',
    label: 'Boost share',
    detail: 'Your author share when someone boosts your post.',
  },
] as const;

export function supportPotActionLabel(action: SupportPotAction): string {
  return (
    SUPPORT_POT_LEGEND.find((row) => row.action === action)?.label ?? action
  );
}

/** Initial sheet payload — current pot + first page of earlier credits. */
export type ProfileSupportReceivedSummary = {
  accountId: string;
  lastCollectBlockHeight: number | null;
  current: SupportReceivedRow[];
  history: SupportReceivedRow[];
  historyHasMore: boolean;
};

/** Paginated earlier credits (before last collect). */
export type ProfileSupportReceivedHistoryPage = {
  accountId: string;
  items: SupportReceivedRow[];
  hasMore: boolean;
};
