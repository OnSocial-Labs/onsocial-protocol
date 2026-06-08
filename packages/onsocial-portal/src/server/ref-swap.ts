import 'server-only';

import type {
  EstimateSwapView,
  Pool,
  StablePool,
  TokenMetadata,
  Transaction,
} from '@ref-finance/ref-sdk';
import {
  calculateExchangeRate,
  calculateFeeCharge,
  calculateFeePercent,
  estimateSwap,
  fetchAllPools,
  ftGetBalance,
  ftGetStorageBalance,
  ftGetTokenMetadata,
  getAvgFee,
  getExpectedOutputFromSwapTodos,
  getMinStorageBalance,
  getPoolByIds,
  getPriceImpact,
  getStablePools,
  init_env,
  instantSwap,
  nearDepositTransaction,
  percentLess,
  toNonDivisibleNumber,
  WRAP_NEAR_CONTRACT_ID,
} from '@ref-finance/ref-sdk';
import type { PortalSwapQuoteDetails } from '@/lib/portal-swap-quote';
import { getSpendableNearBalance, viewAccount } from '@/lib/near-rpc';
import { resolveConfiguredNearRpcUrl } from '@onsocial/rpc';

import {
  PORTAL_SWAP_DIRECT_POOL_IDS,
  PORTAL_SWAP_SLIPPAGE_PERCENT,
  PORTAL_SWAP_SOCIAL_TOKEN_ID,
  portalSwapDirectPoolId,
  USDC_MAINNET_TOKEN_ID,
  type PortalSwapInputKind,
} from '@/lib/portal-swap-config';

interface PortalSwapPools {
  simplePools: Pool[];
  /** ratedPools + unRatedPools (ref-sdk stable pool list). */
  stablePools: Pool[];
  /** On-chain stable pool state from getStablePools(). */
  stablePoolsDetail: StablePool[];
}

function hasSimplePoolLiquidity(pool: Pool): boolean {
  return Number(pool.shareSupply ?? 0) > 0;
}

function hasStablePoolLiquidity(pool: StablePool): boolean {
  return Number(pool.shares_total_supply ?? 0) > 0;
}

const portalSwapDirectPoolIds = new Set<number>(PORTAL_SWAP_DIRECT_POOL_IDS);

function isDirectTokenPairPool(
  pool: Pool,
  tokenInId: string,
  tokenOutId: string
): boolean {
  return (
    pool.tokenIds.includes(tokenInId) && pool.tokenIds.includes(tokenOutId)
  );
}

/**
 * Use SOCIAL–USDC (6771) and SOCIAL–wNEAR (6783) directly when available.
 * Smart routing can pick multi-hop paths (e.g. USDC→wNEAR→SOCIAL) that fail
 * on-chain with E68 slippage while a direct pool would succeed.
 */
function selectPortalSwapRoute(
  tokenIn: TokenMetadata,
  tokenOut: TokenMetadata,
  pools: PortalSwapPools
): {
  simplePools: Pool[];
  enableSmartRouting: boolean;
  stablePools: Pool[];
  stablePoolsDetail: StablePool[];
} {
  const directPools = pools.simplePools.filter((pool) =>
    isDirectTokenPairPool(pool, tokenIn.id, tokenOut.id)
  );
  const preferredPools = directPools.filter((pool) =>
    portalSwapDirectPoolIds.has(pool.id)
  );
  const routePools = preferredPools.length > 0 ? preferredPools : directPools;

  if (routePools.length > 0) {
    return {
      simplePools: routePools,
      enableSmartRouting: false,
      stablePools: [],
      stablePoolsDetail: [],
    };
  }

  return {
    simplePools: pools.simplePools,
    enableSmartRouting: true,
    stablePools: pools.stablePools,
    stablePoolsDetail: pools.stablePoolsDetail,
  };
}

let poolsCache: PortalSwapPools | null = null;
let poolsLoadPromise: Promise<PortalSwapPools> | null = null;
let serverFetchPatched = false;

const NEAR_YOCTO = 10n ** 24n;

