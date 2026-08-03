import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';

export type AllowlistPasteEntry = {
  account_id: string;
  allocation: number;
};

export type AllowlistPasteParseResult = {
  /** Valid entries for the active network. */
  entries: AllowlistPasteEntry[];
  /** Blank / duplicate lines are skipped silently. */
  invalid: string[];
  /**
   * Plausible ids that look like the other NEAR network.
   * These are blocked — not included in `entries`.
   */
  wrongNetwork: string[];
};

const MAX_ALLOCATION = 10_000;

/** Root account TLD for the active app network. */
export function allowlistAccountTld(): 'near' | 'testnet' {
  return ACTIVE_NEAR_NETWORK === 'mainnet' ? 'near' : 'testnet';
}

export function allowlistPastePlaceholder(): string {
  return 'Paste accounts…';
}

/** Quiet format example under the field — network-aware. */
export function allowlistPasteHint(maxCap?: number | null): string {
  const tld = allowlistAccountTld();
  const cap =
    maxCap != null && maxCap > 0 ? Math.min(2, Math.floor(maxCap)) : 2;
  return `e.g. alice.${tld} bob.${tld} ${cap} · tap account to set cap`;
}

/** Upper bound for the allowlist mint-cap stepper. */
export function allowlistCapStepperMax(maxPerWallet?: number | null): number {
  if (maxPerWallet != null && maxPerWallet > 0) {
    return Math.min(MAX_ALLOCATION, Math.floor(maxPerWallet));
  }
  return 10;
}

/** NEAR account id shape (implicit hex or named). */
export function isPlausibleNearAccountId(id: string): boolean {
  if (id.length < 2 || id.length > 64) return false;
  return /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(id);
}

/** 64-char hex implicit account — may not show on RPC until used. */
export function isImplicitNearAccountId(id: string): boolean {
  return /^[0-9a-f]{64}$/.test(id);
}

/** Soft network mismatch — e.g. `.near` while the app is on testnet. */
export function looksWrongNetworkAccount(id: string): boolean {
  if (ACTIVE_NEAR_NETWORK === 'testnet') {
    return id.endsWith('.near') && !id.endsWith('.testnet');
  }
  return id.endsWith('.testnet');
}

export function clampAllowlistAllocation(
  value: number,
  maxCap?: number | null
): number {
  if (!Number.isFinite(value)) return 1;
  const hardMax =
    maxCap != null && maxCap > 0
      ? Math.min(MAX_ALLOCATION, Math.floor(maxCap))
      : MAX_ALLOCATION;
  return Math.max(0, Math.min(hardMax, Math.floor(value)));
}

function isAllocationToken(token: string): boolean {
  return /^\d+$/.test(token);
}

/**
 * Parse pasted accounts into contract allowlist entries.
 * Accepts newlines, commas, or spaces between accounts.
 * A number after an account is its mint cap (`0` removes).
 * Wrong-network ids are blocked.
 * When `maxCap` is set (drop max per wallet), allocations are clamped to it.
 */
export function parseAllowlistPaste(
  text: string,
  maxCap?: number | null
): AllowlistPasteParseResult {
  const seen = new Set<string>();
  const entries: AllowlistPasteEntry[] = [];
  const invalid: string[] = [];
  const wrongNetwork: string[] = [];

  const tokens = text
    .split(/[\s,]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  let current: AllowlistPasteEntry | null = null;

  for (const token of tokens) {
    if (isAllocationToken(token)) {
      if (!current) {
        invalid.push(token);
        continue;
      }
      current.allocation = clampAllowlistAllocation(
        Number.parseInt(token, 10),
        maxCap
      );
      current = null;
      continue;
    }

    if (!isPlausibleNearAccountId(token)) {
      invalid.push(token);
      current = null;
      continue;
    }

    if (looksWrongNetworkAccount(token)) {
      wrongNetwork.push(token);
      current = null;
      continue;
    }

    if (seen.has(token)) {
      current = null;
      continue;
    }

    seen.add(token);
    current = { account_id: token, allocation: 1 };
    entries.push(current);
  }

  return { entries, invalid, wrongNetwork };
}
