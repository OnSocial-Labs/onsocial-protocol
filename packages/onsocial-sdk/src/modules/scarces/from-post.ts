// ---------------------------------------------------------------------------
// FromPost — convenience flows that turn an existing post into either
// a minted scarce or a lazy listing. Reuses the post's first IPFS media
// CID with no re-upload, and links the source post via `extra.sourcePost`.
// ---------------------------------------------------------------------------

import type {
  LazyListingOptions,
  MintOptions,
  MintResponse,
} from '../../types.js';
import {
  extractPostMedia,
  isPostRow,
  postCoords,
  type ExtractedPost,
  type MintFromPostOptions,
  type PostSource,
} from '../../builders/scarces/from-post.js';
import type { SocialModule } from '../../social.js';
import type { ScarcesTokensApi } from './tokens.js';
import type { ScarcesLazyApi } from './lazy.js';

export class ScarcesFromPostApi {
  constructor(
    private _tokens: ScarcesTokensApi,
    private _lazy: ScarcesLazyApi,
    private _social?: SocialModule
  ) {}

  /**
   * Mint a post as a 1-of-N collectible scarce. Reuses the post's first
   * IPFS media CID by default — no re-upload — and links the new scarce
   * back to its source post via `extra.sourcePost`.
   *
   * ```ts
   * await os.scarces.fromPost.mint(row, { copies: 10 });
   * ```
   */
  async mint(
    post: PostSource,
    opts: MintFromPostOptions = {}
  ): Promise<MintResponse> {
    const { author, postId } = postCoords(post);
    const extracted = await this._readPost(post);
    const mintOpts = this._buildMintOpts(author, postId, extracted, opts);
    return this._tokens.mint(mintOpts);
  }

  /**
   * Create a lazy listing for a post (mint-on-purchase at a fixed price).
   * Same media reuse + source-post linking as `mint`.
   *
   * ```ts
   * await os.scarces.fromPost.list(row, '5', { royalty: { 'alice.near': 1000 } });
   * ```
   */
  async list(
    post: PostSource,
    priceNear: string,
    opts: MintFromPostOptions & {
      transferable?: boolean;
      burnable?: boolean;
      expiresAt?: string;
    } = {}
  ): Promise<MintResponse> {
    const { author, postId } = postCoords(post);
    const extracted = await this._readPost(post);
    const base = this._buildMintOpts(author, postId, extracted, opts);
    const lazyOpts: LazyListingOptions = {
      title: base.title,
      priceNear,
      ...(base.description ? { description: base.description } : {}),
      ...(base.mediaCid ? { mediaCid: base.mediaCid } : {}),
      ...(base.image ? { image: base.image } : {}),
      ...(base.royalty ? { royalty: base.royalty } : {}),
      ...(base.appId ? { appId: base.appId } : {}),
      ...(base.extra ? { extra: base.extra } : {}),
      ...(base.cardBg ? { cardBg: base.cardBg } : {}),
      ...(base.cardFont ? { cardFont: base.cardFont } : {}),
      ...(base.cardMarkColor ? { cardMarkColor: base.cardMarkColor } : {}),
      ...(base.cardMarkShape ? { cardMarkShape: base.cardMarkShape } : {}),
      ...(base.cardTitleAlign ? { cardTitleAlign: base.cardTitleAlign } : {}),
      ...(base.cardPhotoCid ? { cardPhotoCid: base.cardPhotoCid } : {}),
      ...(opts.transferable != null ? { transferable: opts.transferable } : {}),
      ...(opts.burnable != null ? { burnable: opts.burnable } : {}),
      ...(opts.expiresAt ? { expiresAt: opts.expiresAt } : {}),
    };
    return this._lazy.create(lazyOpts);
  }

