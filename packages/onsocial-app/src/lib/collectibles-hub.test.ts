import { describe, expect, it } from 'vitest';
import { GOVERNANCE_DAO_ACCOUNT, TREASURY_DAO_ACCOUNT } from '@/lib/app-config';
import {
  APP_COLLECTIBLES_PATH,
  COLLECTIBLES_SEARCH_PARAM,
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
    expect(COLLECTIBLES_SEARCH_PARAM).toBe('q');
    expect(collectiblesPlayPath('night-drive')).toBe(
      '/collectibles/play?c=night-drive'
    );
    expect(
      collectiblesPlayPath('night-drive', { tokenId: 'night-drive:2' })
    ).toBe('/collectibles/play?c=night-drive&t=night-drive%3A2');
    expect(collectionPath('gate', { pass: true, tokenId: 'gate:2' })).toBe(
      '/collection/gate?pass=1&t=gate%3A2'
    );
    expect(collectionPath('gate', { door: true })).toBe(
      '/collection/gate/door'
    );
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
  it('marks New drop as Drops, not Market', () => {
    expect(resolveActiveOsAppId('/drops')).toBe('drops');
    expect(resolveActiveOsAppId('/drops/create')).toBe('drops');
    expect(resolveActiveOsAppId('/market/create')).toBe('drops');
    expect(resolveActiveOsAppId('/market')).toBe('market');
  });

  it('marks a drop page as Drops, not Hubs', () => {
    expect(resolveActiveOsAppId('/collection/night-drive')).toBe('drops');
    expect(resolveActiveOsAppId('/collection/night-drive/door')).toBe('drops');
    expect(resolveActiveOsAppId('/collection/night-drive/redeem')).toBe(
      'drops'
    );
    expect(resolveActiveOsAppId('/apps/night-roads')).toBe('hubs');
  });

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
    expect(resolveActiveOsAppId('/@alice.near/collectibles?kind=writing')).toBe(
      'collectibles'
    );
  });

  it('treats Protocol as part of DAOs in the launcher', () => {
    expect(isAppRoutePath('/protocol')).toBe(true);
    expect(resolveActiveOsAppId('/protocol')).toBe('daos');
    expect(resolveActiveOsAppId('/protocol?dao=treasury')).toBe('daos');
    expect(resolveActiveOsAppId(daoPath(GOVERNANCE_DAO_ACCOUNT))).toBe('daos');
    expect(resolveActiveOsAppId(daoPath(TREASURY_DAO_ACCOUNT))).toBe('daos');
    expect(
      resolveActiveOsAppId(
        `/dao/${encodeURIComponent('example.sputnik-dao.near')}`
      )
    ).toBe('daos');
    const rails = [
      gateOsApps(),
      ownerPortfolioOsApps('alice.near'),
      visitorPortfolioOsApps('alice.near'),
      appShellOsApps('alice.near'),
      appShellOsApps(null),
    ];
    for (const apps of rails) {
      expect(apps.some((app) => app.id === 'protocol')).toBe(false);
    }
  });

  it('keeps the signed-out gate to real apps', () => {
    expect(gateOsApps().map((app) => app.id)).toEqual([
      'home',
      'activity',
      'messages',
      'discover',
      'market',
      'drops',
      'collectibles',
      'groups',
      'hubs',
      'daos',
    ]);
  });

  it('keeps Collectibles in the same slot on every rail', () => {
    expect(gateOsApps().some((app) => app.id === 'collectibles')).toBe(true);
    const owner = ownerPortfolioOsApps('alice.near');
    expect(owner.find((app) => app.id === 'collectibles')?.href).toBe(
      '/@alice.near/collectibles'
    );
    const visitor = visitorPortfolioOsApps('bob.near');
    const dropsIdx = visitor.findIndex((app) => app.id === 'drops');
    expect(visitor[dropsIdx + 1]?.id).toBe('collectibles');
    expect(visitor[dropsIdx + 1]?.href).toBe('/@bob.near/collectibles');
    expect(visitor[dropsIdx + 2]?.id).toBe('groups');
  });

  it('opens Discover nested under the portfolio so leave returns there', () => {
    expect(
      ownerPortfolioOsApps('alice.near').find((app) => app.id === 'discover')
        ?.href
    ).toBe('/@alice.near/discover');
    expect(
      visitorPortfolioOsApps('bob.near').find((app) => app.id === 'discover')
        ?.href
    ).toBe('/@bob.near/discover');
    expect(
      appShellOsApps('alice.near').find((app) => app.id === 'discover')?.href
    ).toBe('/discover');
    expect(gateOsApps().find((app) => app.id === 'discover')?.href).toBe(
      '/discover'
    );
  });

  it('keeps Boost off the launcher — the owner face opens it', () => {
    const rails = [
      gateOsApps(),
      ownerPortfolioOsApps('alice.near'),
      visitorPortfolioOsApps('alice.near'),
      appShellOsApps('alice.near'),
      appShellOsApps(null),
    ];
    for (const apps of rails) {
      expect(apps.some((app) => app.id === 'boost')).toBe(false);
    }
  });

  it('keeps Collectibles after Market and Page last once signed in', () => {
    const disconnected = appShellOsApps(null);
    const marketIdx = disconnected.findIndex((app) => app.id === 'market');
    expect(disconnected[marketIdx + 1]?.id).toBe('drops');
    expect(disconnected[marketIdx + 2]?.id).toBe('collectibles');
    expect(disconnected[marketIdx + 2]?.href).toBe('/collectibles');
    expect(disconnected.at(-1)?.id).toBe('daos');

    const connected = appShellOsApps('alice.near');
    const connectedMarket = connected.findIndex((app) => app.id === 'market');
    expect(connected[connectedMarket + 1]?.id).toBe('drops');
    expect(connected[connectedMarket + 2]?.id).toBe('collectibles');
    expect(connected[connectedMarket + 2]?.href).toBe(
      '/@alice.near/collectibles'
    );
    expect(connected.at(-1)?.id).toBe('page');
    expect(ownerPortfolioOsApps('alice.near').at(-1)?.id).toBe('page');
  });
});
