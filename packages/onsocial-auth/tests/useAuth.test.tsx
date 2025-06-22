import { vi } from 'vitest';
import * as SecureStore from 'expo-secure-store';
vi.mock('expo-secure-store', () => ({
  setItemAsync: vi.fn(async (_k, v) => v),
  getItemAsync: vi.fn(async (_k) => 'mock-jwt'),
  deleteItemAsync: vi.fn(async (_k) => undefined),
}));

import { render, screen } from '@testing-library/react';
import React from 'react';
import { saveToken, getToken, clearToken } from '../src/storage';
import { useAuth } from '../src/hooks/useAuth';

function UseAuthTestComponent() {
  const { jwt, loading } = useAuth();
  return (
    <div>
      <span data-testid="jwt">{jwt === null ? 'null' : jwt}</span>
      <span data-testid="loading">{loading ? 'true' : 'false'}</span>
    </div>
  );
}

describe('useAuth', () => {
  it('returns initial state (jwt=null, loading=true)', () => {
    render(<UseAuthTestComponent />);
    expect(screen.getByTestId('jwt').textContent).toBe('null');
    expect(screen.getByTestId('loading').textContent).toBe('true');
  });

  it('sets jwt after loading', async () => {
    render(<UseAuthTestComponent />);
    // Wait for useEffect to resolve
    const jwtSpan = await screen.findByTestId('jwt');
    const loadingSpan = await screen.findByTestId('loading');
    expect(jwtSpan.textContent).toBe('mock-jwt');
    expect(loadingSpan.textContent).toBe('false');
  });

  it('handles getToken rejection', async () => {
    vi.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(
      new Error('fail')
    );
    render(<UseAuthTestComponent />);
    const jwtSpan = await screen.findByTestId('jwt');
    const loadingSpan = await screen.findByTestId('loading');
    expect(jwtSpan.textContent).toBe('null');
    expect(loadingSpan.textContent).toBe('false');
  });
});

describe('storage', () => {
  it('saves a token', async () => {
    await expect(saveToken('jwt-token')).resolves.toBe('jwt-token');
  });
  it('gets a token', async () => {
    await expect(getToken()).resolves.toBe('mock-jwt');
  });
  it('clears a token', async () => {
    await expect(clearToken()).resolves.toBeUndefined();
  });
});

// Rename this file to .tsx for JSX support
