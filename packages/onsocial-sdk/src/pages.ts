// ---------------------------------------------------------------------------
// OnSocial SDK — pages module (page configuration & aggregated page data)
// ---------------------------------------------------------------------------

import type { HttpClient } from './http.js';
import { resolveContractId } from './contracts.js';
import type {
  PageConfig,
  PageData,
  PageSection,
  PageTheme,
  RelayResponse,
} from './types.js';

/**
 * Pages — configure and read `{account}.onsocial.id` page data.
 *
 * Page configuration is stored as a KV entry at `page/main` in the user's
 * namespace on the core contract. The edge renderer at `*.onsocial.id` reads
 * this config together with profile, posts, badges, and standings to compose
 * the final HTML page.
 *
 * ```ts
 * // Set page config (template, theme, sections)
 * await os.pages.setConfig({
 *   template: 'creator',
 *   theme: { primary: '#ff6b00', background: '#0a0a0a' },
 *   sections: ['profile', 'links', 'support', 'posts', 'badges'],
 * });
 *
 * // Read aggregated page data
 * const page = await os.pages.get('alice.near');
 *
 * // Toggle a section
 * await os.pages.setVisibility('events', true);
 * ```
 */
export class PagesModule {
  private _coreContract: string;

  constructor(private _http: HttpClient) {
    this._coreContract = resolveContractId(_http.network, 'core');
  }

  // ── Writes ──────────────────────────────────────────────────────────────

  /**
   * Set the full page configuration (template, theme, sections).
   *
   * Overwrites the entire `page/main` entry.
   */
  async setConfig(config: PageConfig): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/compose/set', {
      path: 'page/main',
      value: JSON.stringify(config),
      targetAccount: this._coreContract,
    });
  }

  /**
   * Update only the theme colors without touching other config.
   */
  async setTheme(theme: PageTheme): Promise<RelayResponse> {
    const current = await this.getConfig();
    return this.setConfig({ ...current, theme });
  }

  /**
   * Set the ordered list of visible sections.
   */
  async setSections(sections: PageSection[]): Promise<RelayResponse> {
    const current = await this.getConfig();
    return this.setConfig({ ...current, sections });
  }

  /**
   * Toggle a single section's visibility.
   */
  async setVisibility(
    section: PageSection,
    visible: boolean
  ): Promise<RelayResponse> {
    const current = await this.getConfig();
    const sections = current.sections ?? [
      'profile',
      'links',
      'support',
      'posts',
      'badges',
    ];
    const filtered = sections.filter((s) => s !== section);
    if (visible) filtered.push(section);
    return this.setConfig({ ...current, sections: filtered });
  }

  /**
   * Set the page template.
   */
  async setTemplate(template: string): Promise<RelayResponse> {
    const current = await this.getConfig();
    return this.setConfig({ ...current, template });
  }

  // ── Reads ───────────────────────────────────────────────────────────────

  /**
   * Get the page configuration for an account.
   *
   * Returns the raw `page/main` KV value, or defaults if unset.
   */
  async getConfig(accountId?: string): Promise<PageConfig> {
    const params = new URLSearchParams({ key: 'page/main' });
    if (accountId) params.set('accountId', accountId);
    const entry = await this._http.get<{ value: unknown }>(
      `/data/get-one?${params}`
    );
    if (entry?.value && typeof entry.value === 'string') {
      try {
        return JSON.parse(entry.value) as PageConfig;
      } catch {
        return {};
      }
    }
    if (entry?.value && typeof entry.value === 'object') {
      return entry.value as PageConfig;
    }
    return {};
  }

  /**
   * Get aggregated page data for rendering — profile, config, stats,
   * recent posts, and badges in a single call.
   */
  async get(accountId: string): Promise<PageData> {
    return this._http.get<PageData>(
      `/data/page?accountId=${encodeURIComponent(accountId)}`
    );
  }

  /**
   * List available page templates.
   */
  async getTemplates(): Promise<
    Array<{ id: string; name: string; premium: boolean }>
  > {
    return this._http.get<Array<{ id: string; name: string; premium: boolean }>>(
      '/data/page/templates'
    );
  }
}
