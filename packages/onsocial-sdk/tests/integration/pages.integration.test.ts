// ---------------------------------------------------------------------------
// Integration: Pages — page/main config writes and aggregated page reads
// ---------------------------------------------------------------------------

import { beforeAll, describe, expect, it } from 'vitest';
import type { OnSocial } from '../../src/client.js';
import { ACCOUNT_ID, confirmDirect, getClient, testId } from './helpers.js';

describe('pages', () => {
  let os: OnSocial;
  const tagline = `SDK page ${testId()}`;

  beforeAll(async () => {
    os = await getClient();
  });

  it('should set the full page config', async () => {
    const result = await os.pages.setConfig({
      template: 'creator',
      theme: {
        primary: '#ff6b00',
        background: '#101418',
      },
      sections: ['profile', 'posts', 'groups'],
      tagline,
    });
    expect(result.txHash).toBeTruthy();
  }, 25_000);

  it('should expose the config via getConfig', async () => {
    const config = await confirmDirect(
      async () => {
        const value = await os.pages.getConfig(ACCOUNT_ID);
        return value.tagline === tagline ? value : null;
      },
      'page config',
      { timeoutMs: 20_000, intervalMs: 2_000 }
    );

    expect(config?.template).toBe('creator');
    expect(config?.theme?.primary).toBe('#ff6b00');
    expect(config?.theme?.background).toBe('#101418');
    expect(config?.sections).toEqual(['profile', 'posts', 'groups']);
    expect(config?.tagline).toBe(tagline);
  }, 25_000);

  it('should update just the theme', async () => {
    const result = await os.pages.setTheme({
      primary: '#00b894',
      accent: '#ffeaa7',
    });
    expect(result.txHash).toBeTruthy();
  }, 25_000);

  it('should merge the theme into existing config', async () => {
    const config = await confirmDirect(
      async () => {
        const value = await os.pages.getConfig(ACCOUNT_ID);
        return value.theme?.primary === '#00b894' ? value : null;
      },
      'page theme',
      { timeoutMs: 20_000, intervalMs: 2_000 }
    );

    expect(config?.template).toBe('creator');
    expect(config?.tagline).toBe(tagline);
    expect(config?.theme?.primary).toBe('#00b894');
    expect(config?.theme?.accent).toBe('#ffeaa7');
  }, 25_000);

  it('should replace sections', async () => {
    const result = await os.pages.setSections(['profile', 'support', 'badges']);
    expect(result.txHash).toBeTruthy();
  }, 25_000);

  it('should expose the replaced sections via getConfig', async () => {
    const config = await confirmDirect(
      async () => {
        const value = await os.pages.getConfig(ACCOUNT_ID);
        return value.sections?.includes('support') ? value : null;
      },
      'page sections',
      { timeoutMs: 20_000, intervalMs: 2_000 }
    );

    expect(config?.sections).toEqual(['profile', 'support', 'badges']);
  }, 25_000);

  it('should toggle a section on', async () => {
    const result = await os.pages.setVisibility('events', true);
    expect(result.txHash).toBeTruthy();
  }, 25_000);

  it('should show the toggled-on section via getConfig', async () => {
    const config = await confirmDirect(
      async () => {
        const value = await os.pages.getConfig(ACCOUNT_ID);
        return value.sections?.includes('events') ? value : null;
      },
      'page visibility on',
      { timeoutMs: 20_000, intervalMs: 2_000 }
    );

    expect(config?.sections).toContain('events');
  }, 25_000);

  it('should toggle a section off', async () => {
    const result = await os.pages.setVisibility('support', false);
    expect(result.txHash).toBeTruthy();
  }, 25_000);

  it('should hide the toggled-off section via getConfig', async () => {
    const config = await confirmDirect(
      async () => {
        const value = await os.pages.getConfig(ACCOUNT_ID);
        return value.sections?.includes('support') ? null : value;
      },
      'page visibility off',
      { timeoutMs: 20_000, intervalMs: 2_000 }
    );

    expect(config?.sections).not.toContain('support');
    expect(config?.sections).toContain('events');
  }, 25_000);

  it('should update the template only', async () => {
    const result = await os.pages.setTemplate('minimal');
    expect(result.txHash).toBeTruthy();
  }, 25_000);

  it('should expose the updated template via the aggregated page endpoint', async () => {
    const page = await confirmDirect(
      async () => {
        const value = await os.pages.get(ACCOUNT_ID);
        return value.config?.template === 'minimal' ? value : null;
      },
      'aggregated page data',
      { timeoutMs: 20_000, intervalMs: 2_000 }
    );

    expect(page?.accountId).toBe(ACCOUNT_ID);
    expect(page?.config.template).toBe('minimal');
    expect(page?.config.tagline).toBe(tagline);
    expect(page?.config.sections).toContain('events');
  }, 25_000);

  it('should list available templates', async () => {
    const templates = await os.pages.getTemplates();
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.some((t) => t.id === 'minimal')).toBe(true);
  });
});
