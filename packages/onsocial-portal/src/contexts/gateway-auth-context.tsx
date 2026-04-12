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
import { gatewayLogin } from '@/features/onapi/api';

// ── Types ─────────────────────────────────────────────────────

interface GatewayAuthContextValue {
  /** Current JWT (null if not authenticated). */
  jwt: string | null;
  /** True while signing / exchanging with gateway. */
  isAuthenticating: boolean;
  /** Last auth error message (cleared on retry). */
  authError: string | null;
  /**
   * Ensure a valid JWT exists. If the user is connected but has no JWT,
   * triggers wallet signing (one popup). Returns the JWT or null on failure.
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

const STORAGE_KEY = 'onsocial_gateway_jwt';
const STORAGE_ACCOUNT_KEY = 'onsocial_gateway_account';

/** Decode JWT payload without verification (client-side only). */
function decodePayload(token: string): { exp?: number; accountId?: string } | null {
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

function loadStoredToken(accountId: string): string | null {
  try {
    const storedAccount = sessionStorage.getItem(STORAGE_ACCOUNT_KEY);
    if (storedAccount !== accountId) return null;
    const token = sessionStorage.getItem(STORAGE_KEY);
    if (token && isTokenValid(token)) return token;
    // Expired or missing — clean up
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_ACCOUNT_KEY);
  } catch {
    // SSR or storage unavailable
  }
  return null;
}

function storeToken(token: string, accountId: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
    sessionStorage.setItem(STORAGE_ACCOUNT_KEY, accountId);
  } catch {
    // Ignore storage errors
  }
}

function clearStoredToken(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_ACCOUNT_KEY);
  } catch {
    // Ignore
  }
}

// ── Provider ──────────────────────────────────────────────────

export function GatewayAuthProvider({ children }: { children: ReactNode }) {
  const { wallet, accountId, isConnected } = useWallet();
  const [jwt, setJwt] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const authPromiseRef = useRef<Promise<string | null> | null>(null);

  // Restore token from sessionStorage on mount / account change
  useEffect(() => {
    if (accountId) {
      const stored = loadStoredToken(accountId);
      if (stored) setJwt(stored);
    }
  }, [accountId]);

  // Clear JWT when wallet disconnects or account changes
  useEffect(() => {
    if (!isConnected) {
      setJwt(null);
      setAuthError(null);
      clearStoredToken();
    }
  }, [isConnected]);

  const clearAuth = useCallback(() => {
    setJwt(null);
    setAuthError(null);
    clearStoredToken();
  }, []);

  // Core auth function — deduplicates concurrent calls
  const ensureAuth = useCallback(async (): Promise<string | null> => {
    // Already have a valid token
    if (jwt && isTokenValid(jwt)) return jwt;

    // Check storage again (may have been set by another component)
    if (accountId) {
      const stored = loadStoredToken(accountId);
      if (stored) {
        setJwt(stored);
        return stored;
      }
    }

    // Need wallet to sign
    if (!wallet || !accountId) {
      setAuthError('Connect your wallet first');
      return null;
    }

    // Deduplicate: if already authenticating, wait for the same promise
    if (authPromiseRef.current) {
      return authPromiseRef.current;
    }

    const promise = (async () => {
      setIsAuthenticating(true);
      setAuthError(null);
      try {
        const token = await gatewayLogin(wallet, accountId);
        setJwt(token);
        storeToken(token, accountId);
        return token;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Authentication failed';
        setAuthError(msg);
        return null;
      } finally {
        setIsAuthenticating(false);
        authPromiseRef.current = null;
      }
    })();

    authPromiseRef.current = promise;
    return promise;
  }, [jwt, wallet, accountId]);

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
