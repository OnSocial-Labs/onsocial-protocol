import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/index.js', () => ({
  config: {
    hasuraAdminSecret: '',
    hasuraUrl: 'http://localhost:8080/v1/graphql',
    nodeEnv: 'test',
  },
}));

vi.mock('../../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  deleteDeveloperApp,
  getDeveloperAppById,
  listDeveloperApps,
  registerDeveloperApp,
} from '../../src/services/developer-apps/index.js';

describe('developer app registry', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers and lists an app', async () => {
    const created = await registerDeveloperApp(
      'Alice.Testnet',
      'Portal_App_One'
    );
    expect('code' in created).toBe(false);

    const apps = await listDeveloperApps('alice.testnet');
    expect(apps.map((entry) => entry.appId)).toContain('portal_app_one');
  });

  it('prevents duplicate app ids', async () => {
    await registerDeveloperApp('alice.testnet', 'portal_dup');
    const duplicate = await registerDeveloperApp('bob.testnet', 'portal_dup');

    expect(duplicate).toEqual({
      code: 'APP_ALREADY_EXISTS',
      message: 'appId is already registered',
    });
  });

  it('deletes apps and resolves by id', async () => {
    await registerDeveloperApp('alice.testnet', 'portal_owned');
    const existing = await getDeveloperAppById('portal_owned');
    expect(existing?.ownerAccountId).toBe('alice.testnet');

    const deleted = await deleteDeveloperApp('alice.testnet', 'portal_owned');
    expect(deleted).toBe(true);
    expect(await getDeveloperAppById('portal_owned')).toBeNull();
  });
});
