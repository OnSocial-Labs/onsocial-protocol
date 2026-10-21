import { pollIndexConfirm } from '@/lib/index-confirm-poll';

type PollOpts = {
  timeoutMs?: number;
  intervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

/** Local remaining after this mint. Null when the screen had no count to bump. */
export function expectedRemainingAfterMint(
  before: number | null | undefined,
  quantity: number
): number | null {
  if (typeof before !== 'number' || !Number.isFinite(before)) return null;
  const taken = Number.isFinite(quantity)
    ? Math.max(0, Math.floor(quantity))
    : 0;
  return Math.max(0, Math.floor(before) - taken);
}

export type IndexedDropShell = {
  remaining: number | null;
  totalSupply?: number | null;
  paused?: boolean;
  cancelled?: boolean;
  banned?: boolean;
};

export type DropSupplyConfirm = {
  remaining: number | null;
  shell: IndexedDropShell | null;
  fromIndex: boolean;
};

/**
 * After a drop mint is final, wait for `scarces_collections_current.remaining`
 * to equal the local take. A miss keeps that local remaining.
 */
export async function pollDropRemaining(
  args: {
    beforeRemaining: number | null | undefined;
    quantity: number;
    readShell: () => Promise<IndexedDropShell | null>;
  } & PollOpts
): Promise<DropSupplyConfirm> {
  const expected = expectedRemainingAfterMint(
    args.beforeRemaining,
    args.quantity
  );
  const opts = pollOpts(args);
  if (expected == null) {
    const shell = await readOnce(args.readShell);
    return {
      remaining: shell?.remaining ?? null,
      shell,
      fromIndex: false,
    };
  }

  const shell = await pollIndexConfirm(
    () => readOnce(args.readShell),
    (row) => row != null && row.remaining === expected,
    opts
  );
  if (shell) {
    return { remaining: shell.remaining, shell, fromIndex: true };
  }
  return { remaining: expected, shell: null, fromIndex: false };
}

export function mintSupplyClosed(confirm: DropSupplyConfirm): boolean {
  const shell = confirm.fromIndex ? confirm.shell : null;
  if (shell?.paused || shell?.cancelled || shell?.banned) return true;
  return confirm.remaining == null || confirm.remaining <= 0;
}

export type IndexedLazyListing = {
  listingId?: string | null;
  remaining?: number | null;
  copies?: number | null;
  priceNear?: string | null;
};

export type LazyListingConfirm = {
  remaining: number | null;
  listingId: string | null;
  copies: number | null;
  priceNear: string | null;
  fromIndex: boolean;
};

type LazyRead = { found: false } | ({ found: true } & IndexedLazyListing);

/**
 * After a lazy mint is final, wait until the live listing shows the local
 * remaining, or is gone when that remaining is zero.
 */
export async function pollLazyListing(
  args: {
    beforeRemaining: number | null | undefined;
    quantity: number;
    readListing: () => Promise<IndexedLazyListing | null>;
  } & PollOpts
): Promise<LazyListingConfirm> {
  const expected = expectedRemainingAfterMint(
    args.beforeRemaining,
    args.quantity
  );
  const opts = pollOpts(args);
  if (expected == null) {
    return lazyFace(await readLazy(args.readListing), false, null);
  }

  const matched = await pollIndexConfirm(
    () => readLazy(args.readListing),
    (row) =>
      expected === 0
        ? !row.found || row.remaining === 0
        : row.found && row.remaining === expected,
    opts
  );
  if (matched) return lazyFace(matched, true, expected);
  return {
    remaining: expected,
    listingId: null,
    copies: null,
    priceNear: null,
    fromIndex: false,
  };
}

function pollOpts(args: PollOpts): PollOpts {
  return {
    ...(args.timeoutMs != null ? { timeoutMs: args.timeoutMs } : {}),
    ...(args.intervalMs != null ? { intervalMs: args.intervalMs } : {}),
    ...(args.now ? { now: args.now } : {}),
    ...(args.sleep ? { sleep: args.sleep } : {}),
  };
}

async function readOnce<T>(read: () => Promise<T | null>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

async function readLazy(
  read: () => Promise<IndexedLazyListing | null>
): Promise<LazyRead> {
  const listing = await readOnce(read);
  if (!listing) return { found: false };
  return { found: true, ...listing };
}

function lazyFace(
  row: LazyRead | null,
  fromIndex: boolean,
  expected: number | null
): LazyListingConfirm {
  if (!row || !row.found || row.remaining === 0) {
    return {
      remaining: fromIndex || expected === 0 ? 0 : null,
      listingId: null,
      copies: null,
      priceNear: null,
      fromIndex,
    };
  }
  return {
    remaining: row.remaining ?? expected,
    listingId: row.listingId ?? null,
    copies: row.copies ?? null,
    priceNear: row.priceNear ?? null,
    fromIndex,
  };
}
