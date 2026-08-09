// ---------------------------------------------------------------------------
// Mutes module — private off-chain mute prefs via gateway
// ---------------------------------------------------------------------------

import type { HttpClient } from '../internal/http.js';

export interface MuteRecord {
  mutedAccountId: string;
  createdAt: string;
}

export interface ListMutesResult {
  mutes: MuteRecord[];
}

/**
 * Private mute list for the authenticated viewer.
 *
 * ```ts
 * await os.mutes.add('bob.near');
 * await os.mutes.remove('bob.near');
 * const { mutes } = await os.mutes.list();
 * ```
 */
export class MutesModule {
  constructor(private readonly http: HttpClient) {}

  async list(): Promise<ListMutesResult> {
    return this.http.get<ListMutesResult>('/developer/mutes');
  }

  async add(mutedAccountId: string): Promise<MuteRecord> {
    const res = await this.http.post<{ mute: MuteRecord }>('/developer/mutes', {
      mutedAccountId,
    });
    return res.mute;
  }

  async remove(mutedAccountId: string): Promise<void> {
    await this.http.delete(
      `/developer/mutes/${encodeURIComponent(mutedAccountId)}`
    );
  }

  async has(mutedAccountId: string): Promise<boolean> {
    const { mutes } = await this.list();
    const target = mutedAccountId.trim().toLowerCase();
    return mutes.some((m) => m.mutedAccountId.toLowerCase() === target);
  }
}
