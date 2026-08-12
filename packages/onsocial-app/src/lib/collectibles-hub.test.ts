import { describe, expect, it } from 'vitest';
import {
  APP_COLLECTIBLES_PATH,
  collectionDoorPath,
  collectionPath,
  collectionRedeemPath,
  collectiblesKindPath,
  collectiblesPlayPath,
  isAppRoutePath,
} from '@/lib/app-routes';
import {
  appShellOsApps,
  gateOsApps,
  ownerPortfolioOsApps,
  resolveActiveOsAppId,
  visitorPortfolioOsApps,
} from '@/lib/os-apps';

describe('collectibles routes', () => {
  it('registers /collectibles as an app shell path', () => {
    expect(APP_COLLECTIBLES_PATH).toBe('/collectibles');
    expect(isAppRoutePath('/collectibles')).toBe(true);
    expect(isAppRoutePath('/collectibles/play')).toBe(true);
    expect(collectiblesKindPath('writing')).toBe('/collectibles?kind=writing');
    expect(collectiblesKindPath('all')).toBe('/collectibles');
    expect(collectiblesPlayPath('night-drive')).toBe(
      '/collectibles/play?c=night-drive'
    );
    expect(collectiblesPlayPath('night-drive', { tokenId: 'night-drive:2' })).toBe(
      '/collectibles/play?c=night-drive&t=night-drive%3A2'
    );
    expect(collectionPath('gate', { pass: true, tokenId: 'gate:2' })).toBe(
      '/collection/gate?pass=1&t=gate%3A2'
    );
    expect(collectionPath('gate', { door: true })).toBe('/collection/gate/door');
    expect(collectionDoorPath('gate')).toBe('/collection/gate/door');
    expect(isAppRoutePath('/collection/gate/door')).toBe(true);
  });
});

describe('collectibles os apps', () => {
  it('marks collectibles active on the vault route', () => {
    expect(resolveActiveOsAppId('/collectibles')).toBe('collectibles');
    expect(resolveActiveOsAppId('/collectibles?kind=audio')).toBe(
      'collectibles'
    );
    expect(resolveActiveOsAppId('/collectibles/play?c=album')).toBe(
      'collectibles'
    );
  });

  it('exposes Protocol as an in-app launcher destination', () => {
    expect(isAppRoutePath('/protocol')).toBe(true);
    expect(resolveActiveOsAppId('/protocol')).toBe('protocol');
    expect(resolveActiveOsAppId('/protocol?dao=treasury')).toBe('protocol');
    expect(resolveActiveOsAppId('/protocol?dao=community')).toBe('protocol');
    expect(
      resolveActiveOsAppId(
        '/protocol?dao=community&account=example.sputnik-dao.near'
      )
    ).toBe('protocol');
    const protocol = gateOsApps().find((app) => app.id === 'protocol');
    expect(protocol?.kind).toBe('app');
    expect(protocol?.href).toBe('/protocol');
    expect(
      appShellOsApps('alice.near').some((app) => app.id === 'protocol')
    ).toBe(true);
  });

  it('exposes Collectibles for gate and owner, not visitors', () => {
    expect(gateOsApps().some((app) => app.id === 'collectibles')).toBe(true);
    expect(
      ownerPortfolioOsApps('alice.near').some((app) => app.id === 'collectibles')
    ).toBe(true);
    expect(
      visitorPortfolioOsApps('alice.near').some(
        (app) => app.id === 'collectibles'
      )
    ).toBe(false);
  });

  it('inserts Collectibles after Market when the wallet is connected', () => {
    const disconnected = appShellOsApps(null).map((app) => app.id);
    expect(disconnected).not.toContain('collectibles');

    const connected = appShellOsApps('alice.near').map((app) => app.id);
    const marketIdx = connected.indexOf('market');
    expect(connected[marketIdx + 1]).toBe('collectibles');
  });
});
