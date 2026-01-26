// tests/graph.integration.test.ts
// Integration test for gateway graph proxy (hits real Hasura via gateway)

import { describe, it, expect } from 'vitest';
import { GATEWAY_URL, fetchWithRetry } from './setup.js';

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

  it('should proxy GraphQL queries to Hasura', async () => {
    const res = await fetch(`${GATEWAY_URL}/graph/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: '{ __typename }',
      }),
    });
    const data = await res.json();
    
    expect(res.ok).toBe(true);
    expect(data.data?.__typename).toBe('query_root');
  });

  it('should handle GraphQL errors gracefully', async () => {
    const res = await fetch(`${GATEWAY_URL}/graph/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: '{ nonExistentField }',
      }),
    });
    const data = await res.json();
    
    // Should return 200 with errors (GraphQL convention)
    expect(res.ok).toBe(true);
    expect(data.errors).toBeDefined();
    expect(Array.isArray(data.errors)).toBe(true);
  });

  it('should reject missing query', async () => {
    const res = await fetch(`${GATEWAY_URL}/graph/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    
    expect(res.status).toBe(400);
    expect(data.error).toBe('Missing query');
  });
});
