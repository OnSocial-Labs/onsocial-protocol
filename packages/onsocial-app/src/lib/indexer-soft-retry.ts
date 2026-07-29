/** Soft catch-up after chain writes while the indexer lags. */
export const INDEXER_SOFT_RETRY_MS = [2_000, 5_000] as const;

export const INDEXER_CATCH_UP_COPY = 'May take a moment to appear.';
