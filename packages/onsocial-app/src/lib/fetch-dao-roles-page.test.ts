import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDaoRolesPage } from '@/lib/fetch-dao-roles-client';
import {
  FeedDaoMembershipsProvider,
  useProtocolDaoMemberships,
} from '@/hooks/use-protocol-dao-memberships';

describe('fetchDaoRolesPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for the whole page in one request', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            accounts: [
              {
                accountId: 'alice.near',
                memberships: {
                  governance: 'council',
                  treasury: null,
                  proposer: { governance: false, treasury: false },
                },
              },
              {
                accountId: 'bob.near',
                memberships: {
                  governance: null,
                  treasury: null,
                  proposer: { governance: false, treasury: false },
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const roles = await fetchDaoRolesPage([
      'bob.near',
      'alice.near',
      'alice.near',
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls.at(0)?.at(0));
    expect(url).toContain('/api/profile/dao-roles?');
    expect(url).toContain('accountIds=alice.near');
    expect(url).toContain('accountIds=bob.near');
    expect(roles['alice.near']?.governance).toBe('council');
    expect(roles['bob.near']?.governance).toBeNull();
  });
});

function SeededHandle() {
  const marks = useProtocolDaoMemberships('alice.near', true);
  return createElement(
    'span',
    { className: 'post-identity-handle' },
    '@alice.near',
    marks?.governance
      ? createElement('i', { className: 'protocol-identity-mark' })
      : null
  );
}

describe('page dao seed', () => {
  it('paints the mark in the same handle markup as the first render', () => {
    const html = renderToStaticMarkup(
      createElement(
        FeedDaoMembershipsProvider,
        {
          memberships: {
            'alice.near': {
              governance: 'council',
              treasury: null,
              proposer: { governance: false, treasury: false },
            },
          },
        },
        createElement(SeededHandle)
      )
    );
    expect(html).toContain('post-identity-handle');
    expect(html).toContain('@alice.near');
    expect(html).toContain('protocol-identity-mark');
  });
});
