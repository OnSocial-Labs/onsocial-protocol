import { describe, expect, it } from 'vitest';
import { resolveProtocolEntryRedirect } from '@/features/protocol/protocol-entry-redirect';
import {
  GOVERNANCE_DAO_ACCOUNT,
  TREASURY_DAO_ACCOUNT,
} from '@/lib/app-config';
import { APP_DAOS_PATH, daoPath } from '@/lib/app-routes';

function params(record: Record<string, string>): {
  get(name: string): string | null;
} {
  return {
    get(name) {
      return record[name] ?? null;
    },
  };
}

describe('resolveProtocolEntryRedirect', () => {
  it('defaults to governance portfolio', () => {
    expect(resolveProtocolEntryRedirect(params({}))).toBe(
      daoPath(GOVERNANCE_DAO_ACCOUNT)
    );
  });

  it('maps treasury board to treasury portfolio', () => {
    expect(resolveProtocolEntryRedirect(params({ dao: 'treasury' }))).toBe(
      daoPath(TREASURY_DAO_ACCOUNT)
    );
  });

  it('maps community without account to /daos', () => {
    expect(resolveProtocolEntryRedirect(params({ dao: 'community' }))).toBe(
      APP_DAOS_PATH
    );
  });

  it('maps community account to that DAO portfolio', () => {
    expect(
      resolveProtocolEntryRedirect(
        params({ dao: 'community', account: 'Demo.Sputnik-Dao.Near' })
      )
    ).toBe(daoPath('demo.sputnik-dao.near'));
  });

  it('preserves feed deep-link query on governance', () => {
    const href = resolveProtocolEntryRedirect(
      params({ status: 'approved', proposal: '12', q: 'upgrade' })
    );
    expect(href.startsWith(daoPath(GOVERNANCE_DAO_ACCOUNT))).toBe(true);
    expect(href).toContain('status=approved');
    expect(href).toContain('proposal=12');
    expect(href).toContain('q=upgrade');
  });
});
