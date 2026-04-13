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

vi.mock('../../src/services/developer-apps/index.js', () => ({
  getDeveloperAppById: vi.fn(async (appId: string) => ({
    appId,
    ownerAccountId: 'alice.testnet',
    createdAt: Date.now(),
  })),
}));

import {
  createNotificationRule,
  deleteNotificationRule,
  listAllNotificationRules,
} from '../../src/services/notifications/rules.js';

describe('notification rules', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates recipient rules', async () => {
    const created = await createNotificationRule({
      ownerAccountId: 'alice.testnet',
      appId: 'portal',
      ruleType: 'recipient',
      recipientAccountId: 'bob.testnet',
      notificationTypes: ['reply', 'reaction'],
    });

    expect('code' in created).toBe(false);
    const rules = await listAllNotificationRules();
    expect(rules.some((rule) => rule.appId === 'portal')).toBe(true);
  });

  it('deletes rules by owner', async () => {
    const created = await createNotificationRule({
      ownerAccountId: 'alice.testnet',
      appId: 'portal',
      ruleType: 'group',
      groupId: 'guild',
    });

    if ('code' in created) {
      throw new Error('expected rule record');
    }

    expect(await deleteNotificationRule('alice.testnet', created.id)).toBe(
      true
    );
  });
});
