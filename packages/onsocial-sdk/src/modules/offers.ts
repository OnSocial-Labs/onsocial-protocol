// ---------------------------------------------------------------------------
// Offers module — standing services (`offers/<id>`)
// ---------------------------------------------------------------------------

import type { SocialModule } from './social.js';
import {
  buildOfferRemoveData,
  buildOfferSetData,
  createOfferId,
  offerMaxForKind,
  parseOfferKeyEntry,
  sortOffers,
  type OfferBuildInput,
  type OfferRecord,
} from '../builders/offers.js';
import type { ProfileKind } from '../schema/v1.js';
import type { RelayResponse } from '../types.js';

export class OffersModule {
  constructor(private _social: SocialModule) {}

  async list(accountId: string): Promise<OfferRecord[]> {
    const id = accountId.trim();
    if (!id) return [];
    const entries = await this._social.listKeys({
      prefix: `${id}/offers/`,
      limit: 8,
      withValues: true,
    });
    const offers = entries
      .map((entry) => parseOfferKeyEntry(entry))
      .filter((offer): offer is OfferRecord => offer != null);
    return sortOffers(offers);
  }

  async create(
    input: OfferBuildInput,
    opts?: {
      wait?: boolean;
      offerId?: string;
      /** Writer account. Required to enforce the person/org cap on create. */
      accountId?: string;
      kind?: ProfileKind | null;
    }
  ): Promise<{ offerId: string; result: RelayResponse }> {
    const offerId = opts?.offerId?.trim() || createOfferId();
    const max = offerMaxForKind(opts?.kind);
    if (max === 0) {
      throw new Error('This account cannot offer a service');
    }
    const accountId = opts?.accountId?.trim() || '';
    if (accountId && !opts?.offerId) {
      const existing = await this.list(accountId);
      if (existing.length >= max) {
        throw new Error('Offer limit reached');
      }
    }
    const result = await this._social.set(
      buildOfferSetData(offerId, input),
      opts
    );
    return { offerId, result };
  }

  async remove(
    offerId: string,
    opts?: { wait?: boolean }
  ): Promise<RelayResponse> {
    return this._social.set(buildOfferRemoveData(offerId), opts);
  }
}
