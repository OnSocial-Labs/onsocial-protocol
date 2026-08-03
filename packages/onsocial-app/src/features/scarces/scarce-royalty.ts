/** Resale royalty presets in basis points (1000 = 10%). */
export const ROYALTY_PRESETS = [
  { percent: 0, bps: 0 },
  { percent: 5, bps: 500 },
  { percent: 10, bps: 1000 },
  { percent: 15, bps: 1500 },
] as const;

export const DEFAULT_ROYALTY_BPS = 1000;
export const MAX_ROYALTY_BPS = 5_000;
/** Matches gateway / contract `MAX_ROYALTY_RECIPIENTS`. */
export const MAX_ROYALTY_RECIPIENTS = 10;
/** Protocol marketplace fee on primary + secondary sales (matches contract default). */
export const MARKETPLACE_FEE_BPS = 200;

/** One recipient’s share of the total resale cut (percents must sum to 100). */
export interface RoyaltySplitShare {
  accountId: string;
  /** Integer percent of the royalty cut (1–100). */
  percent: number;
}

export function parseCustomRoyaltyBps(raw: string): number | null {
  const value = raw.trim();
  if (!/^\d+(?:\.(?:0|5))?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const bps = Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
  return Number.isSafeInteger(bps) && bps <= MAX_ROYALTY_BPS ? bps : null;
}

export function normalizeCustomRoyaltyInput(raw: string): string {
  const sanitized = raw.replace(/[^\d.]/g, '');
  if (!sanitized) return '';
  const [whole, ...fractions] = sanitized.split('.');
  if (fractions.length === 0) return whole;
  return `${whole || '0'}.${fractions.join('').slice(0, 1)}`;
}

export function formatRoyaltyPercent(bps: number): string {
  const whole = Math.floor(bps / 100);
  const fraction = bps % 100;
  if (fraction === 0) return String(whole);
  return `${whole}.${String(fraction).padStart(2, '0').replace(/0$/, '')}`;
}

/** Sum of royalty map values in bps (creator share when one recipient). */
export function totalRoyaltyBps(
  royalty: Record<string, number> | null | undefined
): number {
  if (!royalty) return 0;
  let total = 0;
  for (const value of Object.values(royalty)) {
    const n = Math.floor(Number(value));
    if (Number.isSafeInteger(n) && n > 0) total += n;
  }
  return total;
}

export function defaultRoyaltyShares(
  primaryAccountId: string
): RoyaltySplitShare[] {
  const id = primaryAccountId.trim();
  if (!id) return [];
  return [{ accountId: id, percent: 100 }];
}

/** Spread `totalPercent` across accounts (largest remainders first). */
export function equalizeSharesToTotal(
  accountIds: string[],
  totalPercent = 100
): RoyaltySplitShare[] {
  const ids = [...new Set(accountIds.map((id) => id.trim()).filter(Boolean))];
  const n = ids.length;
  if (n === 0 || totalPercent <= 0) return [];
  const base = Math.floor(totalPercent / n);
  let rem = totalPercent - base * n;
  return ids.map((accountId) => {
    const extra = rem > 0 ? 1 : 0;
    if (rem > 0) rem -= 1;
    return { accountId, percent: base + extra };
  });
}

export function equalizeRoyaltyShares(
  accountIds: string[]
): RoyaltySplitShare[] {
  return equalizeSharesToTotal(accountIds, 100);
}

export function validateRoyaltyShares(
  shares: RoyaltySplitShare[]
): string | null {
  if (shares.length === 0) return 'Add at least one recipient.';
  if (shares.length > MAX_ROYALTY_RECIPIENTS) {
    return `Maximum ${MAX_ROYALTY_RECIPIENTS} recipients.`;
  }
  const seen = new Set<string>();
  let total = 0;
  for (const share of shares) {
    const id = share.accountId.trim();
    if (!id) return 'Each recipient needs an account.';
    const key = id.toLowerCase();
    if (seen.has(key)) return 'Duplicate recipient.';
    seen.add(key);
    if (!Number.isSafeInteger(share.percent) || share.percent <= 0) {
      return 'Each share must be greater than 0%.';
    }
    total += share.percent;
  }
  if (total !== 100) return `Shares must add up to 100% (now ${total}%).`;
  return null;
}

/**
 * Set one recipient’s percent and take/give the delta from another so the
 * total stays 100. Prefer adjusting the last other recipient.
 */
export function setRoyaltySharePercent(
  shares: RoyaltySplitShare[],
  accountId: string,
  percent: number
): RoyaltySplitShare[] {
  if (shares.length === 0) return shares;
  if (shares.length === 1) {
    return [{ accountId: shares[0].accountId, percent: 100 }];
  }

  const key = accountId.trim().toLowerCase();
  const idx = shares.findIndex(
    (share) => share.accountId.trim().toLowerCase() === key
  );
  if (idx < 0) return shares;

  const minOthers = shares.length - 1;
  const target = Math.max(1, Math.min(100 - minOthers, Math.floor(percent)));
  const next = shares.map((share) => ({ ...share }));
  const delta = target - next[idx].percent;
  if (delta === 0) return next;
  next[idx].percent = target;

  let remaining = delta;
  // Prefer the last other row, then walk backward for capacity.
  for (let step = 0; step < next.length && remaining !== 0; step += 1) {
    const donorIdx = (idx - 1 - step + next.length) % next.length;
    if (donorIdx === idx) continue;
    if (remaining > 0) {
      const take = Math.min(remaining, next[donorIdx].percent - 1);
      if (take <= 0) continue;
      next[donorIdx].percent -= take;
      remaining -= take;
    } else {
      next[donorIdx].percent += -remaining;
      remaining = 0;
    }
  }

  if (remaining !== 0) {
    // Fallback: equalize if donors could not absorb (should be rare).
    return equalizeRoyaltyShares(next.map((share) => share.accountId));
  }
  return next;
}

/**
 * Build the on-chain royalty map from a total cut + share percents.
 * Rounding leftovers go to the first recipient so the sum equals `totalBps`.
 */
export function buildRoyaltyMap(
  totalBps: number,
  shares: RoyaltySplitShare[]
): Record<string, number> | undefined {
  if (!Number.isSafeInteger(totalBps) || totalBps <= 0) return undefined;
  if (validateRoyaltyShares(shares) != null) return undefined;

  const rows = shares.map((share) => ({
    accountId: share.accountId.trim(),
    bps: Math.floor((totalBps * share.percent) / 100),
  }));
  let sum = rows.reduce((acc, row) => acc + row.bps, 0);
  let cursor = 0;
  while (sum < totalBps && rows.length > 0) {
    rows[cursor % rows.length].bps += 1;
    sum += 1;
    cursor += 1;
  }

  const map: Record<string, number> = {};
  for (const row of rows) {
    if (row.bps <= 0) continue;
    map[row.accountId] = (map[row.accountId] ?? 0) + row.bps;
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

/** Chip / hint summary — “You”, “@alice”, or “2 accounts”. */
export function formatRoyaltySplitChipValue(
  shares: RoyaltySplitShare[],
  primaryAccountId: string,
  formatHandle: (accountId: string) => string
): string {
  if (shares.length === 0) return 'You';
  if (shares.length === 1) {
    const only = shares[0].accountId.trim();
    if (
      primaryAccountId.trim() &&
      only.toLowerCase() === primaryAccountId.trim().toLowerCase()
    ) {
      return 'You';
    }
    return `@${formatHandle(only)}`;
  }
  return `${shares.length} accounts`;
}

export function royaltySplitIsDefault(
  shares: RoyaltySplitShare[],
  primaryAccountId: string
): boolean {
  if (shares.length !== 1) return false;
  const primary = primaryAccountId.trim().toLowerCase();
  if (!primary) return false;
  return (
    shares[0].accountId.trim().toLowerCase() === primary &&
    shares[0].percent === 100
  );
}
