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
    api = { setWebhook: vi.fn(), deleteWebhook: vi.fn() };
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
        expect.objectContaining({
          link_preview_options: expect.objectContaining({
            url: expect.any(String),
          }),
        })
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
        expect.objectContaining({
          link_preview_options: expect.objectContaining({
            url: expect.any(String),
          }),
        })
      );
    });

    it('links account when provided as payload', async () => {
      mockAppConfig();
      const ctx = makeCtx({ match: 'bob.near' });
      await commandHandlers.start(ctx);
      expect(mockStore.set).toHaveBeenCalledWith(12345, 'bob.near');
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('bob.near'),
        expect.objectContaining({
          link_preview_options: expect.objectContaining({
            url: expect.any(String),
          }),
        })
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
        expect.objectContaining({
          link_preview_options: expect.objectContaining({
            url: expect.any(String),
          }),
        })
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
      mockFetch.mockReturnValueOnce(
        jsonResponse({
          success: true,
          claimable: '500000000000000000',
          app_reward: null,
        })
      );
      const ctx = makeCtx();
      await commandHandlers.claim(ctx);
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Ready to claim 0.5 SOCIAL'),
        expect.objectContaining({
          link_preview_options: expect.objectContaining({
            url: expect.any(String),
          }),
        })
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
