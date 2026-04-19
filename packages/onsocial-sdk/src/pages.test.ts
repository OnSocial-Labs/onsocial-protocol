import { describe, expect, it, vi } from 'vitest';
import { PagesModule } from './pages.js';

function makeModule() {
  const get = vi.fn();
  const post = vi.fn().mockResolvedValue({ txHash: 'tx' });
  const http = { get, post, network: 'testnet' } as never;
  return { get, post, pages: new PagesModule(http) };
}

describe('PagesModule', () => {
  describe('setConfig', () => {
    it('posts page config to /compose/set at page/main', async () => {
      const { post, pages } = makeModule();
      await pages.setConfig({ template: 'creator', sections: ['profile', 'links'] });
      expect(post).toHaveBeenCalledWith('/compose/set', {
        path: 'page/main',
        value: JSON.stringify({ template: 'creator', sections: ['profile', 'links'] }),
        targetAccount: 'core.onsocial.testnet',
      });
    });
  });

  describe('setTheme', () => {
    it('reads current config then writes merged theme', async () => {
      const { get, post, pages } = makeModule();
      get.mockResolvedValueOnce({ value: JSON.stringify({ template: 'minimal', sections: ['profile'] }) });
      await pages.setTheme({ primary: '#ff0000' });
      expect(post).toHaveBeenCalledWith('/compose/set', {
        path: 'page/main',
        value: JSON.stringify({ template: 'minimal', sections: ['profile'], theme: { primary: '#ff0000' } }),
        targetAccount: 'core.onsocial.testnet',
      });
    });
  });

  describe('setSections', () => {
    it('reads current config then writes merged sections', async () => {
      const { get, post, pages } = makeModule();
      get.mockResolvedValueOnce({ value: JSON.stringify({ template: 'creator' }) });
      await pages.setSections(['profile', 'support', 'badges']);
      expect(post).toHaveBeenCalledWith('/compose/set', {
        path: 'page/main',
        value: JSON.stringify({ template: 'creator', sections: ['profile', 'support', 'badges'] }),
        targetAccount: 'core.onsocial.testnet',
      });
    });
  });

  describe('setVisibility', () => {
    it('adds a section when visible=true', async () => {
      const { get, post, pages } = makeModule();
      get.mockResolvedValueOnce({ value: JSON.stringify({ sections: ['profile', 'links'] }) });
      await pages.setVisibility('badges', true);
      const call = post.mock.calls[0];
      const written = JSON.parse(call[1].value);
      expect(written.sections).toContain('badges');
    });

    it('removes a section when visible=false', async () => {
      const { get, post, pages } = makeModule();
      get.mockResolvedValueOnce({
        value: JSON.stringify({ sections: ['profile', 'links', 'badges'] }),
      });
      await pages.setVisibility('badges', false);
      const call = post.mock.calls[0];
      const written = JSON.parse(call[1].value);
      expect(written.sections).not.toContain('badges');
    });

    it('uses default sections when none configured', async () => {
      const { get, post, pages } = makeModule();
      get.mockResolvedValueOnce({ value: '{}' });
      await pages.setVisibility('events', true);
      const call = post.mock.calls[0];
      const written = JSON.parse(call[1].value);
      expect(written.sections).toContain('events');
      // Default set
      expect(written.sections).toContain('profile');
    });
  });

  describe('setTemplate', () => {
    it('reads current config and sets template', async () => {
      const { get, post, pages } = makeModule();
      get.mockResolvedValueOnce({ value: JSON.stringify({ sections: ['profile'] }) });
      await pages.setTemplate('creator');
      const call = post.mock.calls[0];
      const written = JSON.parse(call[1].value);
      expect(written.template).toBe('creator');
      expect(written.sections).toEqual(['profile']);
    });
  });

  describe('getConfig', () => {
    it('returns parsed config from /data/get-one', async () => {
      const { get, pages } = makeModule();
      get.mockResolvedValueOnce({
        value: JSON.stringify({ template: 'minimal', theme: { primary: '#000' } }),
      });
      const cfg = await pages.getConfig('alice.near');
      expect(get).toHaveBeenCalledWith(
        expect.stringContaining('/data/get-one?')
      );
      expect(cfg).toEqual({ template: 'minimal', theme: { primary: '#000' } });
    });

    it('returns empty config when no entry exists', async () => {
      const { get, pages } = makeModule();
      get.mockResolvedValueOnce(null);
      const cfg = await pages.getConfig('bob.near');
      expect(cfg).toEqual({});
    });

    it('returns object value without double-parsing', async () => {
      const { get, pages } = makeModule();
      get.mockResolvedValueOnce({
        value: { template: 'creator' },
      });
      const cfg = await pages.getConfig();
      expect(cfg).toEqual({ template: 'creator' });
    });
  });

  describe('get', () => {
    it('fetches aggregated page data from /data/page', async () => {
      const { get, pages } = makeModule();
      const mockData = {
        accountId: 'alice.near',
        profile: { name: 'Alice' },
        config: {},
        stats: { standingCount: 0, postCount: 0, badgeCount: 0, groupCount: 0 },
        recentPosts: [],
        badges: [],
      };
      get.mockResolvedValueOnce(mockData);
      const result = await pages.get('alice.near');
      expect(get).toHaveBeenCalledWith('/data/page?accountId=alice.near');
      expect(result).toEqual(mockData);
    });

    it('encodes special characters in account ID', async () => {
      const { get, pages } = makeModule();
      get.mockResolvedValueOnce({});
      await pages.get('alice+test.near');
      expect(get).toHaveBeenCalledWith(
        '/data/page?accountId=alice%2Btest.near'
      );
    });
  });

  describe('getTemplates', () => {
    it('returns template list from /data/page/templates', async () => {
      const { get, pages } = makeModule();
      const templates = [
        { id: 'minimal', name: 'Minimal', premium: false },
        { id: 'creator', name: 'Creator', premium: false },
      ];
      get.mockResolvedValueOnce(templates);
      const result = await pages.getTemplates();
      expect(get).toHaveBeenCalledWith('/data/page/templates');
      expect(result).toEqual(templates);
    });
  });
});