  /**
   * Mint a post as a **receipt** — a permanent proof-card with a short
   * claim and a photo as evidence. The killer mint-from-post format:
   * "Shipped." + screenshot, "Sold out in 4 hours." + dashboard, etc.
   *
   * Hard rules (enforced here, before any network call):
   * - title (or post text if no `opts.title`) must be ≤ 60 chars
   * - a photo is required — either from `opts.cardPhotoCid` or the
   *   post's first image
   *
   * Pass `palette` to pick the finish
   * (`'light'` default, or `'night' | 'noir' | 'dusk'`).
   *
   * ```ts
   * await os.scarces.fromPost.mintReceipt(row, { copies: 1 });
   * await os.scarces.fromPost.mintReceipt(row, { palette: 'noir' });
   * ```
   */
  async mintReceipt(
    post: PostSource,
    opts: Omit<MintFromPostOptions, 'cardBg'> & {
      palette?: 'light' | 'night' | 'noir' | 'dusk';
    } = {}
  ): Promise<MintResponse> {
    const extracted = await this._readPost(post);
    const title = opts.title ?? extracted.text;
    if (title.length > 60) {
      throw new Error(
        `Receipt cards are for short claims (≤60 chars, got ${title.length}). For longer thoughts use os.scarces.fromPost.mint() with a different mood.`
      );
    }
    const photoCid = opts.cardPhotoCid ?? extracted.mediaCid;
    if (!photoCid) {
      throw new Error(
        'Receipt cards require a photo (proof). Pass opts.cardPhotoCid or mint from a post with media.'
      );
    }
    const palette = opts.palette ?? 'light';
    const cardBg = `receipt-${palette}`;
    // Strip our local-only `palette` knob before forwarding.
    const { palette: _palette, ...rest } = opts;
    return this.mint(post, {
      ...rest,
      title,
      cardBg,
      cardPhotoCid: photoCid,
    });
  }

  private async _readPost(post: PostSource): Promise<ExtractedPost> {
    if (isPostRow(post)) {
      return extractPostMedia(post.value);
    }
    if (!this._social) {
      throw new Error(
        'scarces.fromPost: PostRef requires a SocialModule. Pass a PostRow instead, or construct via the OnSocial client (which wires this automatically).'
      );
    }
    const entry = await this._social.getOne(`post/${post.postId}`, post.author);
    return extractPostMedia(
      (entry?.value as string | Record<string, unknown> | undefined) ?? null
    );
  }

  private _buildMintOpts(
    author: string,
    postId: string,
    extracted: ExtractedPost,
    opts: MintFromPostOptions
  ): MintOptions {
    const text = extracted.text;
    const title =
      opts.title ??
      ((text.length > 100 ? text.slice(0, 97) + '...' : text) ||
        `Post ${postId}`);

    // ── Media routing ──────────────────────────────────────────────
    // - Default: post photo becomes the cover (or no media → gateway
    //   renders a text-only auto-card).
    // - Receipt mood (cardBg starts with `receipt-`): the receipt SVG
    //   is the cover and the photo is embedded inside it as proof; we
    //   must not also pass `mediaCid` or the post photo would override
    //   the rendered card.
    const isReceiptMood = (opts.cardBg ?? '').startsWith('receipt-');
    const explicitMediaCid = opts.mediaCid ?? extracted.mediaCid;
    const resolvedMediaCid = isReceiptMood ? undefined : explicitMediaCid;
    const resolvedPhotoCid = isReceiptMood
      ? (opts.cardPhotoCid ?? extracted.mediaCid)
      : opts.cardPhotoCid;

    // ── Gallery ───────────────────────────────────────────────────────────
    // For multi-photo posts, persist the full list under `extra.gallery`
    // so marketplaces / future viewers can show the rest. The cover
    // (first CID) stays in `media` per NEP-177.
    const galleryExtra =
      extracted.mediaCids.length > 1
        ? { gallery: extracted.mediaCids }
        : undefined;

    return {
      title,
      description: opts.description ?? text,
      ...(opts.copies != null ? { copies: opts.copies } : {}),
      ...(opts.royalty ? { royalty: opts.royalty } : {}),
      ...(opts.appId ? { appId: opts.appId } : {}),
      ...(opts.receiverId ? { receiverId: opts.receiverId } : {}),
      ...(opts.image ? { image: opts.image } : {}),
      ...(resolvedMediaCid ? { mediaCid: resolvedMediaCid } : {}),
      ...(opts.cardBg ? { cardBg: opts.cardBg } : {}),
      ...(opts.cardFont ? { cardFont: opts.cardFont } : {}),
      ...(opts.cardMarkColor ? { cardMarkColor: opts.cardMarkColor } : {}),
      ...(opts.cardMarkShape ? { cardMarkShape: opts.cardMarkShape } : {}),
      ...(opts.cardTitleAlign ? { cardTitleAlign: opts.cardTitleAlign } : {}),
      ...(resolvedPhotoCid ? { cardPhotoCid: resolvedPhotoCid } : {}),
      extra: {
        sourcePost: {
          author,
          postId,
          path: `${author}/post/${postId}`,
        },
        mintedAt: Date.now(),
        ...(galleryExtra ?? {}),
        ...(opts.extra ?? {}),
      },
    };
  }
}
