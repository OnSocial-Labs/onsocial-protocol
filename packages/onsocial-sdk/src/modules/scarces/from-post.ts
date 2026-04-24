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
      ...(opts.transferable != null ? { transferable: opts.transferable } : {}),
      ...(opts.burnable != null ? { burnable: opts.burnable } : {}),
      ...(opts.expiresAt ? { expiresAt: opts.expiresAt } : {}),
    };
    return this._lazy.create(lazyOpts);
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
    return {
      title,
      description: opts.description ?? text,
      ...(opts.copies != null ? { copies: opts.copies } : {}),
      ...(opts.royalty ? { royalty: opts.royalty } : {}),
      ...(opts.appId ? { appId: opts.appId } : {}),
      ...(opts.receiverId ? { receiverId: opts.receiverId } : {}),
      ...(opts.image ? { image: opts.image } : {}),
      ...(opts.mediaCid ?? extracted.mediaCid
        ? { mediaCid: opts.mediaCid ?? extracted.mediaCid }
        : {}),
      extra: {
        sourcePost: {
          author,
          postId,
          path: `${author}/post/${postId}`,
        },
        mintedAt: Date.now(),
        ...(opts.extra ?? {}),
      },
    };
  }
}
