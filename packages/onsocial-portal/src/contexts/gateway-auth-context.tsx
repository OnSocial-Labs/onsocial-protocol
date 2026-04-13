'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useWallet } from '@/contexts/wallet-context';
import { gatewayLogin, gatewayRefresh } from '@/features/onapi/api';

// ── Types ─────────────────────────────────────────────────────

interface GatewayAuthContextValue {
  /** Current access JWT (null if not authenticated). */
  jwt: string | null;
  /** True while signing / exchanging with gateway. */
  isAuthenticating: boolean;
  /** Last auth error message (cleared on retry). */
  authError: string | null;
  /**
   * Ensure a valid JWT exists. Tries silent refresh first, then wallet sign.
   * Returns the JWT or null on failure.
   */
  ensureAuth: () => Promise<string | null>;
  /** Clear the stored JWT (e.g. on sign-out). */
  clearAuth: () => void;
}

const GatewayAuthContext = createContext<GatewayAuthContextValue>({
  jwt: null,
  isAuthenticating: false,
  authError: null,
  ensureAuth: async () => null,
  clearAuth: () => {},
});

export const useGatewayAuth = () => useContext(GatewayAuthContext);

// ── Helpers ───────────────────────────────────────────────────

/** Decode JWT payload without verification (client-side only). */
function decodePayload(
  token: string
): { exp?: number; accountId?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1]));
  } catch {
    return null;
  }
}

/** Check if a JWT is still valid (with 2-minute safety margin). */
function isTokenValid(token: string): boolean {
  const payload = decodePayload(token);
  if (!payload?.exp) return false;
  return payload.exp * 1000 > Date.now() + 2 * 60 * 1000;
}

// ── Provider ──────────────────────────────────────────────────

export function GatewayAuthProvider({ children }: { children: ReactNode }) {
  const { wallet, accountId, isConnected } = useWallet();
  const [jwt, setJwt] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const authPromiseRef = useRef<Promise<string | null> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousAccountIdRef = useRef<string | null>(null);

  // Schedule a silent refresh before the access token expires
  const scheduleRefresh = useCallback((token: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    const payload = decodePayload(token);
    if (!payload?.exp) return;

    // Refresh 2 minutes before expiry, minimum 10 seconds from now
    const msUntilRefresh = Math.max(
      payload.exp * 1000 - Date.now() - 2 * 60 * 1000,
      10_000
    );

    refreshTimerRef.current = setTimeout(async () => {
      try {
        const result = await gatewayRefresh();
        if (result) {
          setJwt(result.token);
          scheduleRefresh(result.token);
        }
      } catch {
        // Silent refresh failed — user will re-auth on next ensureAuth()
      }
    }, msUntilRefresh);
  }, []);

  // Clear JWT when wallet disconnects
  useEffect(() => {
    if (!isConnected) {
      setJwt(null);
      setAuthError(null);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    }
  }, [isConnected]);

  // Clear JWT immediately when the connected wallet account changes.
  useEffect(() => {
    if (previousAccountIdRef.current !== accountId) {
      setJwt(null);
      setAuthError(null);
      authPromiseRef.current = null;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      previousAccountIdRef.current = accountId ?? null;
    }
  }, [accountId]);

  // On mount / account change: try silent refresh to restore session
  useEffect(() => {
    if (!accountId || !isConnected) return;

    let cancelled = false;
    gatewayRefresh()
      .then((result) => {
        if (cancelled || !result) return;
        // Verify the refreshed token is for the current account
        const payload = decodePayload(result.token);
        if (payload?.accountId === accountId) {
          setJwt(result.token);
          scheduleRefresh(result.token);
        }
      })
      .catch(() => {
        // No valid refresh cookie — user will sign on first ensureAuth()
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, isConnected, scheduleRefresh]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  const clearAuth = useCallback(() => {
    setJwt(null);
    setAuthError(null);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  }, []);

  const runAuthFlow = useCallback(async (
    options?: { silent?: boolean }
  ): Promise<string | null> => {
    const silent = options?.silent ?? false;

    // Already have a valid token
    if (jwt && isTokenValid(jwt)) return jwt;

    // Try silent refresh first (cookie-based, no popup)
    try {
      const result = await gatewayRefresh();
      if (result) {
        const payload = decodePayload(result.token);
        if (payload?.accountId === accountId) {
          setJwt(result.token);
          scheduleRefresh(result.token);
          return result.token;
        }
      }
    } catch {
      // Refresh failed — fall through to wallet sign
    }

    // Need wallet to sign
    if (!wallet || !accountId) {
      if (!silent) {
        setAuthError('Connect your wallet first');
      }
      return null;
    }

    // Deduplicate: if already authenticating, wait for the same promise
    if (authPromiseRef.current) {
      return authPromiseRef.current;
    }

    const promise = (async () => {
      setIsAuthenticating(true);
      if (!silent) {
        setAuthError(null);
      }
      try {
        const token = await gatewayLogin(wallet, accountId);
        setJwt(token);
        scheduleRefresh(token);
        return token;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Authentication failed';
        if (!silent) {
          setAuthError(msg);
        }
        return null;
      } finally {
        setIsAuthenticating(false);
        authPromiseRef.current = null;
      }
    })();

    authPromiseRef.current = promise;
    return promise;
  }, [jwt, wallet, accountId, scheduleRefresh]);

  // Core auth function — deduplicates concurrent calls
  const ensureAuth = useCallback(async (): Promise<string | null> => {
    return runAuthFlow({ silent: false });
  }, [runAuthFlow]);

  const value: GatewayAuthContextValue = {
    jwt,
    isAuthenticating,
    authError,
    ensureAuth,
    clearAuth,
  };

  return (
    <GatewayAuthContext.Provider value={value}>
      {children}
    </GatewayAuthContext.Provider>
  );
}
