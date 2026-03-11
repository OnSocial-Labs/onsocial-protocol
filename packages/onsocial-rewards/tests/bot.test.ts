import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Grammy before importing bot.ts ──

const mockOn = vi.fn();
const mockCommand = vi.fn();
const mockCallbackQuery = vi.fn();
const mockCatch = vi.fn();
const mockStart = vi.fn();

vi.mock('grammy', () => {
  class FakeBot {
    constructor(public token: string) {}
    command = mockCommand;
    callbackQuery = mockCallbackQuery;
    on = mockOn;
    catch = mockCatch;
    start = mockStart;
    api = { setWebhook: vi.fn(), deleteWebhook: vi.fn(), getMe: vi.fn().mockResolvedValue({ username: 'test_bot' }) };
  }
  class FakeInlineKeyboard {
    private buttons: { text: string; data?: string; url?: string }[][] = [[]];
    text(label: string, data: string) {
      this.buttons[this.buttons.length - 1].push({ text: label, data });
      return this;
    }
    url(label: string, href: string) {
      this.buttons[this.buttons.length - 1].push({ text: label, url: href });
      return this;
    }
    row() {
      this.buttons.push([]);
      return this;
    }
  }
  return { Bot: FakeBot, InlineKeyboard: FakeInlineKeyboard };
});

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { createRewardsBot, formatSocial } from '../src/bot.js';
import type { RewardsBotConfig, AccountStore } from '../src/bot.js';

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  });
}