/**
 * ref-sdk uses bare GET fetch (e.g. fetchAllPools) without cache hints.
 * Next.js 16 patched fetch dedupes those and clones via body.tee(), which
 * can throw in Node. Force no-store for server-side ref-sdk HTTP calls.
 */
function ensureServerFetchNoStore(): void {
  if (serverFetchPatched || typeof window !== 'undefined') return;
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    const nextInit: RequestInit = { ...(init ?? {}) };
    if (nextInit.cache == null) {
      nextInit.cache = 'no-store';
    }
    return originalFetch(input, nextInit);
  };
  serverFetchPatched = true;
}

function parseNearAmountHuman(amount: string): bigint {
  const trimmed = amount.trim();
  if (!trimmed || trimmed === '0') return 0n;
  const [whole = '0', frac = ''] = trimmed.split('.');
  const padded = frac.padEnd(24, '0').slice(0, 24);
  return BigInt(whole) * NEAR_YOCTO + BigInt(padded || '0');
}

function formatNearAmountYocto(yocto: bigint): string {
  const whole = yocto / NEAR_YOCTO;
  const frac = (yocto % NEAR_YOCTO)
    .toString()
    .padStart(24, '0')
    .replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

function mainnetSwapRpcUrl(): string {
  return resolveConfiguredNearRpcUrl('mainnet', { publicOnly: false });
}

function ensureRefEnv(): void {
  ensureServerFetchNoStore();
  init_env('mainnet', undefined, mainnetSwapRpcUrl());
}

async function fetchPortalSwapPools(): Promise<PortalSwapPools> {
  ensureRefEnv();
  const allPools = (await fetchAllPools()) as {
    simplePools?: Pool[];
    ratedPools?: Pool[];
    unRatedPools?: Pool[];
  };
  const simplePools = (allPools.simplePools ?? []).filter(
    hasSimplePoolLiquidity
  );
  const stablePools = (allPools.ratedPools ?? [])
    .concat(allPools.unRatedPools ?? [])
    .filter(hasSimplePoolLiquidity);
  const stablePoolsDetail = (await getStablePools(stablePools)).filter(
    hasStablePoolLiquidity
  );
  return {
    simplePools,
    stablePools,
    stablePoolsDetail,
  };
}

function mergeFreshSimplePool(
  pools: PortalSwapPools,
  freshPool: Pool
): PortalSwapPools {
  const hasPool = pools.simplePools.some((pool) => pool.id === freshPool.id);
  const simplePools = hasPool
    ? pools.simplePools.map((pool) =>
        pool.id === freshPool.id ? freshPool : pool
      )
    : [...pools.simplePools, freshPool];

  return { ...pools, simplePools };
}

async function loadPools(): Promise<PortalSwapPools> {
  if (poolsCache) return poolsCache;
  if (poolsLoadPromise) return poolsLoadPromise;

  poolsLoadPromise = (async () => {
    const pools = await fetchPortalSwapPools();
    poolsCache = pools;
    return pools;
  })();

  try {
    return await poolsLoadPromise;
  } finally {
    poolsLoadPromise = null;
  }
}

/** On-chain pool reserves for SOCIAL direct pool — used at prepare/sign time. */
async function loadPoolsForPrepare(
  kind: PortalSwapInputKind
): Promise<PortalSwapPools> {
  const cached = await loadPools();
  const directPoolId = portalSwapDirectPoolId(kind);

  try {
    ensureRefEnv();
    const freshPools = (await getPoolByIds([directPoolId])).filter(
      hasSimplePoolLiquidity
    );
    const freshPool = freshPools.find((pool) => pool.id === directPoolId);
    if (!freshPool) {
      return cached;
    }

    const pools = mergeFreshSimplePool(cached, freshPool);
    poolsCache = pools;
    return pools;
  } catch {
    return cached;
  }
}

async function resolveInputToken(
  kind: PortalSwapInputKind
): Promise<TokenMetadata> {
  ensureRefEnv();
  if (kind === 'near') {
    return init_env('mainnet', undefined, mainnetSwapRpcUrl()).WNEAR_META_DATA;
  }
  return ftGetTokenMetadata(USDC_MAINNET_TOKEN_ID);
}

async function resolveSocialToken(): Promise<TokenMetadata> {
  ensureRefEnv();
  return ftGetTokenMetadata(PORTAL_SWAP_SOCIAL_TOKEN_ID);
}

export async function getPortalSwapTokens(): Promise<{
  tokenIn: TokenMetadata;
  tokenOut: TokenMetadata;
}> {
  const [near, social] = await Promise.all([
    resolveInputToken('near'),
    resolveSocialToken(),
  ]);
  return { tokenIn: near, tokenOut: social };
}

export async function getPortalSwapInputBalance(
  accountId: string,
  kind: PortalSwapInputKind
): Promise<string> {
  const balances = await getPortalSwapAccountBalances(accountId, kind);
  return balances.inputBalanceYocto;
}

export async function getPortalSwapAccountBalances(
  accountId: string,
  kind: PortalSwapInputKind
): Promise<{
  inputBalanceYocto: string;
  nearBalanceYocto: string;
  usdcBalanceYocto: string;
  totalNearBalanceYocto: string;
  socialBalanceYocto: string;
  needsWnearStorage: boolean;
}> {
  ensureRefEnv();
  const [nearAccount, socialBalanceYocto, usdcBalanceYocto] = await Promise.all(
    [
      viewAccount(accountId),
      ftGetBalance(PORTAL_SWAP_SOCIAL_TOKEN_ID, accountId).then((value) =>
        String(value ?? '0')
      ),
      ftGetBalance(USDC_MAINNET_TOKEN_ID, accountId).then((value) =>
        String(value ?? '0')
      ),
    ]
  );

  const totalNearBalanceYocto = nearAccount?.amount ?? '0';
  const nearBalanceYocto = getSpendableNearBalance(nearAccount);
  const inputBalanceYocto =
    kind === 'near' ? nearBalanceYocto : usdcBalanceYocto;

  const wnearRegistered = await ftGetStorageBalance(
    WRAP_NEAR_CONTRACT_ID,
    accountId
  ).catch(() => null);

  return {
    inputBalanceYocto,
    nearBalanceYocto,
    usdcBalanceYocto,
    totalNearBalanceYocto,
    socialBalanceYocto,
    needsWnearStorage: wnearRegistered === null,
  };
}

function buildPortalSwapQuote(input: {
  trimmed: string;
  tokenIn: TokenMetadata;
  tokenOut: TokenMetadata;
  amountInYocto: string;
  amountOut: string;
  estimates: EstimateSwapView[];
  stablePoolsDetail: StablePool[];
}): PortalSwapQuoteDetails {
  const {
    trimmed,
    tokenIn,
    tokenOut,
    amountInYocto,
    amountOut,
    estimates,
    stablePoolsDetail,
  } = input;

  const avgFee = getAvgFee(estimates, tokenOut.id, amountInYocto);
  const priceImpactPercent = getPriceImpact({
    estimates,
    tokenIn,
    tokenOut,
    amountIn: trimmed,
    amountOut,
    stablePools: stablePoolsDetail,
  });
  const priceImpactValue = Math.abs(Number(priceImpactPercent));
  const priceImpactInputAmount =
    Number.isFinite(priceImpactValue) &&
    priceImpactValue > 0 &&
    Number(trimmed) > 0
      ? String((Number(trimmed) * priceImpactValue) / 100)
      : '0';

  return {
    amountOut,
    minReceived: amountOut
      ? percentLess(PORTAL_SWAP_SLIPPAGE_PERCENT, amountOut)
      : '0',
    priceImpactPercent,
    priceImpactInputAmount,
    poolFeePercent: String(calculateFeePercent(avgFee)),
    poolFeeAmount: String(calculateFeeCharge(avgFee, trimmed)),
    exchangeRate: calculateExchangeRate(trimmed, amountOut || '1'),
    slippagePercent: PORTAL_SWAP_SLIPPAGE_PERCENT,
    tokenInSymbol: tokenIn.symbol,
    tokenOutSymbol: tokenOut.symbol,
  };
}

async function estimatePortalSwapWithPools(
  input: {
    kind: PortalSwapInputKind;
    amountIn: string;
  },
  pools: PortalSwapPools
): Promise<{
  tokenIn: TokenMetadata;
  tokenOut: TokenMetadata;
  amountInYocto: string;
  amountOut: string;
  amountOutYocto: string;
  quote: PortalSwapQuoteDetails;
  estimates: EstimateSwapView[];
}> {
  const trimmed = input.amountIn.trim();
  if (!trimmed || Number(trimmed) <= 0) {
    throw new Error('Enter a valid amount.');
  }

  const [tokenIn, tokenOut] = await Promise.all([
    resolveInputToken(input.kind),
    resolveSocialToken(),
  ]);

  const amountInYocto = toNonDivisibleNumber(tokenIn.decimals, trimmed);
  const route = selectPortalSwapRoute(tokenIn, tokenOut, pools);
  const estimates = await estimateSwap({
    tokenIn,
    tokenOut,
    amountIn: trimmed,
    simplePools: route.simplePools,
    options: {
      enableSmartRouting: route.enableSmartRouting,
      stablePools: route.stablePools,
      stablePoolsDetail: route.stablePoolsDetail,
    },
  });

  const amountOut = getExpectedOutputFromSwapTodos(
    estimates,
    tokenOut.id
  ).toString();
  const amountOutYocto = amountOut
    ? toNonDivisibleNumber(tokenOut.decimals, amountOut)
    : '0';

  return {
    tokenIn,
    tokenOut,
    amountInYocto,
    amountOut,
    amountOutYocto,
    quote: buildPortalSwapQuote({
      trimmed,
      tokenIn,
      tokenOut,
      amountInYocto,
      amountOut,
      estimates,
      stablePoolsDetail: pools.stablePoolsDetail,
    }),
    estimates,
  };
}

export async function estimatePortalSwap(input: {
  kind: PortalSwapInputKind;
  amountIn: string;
}): Promise<{
  tokenIn: TokenMetadata;
  tokenOut: TokenMetadata;
  amountInYocto: string;
  amountOut: string;
  amountOutYocto: string;
  quote: PortalSwapQuoteDetails;
  estimates: EstimateSwapView[];
}> {
  const pools = await loadPoolsForPrepare(input.kind);
  return estimatePortalSwapWithPools(input, pools);
}

export async function preparePortalSwapTransactions(input: {
  kind: PortalSwapInputKind;
  amountIn: string;
  accountId: string;
}): Promise<Transaction[]> {
  const trimmed = input.amountIn.trim();
  const pools = await loadPoolsForPrepare(input.kind);
  const { tokenIn, tokenOut, amountInYocto, estimates } =
    await estimatePortalSwapWithPools(
      {
        kind: input.kind,
        amountIn: trimmed,
      },
      pools
    );

  if (!estimates.length || amountInYocto === '0') {
    throw new Error('No swap route available for this amount.');
  }

  const transactions = await instantSwap({
    tokenIn,
    tokenOut,
    amountIn: trimmed,
    slippageTolerance: PORTAL_SWAP_SLIPPAGE_PERCENT,
    swapTodos: estimates,
    AccountId: input.accountId,
  });

  if (input.kind === 'near' && tokenIn.id === WRAP_NEAR_CONTRACT_ID) {
    let nearDepositAmount = trimmed;
    const tokenRegistered = await ftGetStorageBalance(
      tokenIn.id,
      input.accountId
    ).catch(() => null);

    if (tokenRegistered === null) {
      const minStorageBalance = await getMinStorageBalance(tokenIn.id);
      nearDepositAmount = formatNearAmountYocto(
        parseNearAmountHuman(nearDepositAmount) + BigInt(minStorageBalance)
      );
    }

    transactions.splice(-1, 0, nearDepositTransaction(nearDepositAmount));
  }

  return transactions;
}
