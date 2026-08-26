export const CONTRACT_CONFIG_SPLIT_KEYS = [
  'treasuryBps',
  'seasonPoolBps',
  'targetBps',
  'burnBps',
] as const;

export type ContractConfigSplitKey =
  (typeof CONTRACT_CONFIG_SPLIT_KEYS)[number];

export type ContractConfigSplitPercents = Record<
  ContractConfigSplitKey,
  number
>;

export function normalizeContractConfigPercentInput(raw: string): string {
  return raw.replace(/[^\d]/g, '').slice(0, 3);
}

export function parseContractConfigPercentInput(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;
  if (!/^\d+$/.test(value)) return null;
  const percent = Number(value);
  if (!Number.isSafeInteger(percent) || percent < 0 || percent > 100) {
    return null;
  }
  return percent;
}

export function contractConfigBpsToPercent(bps: number): number {
  return Math.round(bps / 100);
}

export function contractConfigPercentToBps(percent: number): number {
  return percent * 100;
}

export function contractConfigSplitPercentsFromBpsStrings(
  treasuryBps: string,
  seasonPoolBps: string,
  targetBps: string,
  burnBps: string
): ContractConfigSplitPercents {
  return {
    treasuryBps: contractConfigBpsToPercent(Number(treasuryBps.trim()) || 0),
    seasonPoolBps: contractConfigBpsToPercent(Number(seasonPoolBps.trim()) || 0),
    targetBps: contractConfigBpsToPercent(Number(targetBps.trim()) || 0),
    burnBps: contractConfigBpsToPercent(Number(burnBps.trim()) || 0),
  };
}

export function contractConfigSplitBpsStringsFromPercents(
  percents: ContractConfigSplitPercents
): Record<ContractConfigSplitKey, string> {
  return {
    treasuryBps: String(contractConfigPercentToBps(percents.treasuryBps)),
    seasonPoolBps: String(contractConfigPercentToBps(percents.seasonPoolBps)),
    targetBps: String(contractConfigPercentToBps(percents.targetBps)),
    burnBps: String(contractConfigPercentToBps(percents.burnBps)),
  };
}

/** Treasury / rally / burn edits balance against Target; Target edits balance against Treasury. */
export function contractConfigSplitCounterparty(
  editedKey: ContractConfigSplitKey
): ContractConfigSplitKey {
  return editedKey === 'targetBps' ? 'treasuryBps' : 'targetBps';
}

function donorOrderForKey(editedKey: ContractConfigSplitKey): ContractConfigSplitKey[] {
  const others = CONTRACT_CONFIG_SPLIT_KEYS.filter((key) => key !== editedKey);
  const primary = contractConfigSplitCounterparty(editedKey);
  if (others.includes(primary)) {
    return [primary, ...others.filter((key) => key !== primary)];
  }
  return [...others];
}

/** Integer percents across the four routing shares — always totals 100. */
export function setContractConfigSplitPercent(
  split: ContractConfigSplitPercents,
  key: ContractConfigSplitKey,
  percent: number
): ContractConfigSplitPercents {
  const next = { ...split };
  const target = Math.max(0, Math.min(100, Math.floor(percent)));
  const delta = target - next[key];
  if (delta === 0) return next;
  next[key] = target;

  let remaining = delta;
  for (const donorKey of donorOrderForKey(key)) {
    if (remaining === 0) break;
    if (remaining > 0) {
      const take = Math.min(remaining, next[donorKey]);
      if (take <= 0) continue;
      next[donorKey] -= take;
      remaining -= take;
    } else {
      const headroom = 100 - next[donorKey];
      const give = Math.min(-remaining, headroom);
      if (give <= 0) continue;
      next[donorKey] += give;
      remaining += give;
    }
  }

  if (remaining !== 0) {
    return equalizeContractConfigSplitPercents(next, key, target);
  }
  return next;
}

function equalizeContractConfigSplitPercents(
  split: ContractConfigSplitPercents,
  lockedKey: ContractConfigSplitKey,
  lockedPercent: number
): ContractConfigSplitPercents {
  const others = CONTRACT_CONFIG_SPLIT_KEYS.filter((key) => key !== lockedKey);
  const remainder = Math.max(0, 100 - lockedPercent);
  const base = others.length > 0 ? Math.floor(remainder / others.length) : 0;
  let rem = remainder - base * others.length;
  const next: ContractConfigSplitPercents = {
    ...split,
    [lockedKey]: lockedPercent,
  };
  for (const key of others) {
    const extra = rem > 0 ? 1 : 0;
    if (rem > 0) rem -= 1;
    next[key] = base + extra;
  }
  return next;
}
