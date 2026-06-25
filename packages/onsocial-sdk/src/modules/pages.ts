// ---------------------------------------------------------------------------
// OnSocial SDK — pages module (page configuration & aggregated page data)
// ---------------------------------------------------------------------------

import type { HttpClient } from '../internal/http.js';
import { resolveContractId } from '../internal/contracts.js';
import type { QueryModule } from '../query/index.js';
import {
  composeAndSign,
  type SessionGetter,
  type BroadcastGetter,
} from '../internal/session-bridge.js';
import type {
  PageConfig,
  PageData,
  PageSection,
  PageTheme,
  RelayResponse,
} from '../types.js';
import {
  mergeMoodIntoPageConfig,
  type BuiltInPageMoodId,
} from './pages/moods.js';

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
 *
 * @throws {SessionRequiredError} On writes when no session is attached and broadcast is not `'wallet'`.
 */
export class PagesModule {
  private _coreContract: string;

  constructor(
    private _http: HttpClient,
    private _query: QueryModule,
    private _getSession: SessionGetter,
    private _getBroadcast?: BroadcastGetter
  ) {
    this._coreContract = resolveContractId(_http.network, 'core');
  }

  private _broadcastOpts():
    | { broadcast: ReturnType<BroadcastGetter> }
    | undefined {
    const b = this._getBroadcast?.();
    return b !== undefined ? { broadcast: b } : undefined;
  }

  // ── Writes ──────────────────────────────────────────────────────────────

  /**
   * Set the full page configuration (template, theme, sections).
   *
   * Overwrites the entire `page/main` entry.
   */
  async setConfig(
    config: PageConfig,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      'set',
      {
        path: 'page/main',
        value: JSON.stringify(config),
        targetAccount: this._coreContract,
      },
      'pages.setConfig',
      { ...this._broadcastOpts(), wait: opts?.wait }
    );
  }

  /**
   * Apply a built-in page mood to `page/main` — merges mood metadata and theme
   * into the existing page config without replacing other fields.
   */
  async setMood(
    moodId: BuiltInPageMoodId,
    opts?: {
      note?: string;
      now?: number;
      wait?: boolean;
      accountId?: string;
    }
  ): Promise<RelayResponse> {
    const current = await this.getConfig(opts?.accountId);
    const next = mergeMoodIntoPageConfig(current, moodId, {
      note: opts?.note,
      now: opts?.now,
    });
    return this.setConfig(next, { wait: opts?.wait });
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
   * Reads the indexer (`pages_current`) first, then falls back to gateway RPC
   * (`/data/get-one`) when the row is not indexed yet.
   */
  async getConfig(accountId?: string): Promise<PageConfig> {
    const resolvedAccountId = accountId ?? this._http.actorId ?? undefined;

    if (resolvedAccountId) {
      try {
        const indexed = await this._query.pages.getConfig(resolvedAccountId);
        if (indexed !== null) {
          return indexed;
        }
      } catch {
        // Fall through to RPC when GraphQL is unavailable.
      }
    }

    return this._getConfigFromRpc(resolvedAccountId);
  }

  /** @internal RPC fallback for pre-index or post-write freshness. */
  private async _getConfigFromRpc(accountId?: string): Promise<PageConfig> {
    const params = new URLSearchParams({ key: 'page/main' });
    const resolvedAccountId = accountId ?? this._http.actorId ?? undefined;
    if (resolvedAccountId) params.set('accountId', resolvedAccountId);
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
    return this._http.get<
      Array<{ id: string; name: string; premium: boolean }>
    >('/data/page/templates');
  }
}
