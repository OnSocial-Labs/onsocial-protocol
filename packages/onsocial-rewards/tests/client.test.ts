import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OnSocialRewards } from '../src/client.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  });
}

describe('OnSocialRewards', () => {
  let sdk: OnSocialRewards;

  beforeEach(() => {
    mockFetch.mockReset();
    sdk = new OnSocialRewards({
      apiKey: 'sk_test_123',
      appId: 'test_app',
      baseUrl: 'https://api.test.onsocial.id',
      rewardsContract: 'rewards.test.near',
    });
  });

  describe('constructor', () => {
    it('throws if apiKey is missing', () => {
      expect(() => new OnSocialRewards({ apiKey: '', appId: 'x' })).toThrow(
        'apiKey is required'
      );
    });

    it('throws if appId is missing', () => {
      expect(
        () => new OnSocialRewards({ apiKey: 'sk_test', appId: '' })
      ).toThrow('appId is required');
    });

    it('strips trailing slashes from baseUrl', () => {
      const s = new OnSocialRewards({
        apiKey: 'sk_test',
        appId: 'x',
        baseUrl: 'https://api.onsocial.id///',
      });
      mockFetch.mockReturnValueOnce(jsonResponse({ success: true }));
      s.credit({ accountId: 'a.near', source: 'test' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.onsocial.id/v1/reward',
        expect.anything()
      );
    });
  });

  describe('credit()', () => {
    it('sends correct request to backend API', async () => {
      mockFetch.mockReturnValueOnce(
        jsonResponse({
          success: true,
          tx_hash: 'abc123',
          app_id: 'test_app',
          account_id: 'alice.near',
        })
      );

      const result = await sdk.credit({
        accountId: 'alice.near',
        source: 'message',
      });

      expect(result.success).toBe(true);
      expect(result.tx_hash).toBe('abc123');

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test.onsocial.id/v1/reward');
      expect(opts.method).toBe('POST');
      expect(opts.headers['X-Api-Key']).toBe('sk_test_123');
      expect(opts.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(opts.body);
      expect(body).toEqual({
        account_id: 'alice.near',
        source: 'message',
      });
    });

    it('includes amount when provided', async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ success: true }));

      await sdk.credit({
        accountId: 'bob.near',
        source: 'quest',
        amount: '500000000000000000',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.amount).toBe('500000000000000000');
    });

    it('returns error response from backend', async () => {
      mockFetch.mockReturnValueOnce(
        jsonResponse({ success: false, error: 'daily cap exceeded' }, 502)
      );

      const result = await sdk.credit({
        accountId: 'alice.near',
        source: 'message',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('daily cap exceeded');
    });
  });

  describe('getUserAppReward()', () => {
    it('calls /v1/balance/:accountId and returns app_reward', async () => {
      const reward = {
        total_earned: '100',
        daily_earned: '100',
        last_day: 20520,
      };
      mockFetch.mockReturnValueOnce(
        jsonResponse({ success: true, app_reward: reward, claimable: '100' })
      );

      const result = await sdk.getUserAppReward('alice.near');

      expect(result).toEqual(reward);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test.onsocial.id/v1/balance/alice.near');
      expect(opts.headers['X-Api-Key']).toBe('sk_test_123');
    });
  });

  describe('getClaimable()', () => {
    it('calls /v1/balance/:accountId and returns claimable', async () => {
      mockFetch.mockReturnValueOnce(
        jsonResponse({
          success: true,
          claimable: '500000000000000000',
          app_reward: null,
        })
      );

      const result = await sdk.getClaimable('alice.near');
      expect(result).toBe('500000000000000000');
    });
  });

  describe('getAppConfig()', () => {
    it('calls /v1/app and returns config', async () => {
      const appConfig = {
        label: 'Test App',
        reward_per_action: '100000000000000000',
        daily_cap: '1000000000000000000',
        daily_budget: '0',
        daily_budget_spent: '0',
        budget_last_day: 0,
        total_budget: '0',
        total_credited: '0',
        authorized_callers: ['relayer.test.near'],
      };
      mockFetch.mockReturnValueOnce(
        jsonResponse({ success: true, config: appConfig })
      );

      const result = await sdk.getAppConfig();

      expect(result).toEqual(appConfig);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test.onsocial.id/v1/app');
      expect(opts.headers['X-Api-Key']).toBe('sk_test_123');
    });
  });

  describe('getUserReward() (direct RPC)', () => {
    function rpcResponse(value: unknown) {
      const encoded = new TextEncoder().encode(JSON.stringify(value));
      return jsonResponse({
        result: { result: Array.from(encoded) },
      });
    }

    it('calls NEAR RPC directly for global reward state', async () => {
      const reward = {
        total_earned: '1000',
        claimable: '500',
        claimed: '500',
        daily_earned: '100',
        last_day: 20520,
      };
      mockFetch.mockReturnValueOnce(rpcResponse(reward));

      const result = await sdk.getUserReward('alice.near');

      expect(result).toEqual(reward);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.method).toBe('query');
      expect(body.params.method_name).toBe('get_user_reward');
      expect(body.params.account_id).toBe('rewards.test.near');
    });

    it('returns null when RPC has no result', async () => {
      mockFetch.mockReturnValueOnce(jsonResponse({ result: {} }));

      const result = await sdk.getUserReward('nobody.near');
      expect(result).toBeNull();
    });
  });

  describe('getContractInfo() (direct RPC)', () => {
    function rpcResponse(value: unknown) {
      const encoded = new TextEncoder().encode(JSON.stringify(value));
      return jsonResponse({
        result: { result: Array.from(encoded) },
      });
    }

    it('calls NEAR RPC directly for contract info', async () => {
      const info = {
        version: '0.1.0',
        owner_id: 'onsocial.near',
        social_token: 'token.onsocial.near',
        max_daily: '1000000000000000000',
        pool_balance: '95000000000000000000',
        total_credited: '5000000000000000000',
        total_claimed: '4000000000000000000',
        intents_executors: [],
        authorized_callers: [],
        app_ids: ['test_app'],
      };
      mockFetch.mockReturnValueOnce(rpcResponse(info));

      const result = await sdk.getContractInfo();
      expect(result).toEqual(info);
    });
  });

  describe('claim()', () => {
    it('sends correct POST to /v1/claim', async () => {
      mockFetch.mockReturnValueOnce(
        jsonResponse({
          success: true,
          claimed: '500000000000000000',
          tx_hash: 'tx_claim_123',
          account_id: 'alice.near',
          powered_by: 'OnSocial stands with Acme Community',
        })
      );

      const result = await sdk.claim('alice.near');

      expect(result.success).toBe(true);
      expect(result.claimed).toBe('500000000000000000');
      expect(result.tx_hash).toBe('tx_claim_123');
      expect(result.powered_by).toBe('OnSocial stands with Acme Community');

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.test.onsocial.id/v1/claim');
      expect(opts.method).toBe('POST');
      expect(opts.headers['X-Api-Key']).toBe('sk_test_123');

      const body = JSON.parse(opts.body);
      expect(body).toEqual({ account_id: 'alice.near' });
    });

    it('handles nothing-to-claim response', async () => {
      mockFetch.mockReturnValueOnce(
        jsonResponse({
          success: true,
          claimed: '0',
          tx_hash: null,
          account_id: 'bob.near',
          powered_by: 'OnSocial',
        })
      );

      const result = await sdk.claim('bob.near');
      expect(result.success).toBe(true);
      expect(result.claimed).toBe('0');
      expect(result.tx_hash).toBeNull();
    });

    it('returns error when claim fails', async () => {
      mockFetch.mockReturnValueOnce(
        jsonResponse({ success: false, error: 'relayer timeout' }, 502)
      );

      const result = await sdk.claim('alice.near');
      expect(result.success).toBe(false);
      expect(result.error).toBe('relayer timeout');
    });
  });

  describe('badge()', () => {
    it('returns partnership message with partner name', () => {
      expect(sdk.badge('Acme Community')).toBe(
        '🤝 OnSocial stands with Acme Community'
      );
    });

    it('returns empty string without partner name', () => {
      expect(sdk.badge()).toBe('');
    });
  });
});
