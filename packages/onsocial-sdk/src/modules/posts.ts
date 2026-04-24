// ---------------------------------------------------------------------------
// OnSocial SDK — posts module
//
// The single, blessed entry point for creating posts. Wraps the lower-level
// builders in `social.ts` so app devs have one obvious name to reach for:
//
//   os.posts.create({ text, files?, channel?, audiences?, kind? })
//   os.posts.reply(parent, reply)
//   os.posts.quote(ref, quote)
//   os.posts.groupPost(groupId, post)
//
// Schema-free fields (including `x.<namespace>.*` and arbitrary top-level
// keys) pass through verbatim — the only things normalised are `channel`,
// `kind`, and `audiences` (the substreams-indexed feed columns).
// ---------------------------------------------------------------------------

import type { SocialModule } from '../social.js';
import type { GroupsModule } from './groups.js';
import type {
  GroupPostRef,
  PostData,
  PostRef,
  RelayResponse,
} from '../types.js';

export class PostsModule {
  constructor(
    private _social: SocialModule,
    private _groups: GroupsModule
  ) {}

  /**
   * Create a post.
   *
   * Auto-uploads anything passed in `files: File[]` or `image: File` via the
   * client's configured StorageProvider, then writes the post via the gateway
   * relayer. Feed metadata (`channel`, `kind`, `audiences`) is normalised.
   *
   * ```ts
   * await os.posts.create({ text: 'gm' });
   * await os.posts.create({
   *   text: 'new track',
   *   files: [audioFile, coverFile],
   *   channel: 'music',
   *   audiences: ['public'],
   * });
   * ```
   */
  create(post: PostData, postId?: string): Promise<RelayResponse> {
    return this._social.post(post, postId);
  }

  /** Reply to another post. */
  reply(
    parent: PostRef,
    reply: PostData,
    replyId?: string
  ): Promise<RelayResponse> {
    return this._social.replyToPost(parent, reply, replyId);
  }

  /** Quote another post. */
  quote(
    ref: PostRef,
    quote: PostData,
    quoteId?: string
  ): Promise<RelayResponse> {
    return this._social.quotePost(ref, quote, quoteId);
  }

  /** Post into a group. */
  groupPost(
    groupId: string,
    post: PostData,
    postId?: string
  ): Promise<RelayResponse> {
    return this._groups.post(groupId, post, postId);
  }

  /** Reply inside a group. */
  groupReply(
    groupId: string,
    parent: GroupPostRef,
    reply: PostData,
    replyId?: string
  ): Promise<RelayResponse> {
    return this._groups.replyToPost(groupId, parent, reply, replyId);
  }

  /** Quote inside a group. */
  groupQuote(
    groupId: string,
    ref: GroupPostRef,
    quote: PostData,
    quoteId?: string
  ): Promise<RelayResponse> {
    return this._groups.quotePost(groupId, ref, quote, quoteId);
  }
}
