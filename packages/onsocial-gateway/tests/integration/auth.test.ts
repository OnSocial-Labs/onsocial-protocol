// tests/auth.integration.test.ts
// Integration test for gateway auth endpoints
//
// Since B1 fix: signature verification runs in ALL environments.
// Tests with fake credentials now correctly expect 401.

import { describe, it, expect } from 'vitest';
import { GATEWAY_URL } from './setup.js';

describe('Gateway Auth Integration', () => {
  it('should reject login with fake signature', async () => {
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

    expect(res.status).toBe(401);
    expect(data.error).toBe('Authentication failed');
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

  it('should reject refresh with no token', async () => {
    const res = await fetch(`${GATEWAY_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toBe('Valid token required');
  });

  it('should reject /me without valid token', async () => {
    const meRes = await fetch(`${GATEWAY_URL}/auth/me`);
    const meData = await meRes.json();

    expect(meRes.status).toBe(401);
    expect(meData.error).toMatch(/authentication|required/i);
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

  it('should reject login with fake credentials (no dev bypass)', async () => {
    // Verifies that the dev-mode bypass (B1 vulnerability) is removed.
    // Even in development/test mode, fake credentials must be rejected.
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
    const data = await loginRes.json();

    expect(loginRes.status).toBe(401);
    expect(data.error).toBe('Authentication failed');
  });

  it('should reject /me without Authorization header', async () => {
    const res = await fetch(`${GATEWAY_URL}/auth/me`);
    
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/token|unauthorized|required/i);
  });

  it('should reject wrong Authorization scheme', async () => {
    // Use Basic instead of Bearer
    const res = await fetch(`${GATEWAY_URL}/auth/me`, {
      headers: { Authorization: 'Basic some-token-value' },
    });

    expect(res.status).toBe(401);
  });
});
