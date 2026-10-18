import { nearToYocto, yoctoToNear } from '@/lib/app-near-rpc';

export type NearAskVerdict =
  | { verdict: 'open'; yocto: string }
  | { verdict: 'gone' }
  | { verdict: 'price'; yocto: string; priceNear: string };

function yoctoDigits(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? '';
  if (!/^\d+$/.test(value)) return null;
  return value;
}

function yoctoFromConditions(raw: unknown): string | null {
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return raw;
  if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0) {
    return String(raw);
  }
  if (raw && typeof raw === 'object' && '0' in raw) {
    return yoctoFromConditions((raw as { 0?: unknown })['0']);
  }
  return null;
}

function isNativeFixedSale(sale: Record<string, unknown>): boolean {
  if (sale.auction != null) return false;
  const saleType = sale.sale_type ?? sale.saleType;
  if (!saleType || typeof saleType !== 'object') return false;
  const record = saleType as Record<string, unknown>;
  const native =
    record.NativeScarce ?? record.native_scarce ?? record.nativeScarce;
  if (!native || typeof native !== 'object') return false;
  const token = native as { token_id?: unknown; tokenId?: unknown };
  const tokenId = token.token_id ?? token.tokenId;
  return typeof tokenId === 'string' && tokenId.trim().length > 0;
}

/**
 * Yocto ask from a `get_sale` record. Null means there is no fixed-price sale
 * (missing, auction, or not a native listing).
 */
export function fixedSaleAskYocto(sale: unknown): string | null {
  if (!sale || typeof sale !== 'object') return null;
  const row = sale as Record<string, unknown>;
  if (!isNativeFixedSale(row)) return null;
  return yoctoFromConditions(row.sale_conditions ?? row.saleConditions);
}

/** Shown NEAR ask against one live yocto quote. Null quote means the listing is gone. */
export function judgeNearAsk(opts: {
  shownPriceNear: string | null | undefined;
  quotedYocto: string | null | undefined;
}): NearAskVerdict {
  const quoted = yoctoDigits(opts.quotedYocto);
  if (quoted == null) return { verdict: 'gone' };
  let shown = '0';
  const raw = opts.shownPriceNear?.trim() ?? '';
  if (raw) {
    try {
      shown = nearToYocto(raw);
    } catch {
      shown = '0';
    }
    if (!/^\d+$/.test(shown)) shown = '0';
  }
  if (shown === quoted) return { verdict: 'open', yocto: quoted };
  return { verdict: 'price', yocto: quoted, priceNear: yoctoToNear(quoted) };
}

export type DropAskRow = {
  price: string | null;
  remaining: number;
  paused: boolean;
  cancelled: boolean;
  banned: boolean;
};

export type DropAskVerdict =
  | { verdict: 'open'; yocto: string; remaining: number }
  | { verdict: 'gone' }
  | {
      verdict: 'price';
      yocto: string;
      priceNear: string;
      remaining: number;
    };

export type SettledBuyAsk =
  | { status: 'failed' }
  | { status: 'skip' }
  | { status: 'gone' }
  | {
      status: 'price';
      priceNear: string;
      yocto: string;
      remaining?: number;
    }
  | { status: 'open'; yocto: string; remaining?: number };

/** One shape for the buy form after a drop or listing read. */
export function settleBuyAsk(
  read:
    | { kind: 'drop'; verdict: DropAskVerdict }
    | { kind: 'near'; verdict: NearAskVerdict }
    | { kind: 'skip' }
    | { kind: 'failed' }
): SettledBuyAsk {
  if (read.kind === 'failed') return { status: 'failed' };
  if (read.kind === 'skip') return { status: 'skip' };
  if (read.verdict.verdict === 'gone') return { status: 'gone' };
  if (read.verdict.verdict === 'price') {
    return {
      status: 'price',
      priceNear: read.verdict.priceNear,
      yocto: read.verdict.yocto,
      ...(read.kind === 'drop' ? { remaining: read.verdict.remaining } : {}),
    };
  }
  return {
    status: 'open',
    yocto: read.verdict.yocto,
    ...(read.kind === 'drop' ? { remaining: read.verdict.remaining } : {}),
  };
}

/** Live drop shell. A missing, empty, paused, cancelled, or banned row is closed. */
export function judgeDropAsk(opts: {
  shownPriceNear: string | null | undefined;
  row: DropAskRow | null;
}): DropAskVerdict {
  const row = opts.row;
  if (!row || row.remaining <= 0 || row.paused || row.cancelled || row.banned) {
    return { verdict: 'gone' };
  }
  const ask = judgeNearAsk({
    shownPriceNear: opts.shownPriceNear,
    quotedYocto: row.price == null || row.price === '' ? '0' : row.price,
  });
  if (ask.verdict === 'gone') return { verdict: 'gone' };
  if (ask.verdict === 'price') return { ...ask, remaining: row.remaining };
  return { verdict: 'open', yocto: ask.yocto, remaining: row.remaining };
}
