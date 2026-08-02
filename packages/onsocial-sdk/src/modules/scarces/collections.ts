// ---------------------------------------------------------------------------
// Collections — create, mintFrom, purchaseFrom, airdrop, pause, resume, delete.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../../internal/http.js';
import type { StorageProvider } from '../../storage/provider.js';
import type {
  CollectionOptions,
  GenerateSetJob,
  GenerateSetJobState,
  GenerativeLayerSpec,
  RelayResponse,
  VariationSetUpload,
} from '../../types.js';
import {
  composeAndSign,
  composeFormAndSign,
  signAndRelay,
  type SessionGetter,
  type BroadcastGetter,
} from '../../internal/session-bridge.js';
import { SCARCES_VERBS } from './verbs.js';
import { resolveContractId } from '../../internal/contracts.js';
import {
  buildCreateCollectionAction,
  withCollectionProvenance,
} from '../../builders/scarces/collections.js';
import { hasLocalUpload, resolveScarceMedia } from './_media.js';
import { scarcesRelayOptions } from './_relay.js';

/** Allowlist entry as accepted by the scarces contract. */
export interface AllowlistEntry {
  account_id: string;
  allocation: number;
}

/** Gateway wire shape of a generative render job (snake_case). */
interface RawGenerateJob {
  job_id: string;
  state: GenerateSetJobState;
  progress: { done: number; total: number };
  result?: VariationSetUpload;
  error?: string;
}

function mapGenerateJob(raw: RawGenerateJob): GenerateSetJob {
  return {
    jobId: raw.job_id,
    state: raw.state,
    progress: raw.progress,
    ...(raw.result ? { result: raw.result } : {}),
    ...(raw.error ? { error: raw.error } : {}),
  };
}

export class ScarcesCollectionsApi {
  private _scarcesContract: string;

  constructor(
    private _http: HttpClient,
    private _getSession: SessionGetter,
    private _storage?: StorageProvider,
    private _getBroadcast?: BroadcastGetter
  ) {
    this._scarcesContract = resolveContractId(_http.network, 'scarces');
  }

  private _relayOpts(opts?: { confirmation?: boolean; depositYocto?: string }) {
    return scarcesRelayOptions(this._getBroadcast, opts);
  }

