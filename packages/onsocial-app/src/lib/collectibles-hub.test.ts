import { describe, expect, it } from 'vitest';
import {
  GOVERNANCE_DAO_ACCOUNT,
  TREASURY_DAO_ACCOUNT,
} from '@/lib/app-config';
import {
  APP_COLLECTIBLES_PATH,
  collectionDoorPath,
  collectionPath,
  collectionRedeemPath,
  collectiblesKindPath,
  collectiblesPlayPath,
  daoPath,
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
    expect(collectionPath('perk', { redeem: true })).toBe(
      '/collection/perk/redeem'
    );
    expect(collectionRedeemPath('perk')).toBe('/collection/perk/redeem');
    expect(isAppRoutePath('/collection/perk/redeem')).toBe(true);
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
    expect(resolveActiveOsAppId('/@alice.near/collectibles')).toBe(
      'collectibles'
    );
    expect(
      resolveActiveOsAppId('/@alice.near/collectibles?kind=writing')
    ).toBe('collectibles');
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
    expect(resolveActiveOsAppId(daoPath(GOVERNANCE_DAO_ACCOUNT))).toBe(
      'protocol'
    );
    expect(resolveActiveOsAppId(daoPath(TREASURY_DAO_ACCOUNT))).toBe(
      'protocol'
    );
    expect(
      resolveActiveOsAppId(
        `/dao/${encodeURIComponent('example.sputnik-dao.near')}`
      )
    ).toBe('daos');
    const protocol = gateOsApps().find((app) => app.id === 'protocol');
    expect(protocol?.kind).toBe('app');
    expect(protocol?.href).toBe(daoPath(GOVERNANCE_DAO_ACCOUNT));
    expect(
      appShellOsApps('alice.near').some((app) => app.id === 'protocol')
    ).toBe(true);
  });

  it('exposes Collectibles for gate and owner, not visitors', () => {
    expect(gateOsApps().some((app) => app.id === 'collectibles')).toBe(true);
    const owner = ownerPortfolioOsApps('alice.near');
    expect(owner.some((app) => app.id === 'collectibles')).toBe(true);
    expect(
      owner.find((app) => app.id === 'collectibles')?.href
    ).toBe('/@alice.near/collectibles');
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
