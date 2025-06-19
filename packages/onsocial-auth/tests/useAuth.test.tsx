jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (_k, v) => v),
  getItemAsync: jest.fn(async (_k) => 'mock-jwt'),
  deleteItemAsync: jest.fn(async (_k) => undefined),
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
    const originalGetItemAsync = require('expo-secure-store').getItemAsync;
    require('expo-secure-store').getItemAsync = jest.fn(async () => {
      throw new Error('fail');
    });
    render(<UseAuthTestComponent />);
    const jwtSpan = await screen.findByTestId('jwt');
    const loadingSpan = await screen.findByTestId('loading');
    expect(jwtSpan.textContent).toBe('null');
    expect(loadingSpan.textContent).toBe('false');
    require('expo-secure-store').getItemAsync = originalGetItemAsync;
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