  /**
   * Create a collection for batch / drop minting.
   *
   * ```ts
   * await os.scarces.collections.create({
   *   collectionId: 'genesis',
   *   totalSupply: 1000,
   *   title: 'Genesis Collection',
   *   priceNear: '1',
   * });
   * ```
   */
  async create(options: CollectionOptions): Promise<RelayResponse> {
    // Every minted token carries drop / series / creator provenance in its
    // NEP-177 `extra` — wallets and marketplaces can attribute it anywhere.
    const opts = withCollectionProvenance(options, this._http.actorId);
    // Variation sets, trait directories, and random drops always go through
    // the gateway — directory pins and CID liveness checks happen server-side.
    const needsGatewayCompose =
      (opts.images?.length ?? 0) > 0 ||
      Boolean(opts.variationsCid) ||
      Boolean(opts.referenceCid) ||
      Boolean(opts.randomAssignment);
    if (
      !needsGatewayCompose &&
      hasLocalUpload(this._storage, opts.image, opts.mediaCid)
    ) {
      const { mediaCid, mediaHash } = await resolveScarceMedia(
        opts,
        this._storage
      );
      const action = buildCreateCollectionAction({
        ...opts,
        ...(mediaCid ? { mediaCid } : {}),
        ...(mediaHash ? { mediaHash } : {}),
      });
      return signAndRelay(
        this._http,
        this._getSession(),
        action as Record<string, unknown>,
        this._scarcesContract,
        'scarces.collections.create',
        this._relayOpts()
      );
    }

    // FormData upload route — gateway uploads media + builds the action,
    // SDK signs with the session key and relays via /relay/delegate.
    const form = new FormData();
    form.append('collectionId', opts.collectionId);
    form.append('totalSupply', String(opts.totalSupply));
    form.append('title', opts.title);
    if (opts.priceNear) form.append('priceNear', opts.priceNear);
    if (opts.description) form.append('description', opts.description);
    if (opts.royalty) form.append('royalty', JSON.stringify(opts.royalty));
    if (opts.extra) form.append('extra', JSON.stringify(opts.extra));
    if (opts.startTime) form.append('startTime', opts.startTime);
    if (opts.endTime) form.append('endTime', opts.endTime);
    if (opts.expiresAtMs != null)
      form.append('expiresAtMs', String(opts.expiresAtMs));
    if (opts.appId) form.append('appId', opts.appId);
    if (opts.mintMode) form.append('mintMode', opts.mintMode);
    if (opts.maxPerWallet)
      form.append('maxPerWallet', String(opts.maxPerWallet));
    if (opts.renewable !== undefined)
      form.append('renewable', String(opts.renewable));
    if (opts.transferable !== undefined)
      form.append('transferable', String(opts.transferable));
    if (opts.burnable !== undefined)
      form.append('burnable', String(opts.burnable));
    if (opts.maxRedeems != null)
      form.append('maxRedeems', String(opts.maxRedeems));
    if (opts.metadata) form.append('metadata', JSON.stringify(opts.metadata));
    if (opts.mediaCid) form.append('mediaCid', opts.mediaCid);
    if (opts.mediaHash) form.append('mediaHash', opts.mediaHash);
    if (opts.variationsCid) form.append('variationsCid', opts.variationsCid);
    if (opts.variationsExt) form.append('variationsExt', opts.variationsExt);
    if (opts.referenceCid) form.append('referenceCid', opts.referenceCid);
    if (opts.referenceExt) form.append('referenceExt', opts.referenceExt);
    if (opts.randomAssignment !== undefined)
      form.append('randomAssignment', String(opts.randomAssignment));
    if (opts.image) form.append('image', opts.image);
    for (const file of opts.images ?? []) {
      form.append('images', file);
    }

    const result = await composeFormAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.CREATE_COLLECTION,
      form,
      'scarces.collections.create',
      this._relayOpts()
    );
    return result.relay;
  }

  /**
   * Pin a zipped variation set (art + optional traits) before creating the
   * drop. Archive files must be seat-named — `1.png` … `N.png` (and
   * `1.json` … `N.json` for traits). The gateway unpacks each archive and
   * pins it as one IPFS directory on the platform pinning account.
   *
   * ```ts
   * const set = await os.scarces.collections.uploadVariationSet({
   *   imagesZip, traitsZip,
   * });
   * await os.scarces.collections.create({
   *   collectionId: 'punks',
   *   totalSupply: set.variations.count,
   *   title: 'Punks',
   *   variationsCid: set.variations.cid,
   *   variationsExt: set.variations.ext,
   *   referenceCid: set.reference?.cid,
   *   randomAssignment: true,
   * });
   * ```
   */
  async uploadVariationSet(opts: {
    imagesZip: Blob | File;
    traitsZip?: Blob | File;
  }): Promise<VariationSetUpload> {
    const form = new FormData();
    form.append('images', opts.imagesZip, 'images.zip');
    if (opts.traitsZip) form.append('traits', opts.traitsZip, 'traits.zip');
    return this._http.requestForm<VariationSetUpload>(
      'POST',
      '/compose/upload/variation-set',
      form
    );
  }

  /**
   * Start a server-side generative render — the 10k-scale path. Uploads only
   * the trait layer images plus a recipe (layer order, rarity weights,
   * supply); the gateway composites every piece natively and pins art +
   * trait JSON as IPFS directories. Returns immediately with a job to poll
   * via `generateVariationSetStatus`.
   *
   * ```ts
   * let job = await os.scarces.collections.generateVariationSet({
   *   supply: 10_000,
   *   layers: [
   *     { name: 'Background', traits: [{ name: 'Red', weight: 9, image: red }] },
   *     { name: 'Hat', noneWeight: 1, traits: [{ name: 'Crown', weight: 1, image: crown }] },
   *   ],
   * });
   * while (job.state !== 'done' && job.state !== 'failed') {
   *   await sleep(2_500);
   *   job = await os.scarces.collections.generateVariationSetStatus(job.jobId);
   * }
   * ```
   */
  async generateVariationSet(opts: {
    supply: number;
    layers: GenerativeLayerSpec[];
  }): Promise<GenerateSetJob> {
    const form = new FormData();
    let imageIndex = 0;
    const recipeLayers = opts.layers.map((layer) => ({
      name: layer.name,
      noneWeight: layer.noneWeight ?? 0,
      traits: layer.traits.map((trait) => {
        form.append('layerImages', trait.image, `trait-${imageIndex}.png`);
        return { name: trait.name, weight: trait.weight, image: imageIndex++ };
      }),
    }));
    form.append(
      'recipe',
      JSON.stringify({ supply: opts.supply, layers: recipeLayers })
    );

    const raw = await this._http.requestForm<RawGenerateJob>(
      'POST',
      '/compose/generate/variation-set',
      form
    );
    return mapGenerateJob(raw);
  }

  /** Poll a server-side render job started by `generateVariationSet`. */
  async generateVariationSetStatus(jobId: string): Promise<GenerateSetJob> {
    const raw = await this._http.get<RawGenerateJob>(
      `/compose/generate/variation-set/${encodeURIComponent(jobId)}`
    );
    return mapGenerateJob(raw);
  }

  /** Mint from an existing collection. */
  async mintFrom(
    collectionId: string,
    quantity = 1,
    receiverId?: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.MINT_FROM_COLLECTION,
      {
        collectionId,
        quantity,
        receiverId,
      },
      'scarces.mintFromCollection',
      this._relayOpts()
    );
  }

  /**
   * Purchase from a collection (pay priceNear per token).
   *
   * Attach `depositYocto` equal to `price × quantity` (wallet broadcast) —
   * session FunctionCall keys cannot pay value deposits, and the gateway
   * relayer only allows 0 / 1 yocto. `maxPricePerTokenNear` guards against a
   * price bump between quote and mint.
   */
  async purchaseFrom(
    collectionId: string,
    maxPricePerTokenNear: string,
    quantityOrOpts: number | { quantity?: number; depositYocto?: string } = 1
  ): Promise<RelayResponse> {
    const opts =
      typeof quantityOrOpts === 'number'
        ? { quantity: quantityOrOpts }
        : quantityOrOpts;
    const quantity = opts.quantity ?? 1;
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.PURCHASE_FROM_COLLECTION,
      {
        collectionId,
        quantity,
        maxPricePerTokenNear,
      },
      'scarces.purchaseFromCollection',
      this._relayOpts(
        opts.depositYocto !== undefined
          ? { depositYocto: opts.depositYocto }
          : undefined
      )
    );
  }

  /** Airdrop scarces from a collection to multiple receivers. */
  async airdrop(
    collectionId: string,
    receivers: string[]
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.AIRDROP_FROM_COLLECTION,
      {
        collectionId,
        receivers,
      },
      'scarces.airdropFromCollection',
      this._relayOpts()
    );
  }

  /** Pause minting on a collection. */
  async pause(collectionId: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.PAUSE_COLLECTION,
      {
        collectionId,
      },
      'scarces.pauseCollection',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Resume minting on a collection. */
  async resume(collectionId: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.RESUME_COLLECTION,
      {
        collectionId,
      },
      'scarces.resumeCollection',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Delete a collection (must be empty). */
  async delete(collectionId: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.DELETE_COLLECTION,
      {
        collectionId,
      },
      'scarces.deleteCollection',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Update the per-token price of a collection (creator only). */
  async updatePrice(
    collectionId: string,
    newPriceNear: string
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.UPDATE_COLLECTION_PRICE,
      {
        collectionId,
        newPriceNear,
      },
      'scarces.updateCollectionPrice',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Update collection start/end timestamps (ns). */
  async updateTiming(
    collectionId: string,
    opts: { startTime?: number; endTime?: number }
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.UPDATE_COLLECTION_TIMING,
      {
        collectionId,
        startTime: opts.startTime,
        endTime: opts.endTime,
      },
      'scarces.updateCollectionTiming',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Replace the collection allowlist with `entries`. */
  async setAllowlist(
    collectionId: string,
    entries: AllowlistEntry[]
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.SET_ALLOWLIST,
      {
        collectionId,
        entries,
      },
      'scarces.setAllowlist',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Remove specific accounts from the collection allowlist. */
  async removeFromAllowlist(
    collectionId: string,
    accounts: string[]
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.REMOVE_FROM_ALLOWLIST,
      {
        collectionId,
        accounts,
      },
      'scarces.removeFromAllowlist',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Set or clear the collection's freeform metadata blob. */
  async setMetadata(
    collectionId: string,
    metadata: string | null
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.SET_COLLECTION_METADATA,
      {
        collectionId,
        metadata,
      },
      'scarces.setCollectionMetadata',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Set or clear the per-app metadata for a collection (app owner). */
  async setAppMetadata(
    appId: string,
    collectionId: string,
    metadata: string | null
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.SET_COLLECTION_APP_METADATA,
      { appId, collectionId, metadata },
      'scarces.setCollectionAppMetadata',
      this._relayOpts({ confirmation: true })
    );
  }

  /** Cancel a collection and offer per-token refunds until `refundDeadlineNs`. */
  async cancel(
    collectionId: string,
    refundPerTokenNear: string,
    refundDeadlineNs?: number
  ): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.CANCEL_COLLECTION,
      {
        collectionId,
        refundPerTokenNear,
        refundDeadlineNs,
      },
      'scarces.cancelCollection',
      this._relayOpts()
    );
  }

  /** After the refund window, reclaim unclaimed refund balances (creator). */
  async withdrawUnclaimedRefunds(collectionId: string): Promise<RelayResponse> {
    return composeAndSign(
      this._http,
      this._getSession(),
      SCARCES_VERBS.WITHDRAW_UNCLAIMED_REFUNDS,
      { collectionId },
      'scarces.withdrawUnclaimedRefunds',
      this._relayOpts({ confirmation: true })
    );
  }
}
