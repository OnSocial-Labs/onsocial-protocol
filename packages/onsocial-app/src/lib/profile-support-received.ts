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

export function sumSupportReceivedYocto(
  rows: ReadonlyArray<{ amountYocto: string }>
): bigint {
  let total = 0n;
  for (const row of rows) {
    try {
      total += BigInt(row.amountYocto || '0');
    } catch {
      // skip malformed
    }
  }
  return total;
}

/** Compact kind totals for the current pot — e.g. "Boost share 30.60 · Profile support 9.90". */
export type SupportReceivedKindTotal = {
  action: SupportPotAction;
  label: string;
  amountLabel: string;
};

export function supportReceivedKindTotals(
  rows: ReadonlyArray<{ action: SupportPotAction; amountYocto: string }>,
  formatAmount: (yocto: string) => string
): SupportReceivedKindTotal[] {
  const totals = new Map<SupportPotAction, bigint>();
  for (const row of rows) {
    let amount = 0n;
    try {
      amount = BigInt(row.amountYocto || '0');
    } catch {
      continue;
    }
    if (amount <= 0n) continue;
    totals.set(row.action, (totals.get(row.action) ?? 0n) + amount);
  }

  return SUPPORT_POT_LEGEND.filter((entry) => totals.has(entry.action)).map(
    (entry) => {
      const yocto = (totals.get(entry.action) ?? 0n).toString();
      return {
        action: entry.action,
        label: entry.label,
        amountLabel: formatAmount(yocto),
      };
    }
  );
}

export function supportReceivedKindSubtotals(
  rows: ReadonlyArray<{ action: SupportPotAction; amountYocto: string }>,
  formatAmount: (yocto: string) => string
): string {
  return supportReceivedKindTotals(rows, formatAmount)
    .map((entry) => `${entry.label} ${entry.amountLabel}`)
    .join(' · ');
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
