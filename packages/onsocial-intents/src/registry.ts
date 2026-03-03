/**
 * Dynamic Token Registry
 *
 * Fetches tokens from the 1Click API (`GET /v0/tokens`) and caches them.
 * No hardcoded token list — whatever NEAR Intents supports is available.
 *
 * @module onsocial-intents/registry
 */

import type { Token, Blockchain, ClientConfig } from './types';

const DEFAULT_BASE_URL = 'https://1click.chaindefuser.com';
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * In-memory token registry backed by the 1Click token-discovery endpoint.
 *
 * @example
 * ```ts
 * const registry = new TokenRegistry();
 * const tokens = await registry.getTokens();
 * const usdc = await registry.findBySymbol('USDC', 'near');
 * ```
 */
export class TokenRegistry {
  private baseUrl: string;
  private cacheTtlMs: number;
  private cache: Token[] | null = null;
  private cacheTime = 0;
  private fetchPromise: Promise<Token[]> | null = null;

  constructor(opts?: { baseUrl?: string; cacheTtlMs?: number }) {
    this.baseUrl = opts?.baseUrl || DEFAULT_BASE_URL;
    this.cacheTtlMs = opts?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  // ── Core ────────────────────────────────────────────────────────────────

  /**
   * Fetch all tokens (cached).
   * First call hits the API; subsequent calls return from cache until TTL.
   */
  async getTokens(): Promise<Token[]> {
    if (this.cache && Date.now() - this.cacheTime < this.cacheTtlMs) {
      return this.cache;
    }

    // Deduplicate concurrent fetches
    if (!this.fetchPromise) {
      this.fetchPromise = this.fetchTokens();
    }
    const tokens = await this.fetchPromise;
    this.fetchPromise = null;
    return tokens;
  }

  /** Force-refresh the cache on the next call. */
  invalidate(): void {
    this.cache = null;
    this.cacheTime = 0;
  }

  // ── Lookup helpers ────────────────────────────────────────────────────────

  /**
   * Find tokens by symbol (e.g. `USDC`).
   * Many chains may carry the same symbol — optionally filter by chain.
   */
  async findBySymbol(symbol: string, chain?: Blockchain): Promise<Token[]> {
    const tokens = await this.getTokens();
    const upper = symbol.toUpperCase();
    return tokens.filter(
      (t) =>
        t.symbol.toUpperCase() === upper &&
        (chain === undefined || t.blockchain === chain),
    );
  }

  /** Find the exact token by its asset ID (unique). */
  async findByAssetId(assetId: string): Promise<Token | undefined> {
    const tokens = await this.getTokens();
    return tokens.find((t) => t.assetId === assetId);
  }

  /** Find all tokens on a specific chain. */
  async findByChain(chain: Blockchain): Promise<Token[]> {
    const tokens = await this.getTokens();
    return tokens.filter((t) => t.blockchain === chain);
  }

  /** Find all tokens whose contract address matches. */
  async findByContract(contractAddress: string): Promise<Token[]> {
    const tokens = await this.getTokens();
    return tokens.filter((t) => t.contractAddress === contractAddress);
  }

  /**
   * Convenience: find a single token by symbol + chain, or throw.
   *
   * If multiple tokens match, returns the first by assetId sort order
   * (deterministic).
   */
  async resolve(symbol: string, chain?: Blockchain): Promise<Token> {
    const matches = await this.findBySymbol(symbol, chain);
    if (matches.length === 0) {
      const suffix = chain ? ` on ${chain}` : '';
      throw new Error(
        `Token not found: ${symbol}${suffix}. ` +
          'Refresh available tokens or check symbol/chain.',
      );
    }
    return matches.sort((a, b) => a.assetId.localeCompare(b.assetId))[0];
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async fetchTokens(): Promise<Token[]> {
    const res = await fetch(`${this.baseUrl}/v0/tokens`);
    if (!res.ok) {
      throw new Error(`Failed to fetch tokens: ${res.status} ${res.statusText}`);
    }
    const tokens = (await res.json()) as Token[];
    this.cache = tokens;
    this.cacheTime = Date.now();
    return tokens;
  }
}

/**
 * Create a TokenRegistry with the same base URL as an IntentsClient config.
 */
export function createRegistry(config?: ClientConfig): TokenRegistry {
  return new TokenRegistry({ baseUrl: config?.baseUrl });
}
