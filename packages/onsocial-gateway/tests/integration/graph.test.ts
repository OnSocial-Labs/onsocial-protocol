// tests/integration/graph.test.ts
// Integration test for gateway graph proxy (hits real Hasura via gateway)

import { describe, it, expect } from 'vitest';
import { GATEWAY_URL, fetchWithRetry, authHeaders } from './setup.js';

describe('Gateway Graph Integration', () => {
  it('should return healthy status', async () => {
    const res = await fetchWithRetry(`${GATEWAY_URL}/health`);
    const data = await res.json();
    
    expect(res.ok).toBe(true);
    expect(data.status).toBe('ok');
    expect(data.services).toContain('graph');
  });

  it('should report Hasura connected', async () => {
    const res = await fetch(`${GATEWAY_URL}/graph/health`);
    const data = await res.json();
    
    expect(res.ok).toBe(true);
    expect(data.status).toBe('ok');
    expect(data.hasura).toBe('connected');
  });

  it('should require auth for GraphQL queries', async () => {
    const res = await fetch(`${GATEWAY_URL}/graph/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
    });

    expect(res.status).toBe(401);
  });

  it('should proxy GraphQL queries with auth', async () => {
    const hdrs = await authHeaders();
    const res = await fetch(`${GATEWAY_URL}/graph/query`, {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify({ query: '{ __typename }' }),
    });
    const data = await res.json();

    // Gateway forwards to Hasura. Whether Hasura returns data or
    // an access-denied depends on Hasura JWT config — but the gateway
    // itself should accept the request (not 401).
    expect(res.status).not.toBe(401);
  });

  it('should reject missing query with auth', async () => {
    const hdrs = await authHeaders();
    const res = await fetch(`${GATEWAY_URL}/graph/query`, {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify({}),
    });
    const data = await res.json();
    
    expect(res.status).toBe(400);
    expect(data.error).toBe('Missing query');
  });

  it('should reject missing query without auth', async () => {
    const res = await fetch(`${GATEWAY_URL}/graph/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    // Auth middleware runs before query validation — expect 401
    expect(res.status).toBe(401);
  });
});
