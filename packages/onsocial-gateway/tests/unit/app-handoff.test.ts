import { describe, expect, it } from 'vitest';
import {
  consumeAppHandoff,
  createAppHandoff,
  listedOriginsFromApps,
} from '../../src/services/app-handoff.js';
import { listingOrigin } from '../../src/services/developer-apps/listing.js';

const listedApp = {
  appId: 'tracker',
  ownerAccountId: 'alice.testnet',
  createdAt: Date.now(),
  name: 'Tracker',
  iconUrl: null,
  href: 'https://track.example.com/app',
  listed: true,
};

describe('app handoff', () => {
  it('issues a one-time code bound to the listing origin', async () => {
    const created = await createAppHandoff('bob.testnet', listedApp);
    expect('code' in created && created.code.length > 20).toBe(true);
    if ('error' in created) throw new Error(created.error);

    expect(listingOrigin(listedApp.href!)).toBe('https://track.example.com');
    expect(
      await consumeAppHandoff(created.code, 'tracker', 'https://other.example')
    ).toMatchObject({ code: 'INVALID_HANDOFF' });

    const again = await createAppHandoff('bob.testnet', listedApp);
    if ('error' in again) throw new Error(again.error);
    expect(
      await consumeAppHandoff(again.code, 'tracker', 'https://track.example.com')
    ).toEqual({
      accountId: 'bob.testnet',
      appId: 'tracker',
    });
    const serverSide = await createAppHandoff('bob.testnet', listedApp);
    if ('error' in serverSide) throw new Error(serverSide.error);
    expect(await consumeAppHandoff(serverSide.code, 'tracker')).toEqual({
      accountId: 'bob.testnet',
      appId: 'tracker',
    });
    expect(
      await consumeAppHandoff(again.code, 'tracker', 'https://track.example.com')
    ).toMatchObject({
      code: 'INVALID_HANDOFF',
    });
  });

  it('rejects an unlisted app', async () => {
    expect(
      await createAppHandoff('bob.testnet', { ...listedApp, listed: false })
    ).toMatchObject({ code: 'NOT_LISTED' });
  });

  it('collects listed https origins', () => {
    expect(
      listedOriginsFromApps([
        { href: 'https://track.example.com/app' },
        { href: 'http://insecure.example' },
      ])
    ).toEqual(new Set(['https://track.example.com']));
  });
});