describe('createRewardsBot', () => {
  const baseConfig: RewardsBotConfig = {
    botToken: 'fake-token',
    apiKey: 'sk_test_123',
    appId: 'test_app',
    baseUrl: 'https://api.test.onsocial.id',
    rewardsContract: 'rewards.test.near',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('returns a Grammy Bot instance', () => {
    const bot = createRewardsBot(baseConfig);
    expect(bot).toBeDefined();
    expect((bot as unknown as { token: string }).token).toBe('fake-token');
  });

  it('registers all expected commands', () => {
    createRewardsBot(baseConfig);
    const commandNames = mockCommand.mock.calls.map((c: unknown[]) => c[0]);
    expect(commandNames).toContain('start');
    expect(commandNames).toContain('balance');
    expect(commandNames).toContain('claim');
    expect(commandNames).toContain('help');
  });

  it('registers all expected callback queries', () => {
    createRewardsBot(baseConfig);
    const cbNames = mockCallbackQuery.mock.calls.map((c: unknown[]) => c[0]);
    expect(cbNames).toContain('cb:link');
    expect(cbNames).toContain('cb:help');
    expect(cbNames).toContain('cb:balance');
    expect(cbNames).toContain('cb:claim');
    expect(cbNames).toContain('cb:claim:confirm');
    expect(cbNames).toContain('cb:claim:cancel');
  });

  it('registers message handlers (account linking + activity)', () => {
    createRewardsBot(baseConfig);
    // Two bot.on('message', ...) calls: account linking + activity
    const onMessageCalls = mockOn.mock.calls.filter(
      (c: unknown[]) => c[0] === 'message'
    );
    expect(onMessageCalls.length).toBe(2);
  });

  it('registers error handler', () => {
    createRewardsBot(baseConfig);
    expect(mockCatch).toHaveBeenCalledTimes(1);
  });

  it('accepts custom store', () => {
    const mockStore: AccountStore = {
      get: vi.fn().mockResolvedValue('alice.near'),
      set: vi.fn().mockResolvedValue(undefined),
    };
    const bot = createRewardsBot({ ...baseConfig, store: mockStore });
    expect(bot).toBeDefined();
  });

  it('accepts custom onError handler', () => {
    const onError = vi.fn();
    const bot = createRewardsBot({ ...baseConfig, onError });
    expect(bot).toBeDefined();
  });
});

describe('createRewardsBot handlers', () => {
  let commandHandlers: Record<string, (ctx: unknown) => Promise<void>>;
  let callbackHandlers: Record<string, (ctx: unknown) => Promise<void>>;
  let messageHandlers: ((
    ctx: unknown,
    next: () => Promise<void>
  ) => Promise<void>)[];
  let mockStore: AccountStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    commandHandlers = {};
    callbackHandlers = {};
    messageHandlers = [];

    mockCommand.mockImplementation(
      (name: string, handler: (ctx: unknown) => Promise<void>) => {
        commandHandlers[name] = handler;
      }
    );
    mockCallbackQuery.mockImplementation(
      (name: string, handler: (ctx: unknown) => Promise<void>) => {
        callbackHandlers[name] = handler;
      }
    );
    mockOn.mockImplementation(
      (
        _event: string,
        handler: (ctx: unknown, next: () => Promise<void>) => Promise<void>
      ) => {
        messageHandlers.push(handler);
      }
    );

    mockStore = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
    };

    createRewardsBot({
      botToken: 'fake-token',
      apiKey: 'sk_test_123',
      appId: 'test_app',
      baseUrl: 'https://api.test.onsocial.id',
      rewardsContract: 'rewards.test.near',
      store: mockStore,
    });
  });

  function makeCtx(overrides: Record<string, unknown> = {}) {
    return {
      chat: { type: 'private', id: 999 },
      from: { id: 12345, is_bot: false },
      match: '',
      message: {
        text: '',
        from: { id: 12345, is_bot: false },
        chat: { type: 'private', id: 999 },
        message_id: 1,
      },
      reply: vi.fn().mockResolvedValue(undefined),
      replyWithPhoto: vi.fn().mockResolvedValue(undefined),
      editMessageText: vi.fn().mockResolvedValue(undefined),
      answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  /** Mock the /v1/app config fetch that ensureAppConfig() triggers. */
  function mockAppConfig() {
    mockFetch.mockReturnValueOnce(
      jsonResponse({
        success: true,
        config: {
          label: 'Test Community',
          reward_per_action: '100000000000000000',
          daily_cap: '1000000000000000000',
          daily_budget: '0',
          daily_budget_spent: '0',
          budget_last_day: 0,
          total_budget: '0',
          total_credited: '0',
          authorized_callers: [],
        },
      })
    );
  }

  describe('/start command', () => {
    it('ignores non-private chats', async () => {
      const ctx = makeCtx({ chat: { type: 'group', id: 999 } });
      await commandHandlers.start(ctx);
      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('shows welcome for unlinked users with real rates', async () => {
      mockAppConfig();
      const ctx = makeCtx();
      await commandHandlers.start(ctx);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Test Community'),
        expect.anything()
      );
      // Should show real reward rate from on-chain config
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('0.1 SOCIAL per message'),
        expect.anything()
      );
    });

    it('shows linked status for existing users', async () => {
      mockAppConfig();
      vi.mocked(mockStore.get).mockResolvedValue('alice.near');
      const ctx = makeCtx();
      await commandHandlers.start(ctx);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('alice.near'),
        expect.anything()
      );
    });

    it('links account when provided as payload', async () => {
      mockAppConfig();
      const ctx = makeCtx({ match: 'bob.near' });
      await commandHandlers.start(ctx);
      expect(mockStore.set).toHaveBeenCalledWith(12345, 'bob.near');
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('bob.near'),
        expect.anything()
      );
    });
  });

  describe('/balance command', () => {
    it('rejects unlinked users', async () => {
      mockAppConfig();
      const ctx = makeCtx();
      await commandHandlers.balance(ctx);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('No NEAR account linked')
      );
    });

    it('shows balance for linked users', async () => {
      mockAppConfig();
      vi.mocked(mockStore.get).mockResolvedValue('alice.near');
      // buildBalanceText makes 3 parallel fetches:
      // 1. getClaimable → GET /v1/balance/:id
      // 2. getUserReward → POST NEAR RPC (view call)
      // 3. getUserAppReward → GET /v1/balance/:id
      mockFetch
        .mockReturnValueOnce(
          jsonResponse({
            success: true,
            claimable: '500000000000000000',
            app_reward: null,
          })
        )
        .mockReturnValueOnce(
          jsonResponse({
            result: {
              result: Array.from(
                new TextEncoder().encode(
                  JSON.stringify({
                    total_earned: '1000000000000000000',
                    claimable: '500000000000000000',
                    last_day: 0,
                    daily_earned: '0',
                  })
                )
              ),
            },
          })
        )
        .mockReturnValueOnce(
          jsonResponse({
            success: true,
            app_reward: {
              total_earned: '1000000000000000000',
              daily_earned: '0',
              last_day: 0,
            },
          })
        );

      const ctx = makeCtx();
      await commandHandlers.balance(ctx);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('alice.near'),
        expect.anything()
      );
    });
  });

  describe('/claim command', () => {
    it('rejects unlinked users', async () => {
      const ctx = makeCtx();
      await commandHandlers.claim(ctx);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('No NEAR account linked')
      );
    });

    it('shows nothing-to-claim when balance is 0', async () => {
      vi.mocked(mockStore.get).mockResolvedValue('alice.near');
      mockFetch.mockReturnValueOnce(
        jsonResponse({ success: true, claimable: '0', app_reward: null })
      );
      const ctx = makeCtx();
      await commandHandlers.claim(ctx);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Nothing to claim'),
        expect.anything()
      );
    });

    it('shows confirm/cancel when balance > 0', async () => {
      vi.mocked(mockStore.get).mockResolvedValue('alice.near');
      // Use 1.5 SOCIAL (above the default minClaimAmount of 1)
      mockFetch.mockReturnValueOnce(
        jsonResponse({
          success: true,
          claimable: '1500000000000000000',
          app_reward: null,
        })
      );
      const ctx = makeCtx();
      await commandHandlers.claim(ctx);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Ready to claim 1.5 SOCIAL'),
        expect.anything()
      );
    });
  });

  describe('cb:claim:confirm', () => {
    it('executes claim and shows branded success message', async () => {
      vi.mocked(mockStore.get).mockResolvedValue('alice.near');
      mockFetch.mockReturnValueOnce(
        jsonResponse({
          success: true,
          claimed: '500000000000000000',
          tx_hash: 'tx123',
          account_id: 'alice.near',
          powered_by: 'OnSocial stands with Test App',
        })
      );

      const ctx = makeCtx();
      await callbackHandlers['cb:claim:confirm'](ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Claimed 0.5 SOCIAL'),
        expect.anything()
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('OnSocial stands with'),
        expect.anything()
      );
    });
  });

  describe('account linking via message', () => {
    it('links account when user sends valid NEAR account', async () => {
      const next = vi.fn().mockResolvedValue(undefined);
      const ctx = makeCtx({
        chat: { type: 'private', id: 999 },
        message: {
          text: 'alice.near',
          from: { id: 12345, is_bot: false },
          chat: { type: 'private', id: 999 },
        },
      });

      // First message handler is the account-linking one
      await messageHandlers[0](ctx, next);

      expect(mockStore.set).toHaveBeenCalledWith(12345, 'alice.near');
      expect(next).not.toHaveBeenCalled();
    });

    it('passes through non-account messages', async () => {
      const next = vi.fn().mockResolvedValue(undefined);
      const ctx = makeCtx({
        chat: { type: 'private', id: 999 },
        message: {
          text: 'hello world',
          from: { id: 12345, is_bot: false },
          chat: { type: 'private', id: 999 },
        },
      });

      await messageHandlers[0](ctx, next);

      expect(mockStore.set).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('group message activity', () => {
    it('credits reward for qualifying messages', async () => {
      vi.mocked(mockStore.get).mockResolvedValue('alice.near');
      // ensureAppConfig() fires non-blocking, then credit() fires
      mockAppConfig();
      mockFetch.mockReturnValueOnce(
        jsonResponse({ success: true, tx_hash: 'tx_credit' })
      );

      const next = vi.fn();
      const ctx = makeCtx({
        chat: { type: 'supergroup', id: 999 },
        message: {
          text: 'This is a meaningful message with enough characters',
          from: { id: 12345, is_bot: false },
          chat: { type: 'supergroup', id: 999 },
          message_id: 42,
        },
      });

      // Second message handler is the activity one
      await messageHandlers[1](ctx, next);

      // Verify credit was called through the SDK → fetch
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.onsocial.id/v1/reward',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('skips short messages', async () => {
      vi.mocked(mockStore.get).mockResolvedValue('alice.near');

      const next = vi.fn();
      const ctx = makeCtx({
        chat: { type: 'supergroup', id: 999 },
        message: {
          text: 'hi',
          from: { id: 12345, is_bot: false },
          chat: { type: 'supergroup', id: 999 },
          message_id: 42,
        },
      });

      await messageHandlers[1](ctx, next);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('skips unlinked users', async () => {
      const next = vi.fn();
      const ctx = makeCtx({
        chat: { type: 'supergroup', id: 999 },
        message: {
          text: 'This is a meaningful message with enough characters',
          from: { id: 99999, is_bot: false },
          chat: { type: 'supergroup', id: 999 },
          message_id: 42,
        },
      });

      await messageHandlers[1](ctx, next);

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests for user-facing config options (minMessageLength, cooldownSec,
// minClaimAmount, nudgeThreshold) — matches portal partner instructions.
// ---------------------------------------------------------------------------

describe('createRewardsBot config options', () => {
  let commandHandlers: Record<string, (ctx: unknown) => Promise<void>>;
  let callbackHandlers: Record<string, (ctx: unknown) => Promise<void>>;
  let messageHandlers: ((
    ctx: unknown,
    next: () => Promise<void>
  ) => Promise<void>)[];
  let mockStore: AccountStore;

  function setupBot(overrides: Partial<RewardsBotConfig> = {}) {
    commandHandlers = {};
    callbackHandlers = {};
    messageHandlers = [];

    mockCommand.mockImplementation(
      (name: string, handler: (ctx: unknown) => Promise<void>) => {
        commandHandlers[name] = handler;
      }
    );
    mockCallbackQuery.mockImplementation(
      (name: string, handler: (ctx: unknown) => Promise<void>) => {
        callbackHandlers[name] = handler;
      }
    );
    mockOn.mockImplementation(
      (
        _event: string,
        handler: (ctx: unknown, next: () => Promise<void>) => Promise<void>
      ) => {
        messageHandlers.push(handler);
      }
    );

    mockStore = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
    };

    createRewardsBot({
      botToken: 'fake-token',
      apiKey: 'sk_test_123',
      appId: 'test_app',
      baseUrl: 'https://api.test.onsocial.id',
      rewardsContract: 'rewards.test.near',
      store: mockStore,
      ...overrides,
    });
  }

  function makeCtx(overrides: Record<string, unknown> = {}) {
    return {
      chat: { type: 'private', id: 999 },
      from: { id: 12345, is_bot: false },
      match: '',
      message: {
        text: '',
        from: { id: 12345, is_bot: false },
        chat: { type: 'private', id: 999 },
        message_id: 1,
      },
      reply: vi.fn().mockResolvedValue(undefined),
      replyWithPhoto: vi.fn().mockResolvedValue(undefined),
      editMessageText: vi.fn().mockResolvedValue(undefined),
      answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  function mockAppConfig() {
    mockFetch.mockReturnValueOnce(
      jsonResponse({
        success: true,
        config: {
          label: 'Test Community',
          reward_per_action: '100000000000000000',
          daily_cap: '1000000000000000000',
          daily_budget: '0',
          daily_budget_spent: '0',
          budget_last_day: 0,
          total_budget: '0',
          total_credited: '0',
          authorized_callers: [],
        },
      })
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('minMessageLength', () => {
    it('rejects messages shorter than custom minMessageLength', async () => {
      setupBot({ minMessageLength: 20 });
      vi.mocked(mockStore.get).mockResolvedValue('alice.near');

      const ctx = makeCtx({
        chat: { type: 'supergroup', id: 999 },
        message: {
          text: 'Only fifteen ch', // 15 chars — below 20
          from: { id: 12345, is_bot: false },
          chat: { type: 'supergroup', id: 999 },
          message_id: 42,
        },
      });

      await messageHandlers[1](ctx, vi.fn());
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('accepts messages meeting custom minMessageLength', async () => {
      setupBot({ minMessageLength: 5 });
      vi.mocked(mockStore.get).mockResolvedValue('alice.near');
      mockAppConfig(); // ensureAppConfig
      mockFetch.mockReturnValueOnce(jsonResponse({ success: true }));

      const ctx = makeCtx({
        chat: { type: 'supergroup', id: 999 },
        message: {
          text: 'Hello', // exactly 5 chars
          from: { id: 12345, is_bot: false },
          chat: { type: 'supergroup', id: 999 },
          message_id: 42,
        },
      });

      await messageHandlers[1](ctx, vi.fn());
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.onsocial.id/v1/reward',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('cooldownSec', () => {
    it('blocks second message within cooldown window', async () => {
      setupBot({ cooldownSec: 120 });
      vi.mocked(mockStore.get).mockResolvedValue('alice.near');

      // First message — should credit
      mockAppConfig();
      mockFetch.mockReturnValueOnce(jsonResponse({ success: true }));

      const ctx1 = makeCtx({
        chat: { type: 'supergroup', id: 999 },
        message: {
          text: 'First qualifying message with enough length',
          from: { id: 12345, is_bot: false },
          chat: { type: 'supergroup', id: 999 },
          message_id: 1,
        },
      });
      await messageHandlers[1](ctx1, vi.fn());
      expect(mockFetch).toHaveBeenCalledTimes(2); // appConfig + credit

      mockFetch.mockReset();

      // Second message immediately — should be blocked by cooldown
      const ctx2 = makeCtx({
        chat: { type: 'supergroup', id: 999 },
        message: {
          text: 'Second message right away also long enough',
          from: { id: 12345, is_bot: false },
          chat: { type: 'supergroup', id: 999 },
          message_id: 2,
        },
      });
      await messageHandlers[1](ctx2, vi.fn());
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('minClaimAmount', () => {
    it('rejects claims below custom minClaimAmount', async () => {
      setupBot({ minClaimAmount: 5 });
      vi.mocked(mockStore.get).mockResolvedValue('alice.near');

      // 3 SOCIAL = 3e18 yocto — below the min of 5
      mockFetch.mockReturnValueOnce(
        jsonResponse({
          success: true,
          claimable: '3000000000000000000',
          app_reward: null,
        })
      );

      const ctx = makeCtx();
      await commandHandlers.claim(ctx);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('minimum claim is 5 SOCIAL'),
        expect.anything()
      );
    });

    it('allows claims meeting custom minClaimAmount', async () => {
      setupBot({ minClaimAmount: 2 });
      vi.mocked(mockStore.get).mockResolvedValue('alice.near');

      // 2.5 SOCIAL — above the min of 2
      mockFetch.mockReturnValueOnce(
        jsonResponse({
          success: true,
          claimable: '2500000000000000000',
          app_reward: null,
        })
      );

      const ctx = makeCtx();
      await commandHandlers.claim(ctx);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Ready to claim 2.5 SOCIAL'),
        expect.anything()
      );
    });
  });

  describe('nudgeThreshold', () => {
    it('nudges unlinked user after custom threshold messages', async () => {
      setupBot({ nudgeThreshold: 3 });
      mockAppConfig();

      // Mock bot.api.getMe for the nudge
      const botInstance = { api: { getMe: vi.fn().mockResolvedValue({ username: 'test_bot' }) } };
      // The bot instance isn't directly accessible, but the nudge triggers ctx.reply
      // We send 3 qualifying messages from an unlinked user

      const makeGroupCtx = (msgId: number) =>
        makeCtx({
          chat: { type: 'supergroup', id: 999 },
          message: {
            text: 'A qualifying message for nudge testing purposes',
            from: { id: 77777, is_bot: false },
            chat: { type: 'supergroup', id: 999 },
            message_id: msgId,
          },
          from: { id: 77777, is_bot: false },
        });

      // Messages 1 and 2: no nudge
      const ctx1 = makeGroupCtx(1);
      await messageHandlers[1](ctx1, vi.fn());
      expect(ctx1.reply).not.toHaveBeenCalled();

      const ctx2 = makeGroupCtx(2);
      await messageHandlers[1](ctx2, vi.fn());
      expect(ctx2.reply).not.toHaveBeenCalled();

      // Message 3: nudge fires
      const ctx3 = makeGroupCtx(3);
      await messageHandlers[1](ctx3, vi.fn());
      expect(ctx3.reply).toHaveBeenCalledWith(
        expect.stringContaining('contributing great content'),
        expect.anything()
      );
    });

    it('disables nudging when nudgeThreshold is 0', async () => {
      setupBot({ nudgeThreshold: 0 });

      const makeGroupCtx = (msgId: number) =>
        makeCtx({
          chat: { type: 'supergroup', id: 999 },
          message: {
            text: 'A qualifying message long enough to pass filter',
            from: { id: 88888, is_bot: false },
            chat: { type: 'supergroup', id: 999 },
            message_id: msgId,
          },
          from: { id: 88888, is_bot: false },
        });

      // Send many messages — should never nudge
      for (let i = 1; i <= 10; i++) {
        const ctx = makeGroupCtx(i);
        await messageHandlers[1](ctx, vi.fn());
        expect(ctx.reply).not.toHaveBeenCalled();
      }
    });
  });
});

describe('formatSocial', () => {
  it('formats zero', () => {
    expect(formatSocial('0')).toBe('0');
  });

  it('formats empty string', () => {
    expect(formatSocial('')).toBe('0');
  });

  it('formats whole SOCIAL amount', () => {
    expect(formatSocial('1000000000000000000')).toBe('1');
  });

  it('formats fractional amount', () => {
    expect(formatSocial('500000000000000000')).toBe('0.5');
  });

  it('formats with two decimal places', () => {
    expect(formatSocial('100000000000000000')).toBe('0.1');
  });

  it('strips trailing zeros in decimal', () => {
    expect(formatSocial('1100000000000000000')).toBe('1.1');
  });
});
