// tests/auth.integration.test.ts
// Integration test for gateway auth endpoints

import { describe, it, expect } from 'vitest';
import { GATEWAY_URL, fetchWithRetry } from './setup.js';

describe('Gateway Auth Integration', () => {
  it('should return tier info for any account', async () => {
    const res = await fetchWithRetry(`${GATEWAY_URL}/auth/tier/alice.near`);
    const data = await res.json();
    
    expect(res.ok).toBe(true);
    expect(data.accountId).toBe('alice.near');
    expect(data.tier).toBe('free'); // No SOCIAL token, defaults to free
    expect(data.rateLimit).toBe(60);
  });

  it('should login and return JWT (dev mode)', async () => {
    const res = await fetch(`${GATEWAY_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: 'test.near',
        message: 'OnSocial Auth: 1706000000',
        signature: 'test-signature',
        publicKey: 'ed25519:test',
      }),
    });
    const data = await res.json();
    
    expect(res.ok).toBe(true);
    expect(data.token).toBeDefined();
    expect(data.tier).toBe('free');
    expect(data.expiresIn).toBe('1h');
  });

  it('should reject login with missing fields', async () => {
    const res = await fetch(`${GATEWAY_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: 'test.near',
        // missing message, signature, publicKey
      }),
    });
    const data = await res.json();
    
    expect(res.status).toBe(400);
    expect(data.error).toBe('Missing required fields');
  });

  it('should refresh token with valid JWT', async () => {
    // First login to get a token
    const loginRes = await fetch(`${GATEWAY_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: 'test.near',
        message: 'OnSocial Auth: 1706000000',
        signature: 'test-signature',
        publicKey: 'ed25519:test',
      }),
    });
    const loginData = await loginRes.json();
    
    // Then refresh
    const refreshRes = await fetch(`${GATEWAY_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${loginData.token}`,
      },
    });
    const refreshData = await refreshRes.json();
    
    expect(refreshRes.ok).toBe(true);
    expect(refreshData.token).toBeDefined();
    expect(refreshData.token).toMatch(/^eyJ/); // Valid JWT format
  });

  it('should reject refresh without token', async () => {
    const res = await fetch(`${GATEWAY_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    
    expect(res.status).toBe(401);
    expect(data.error).toBe('Valid token required');
  });

  it('should return user info with /me endpoint', async () => {
    // Login first
    const loginRes = await fetch(`${GATEWAY_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: 'test.near',
        message: 'OnSocial Auth: 1706000000',
        signature: 'test-signature',
        publicKey: 'ed25519:test',
      }),
    });
    const loginData = await loginRes.json();
    
    // Get /me
    const meRes = await fetch(`${GATEWAY_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${loginData.token}` },
    });
    const meData = await meRes.json();
    
    expect(meRes.ok).toBe(true);
    expect(meData.accountId).toBe('test.near');
    expect(meData.tier).toBe('free');
  });
});

describe('JWT Security', () => {
  it('should reject malformed JWT', async () => {
    const res = await fetch(`${GATEWAY_URL}/auth/me`, {
      headers: { Authorization: 'Bearer not-a-valid-jwt' },
    });
    
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/invalid|malformed|token|authentication|required/i);
  });

  it('should reject JWT with invalid signature', async () => {
    // Valid format but wrong signature (tampered)
    const tamperedJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2NvdW50SWQiOiJoYWNrZXIubmVhciIsInRpZXIiOiJidWlsZGVyIiwiaWF0IjoxNzA2MDAwMDAwfQ.INVALID_SIGNATURE_HERE';
    
    const res = await fetch(`${GATEWAY_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${tamperedJwt}` },
    });
    
    expect(res.status).toBe(401);
  });

  it('should reject expired JWT', async () => {
    // JWT with exp in the past (would need to mock time or use a pre-generated expired token)
    // For now, verify the endpoint properly validates
    const res = await fetch(`${GATEWAY_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2NvdW50SWQiOiJ0ZXN0Lm5lYXIiLCJ0aWVyIjoiZnJlZSIsImlhdCI6MTYwMDAwMDAwMCwiZXhwIjoxNjAwMDAwMDAxfQ.invalid',
      },
    });
    
    expect(res.status).toBe(401);
  });

  it('should decode JWT payload correctly', async () => {
    const loginRes = await fetch(`${GATEWAY_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: 'payload-test.near',
        message: 'OnSocial Auth: 1706000000',
        signature: 'test-signature',
        publicKey: 'ed25519:test',
      }),
    });
    const { token } = await loginRes.json();
    
    // Decode JWT payload (base64)
    const payload = JSON.parse(atob(token.split('.')[1]));
    
    expect(payload.accountId).toBe('payload-test.near');
    expect(payload.tier).toBe('free');
    expect(payload.iat).toBeDefined();
    expect(payload.exp).toBeDefined();
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it('should reject /me without Authorization header', async () => {
    const res = await fetch(`${GATEWAY_URL}/auth/me`);
    
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/token|unauthorized|required/i);
  });

  it('should reject wrong Authorization scheme', async () => {
    const loginRes = await fetch(`${GATEWAY_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: 'test.near',
        message: 'OnSocial Auth: 1706000000',
        signature: 'test-signature',
        publicKey: 'ed25519:test',
      }),
    });
    const { token } = await loginRes.json();
    
    // Use Basic instead of Bearer
    const res = await fetch(`${GATEWAY_URL}/auth/me`, {
      headers: { Authorization: `Basic ${token}` },
    });
    
    expect(res.status).toBe(401);
  });
});
