// tests/setup.ts
// Test setup with retry logic for cold starts

export const GATEWAY_URL = process.env.GATEWAY_URL || 'https://onsocial-gateway.fly.dev';

/**
 * Fetch with retry for cold start tolerance
 */
export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = 3
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(10000), // 10s timeout
      });
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      // Wait before retry (cold start)
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('Fetch failed after retries');
}
