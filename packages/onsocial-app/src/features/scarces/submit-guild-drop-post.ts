import { postContentPath, type OnSocial, type PostRow } from '@onsocial/sdk';
import type {
  ComposerDropDraft,
  ComposerSubmit,
} from '@/features/guilds/guild-composer-sheet';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  guildSpaceFeedChannel,
  type GuildSpace,
} from '@/features/guilds/guild-structure';
import {
  articleSnapshotExtra,
  resolveComposerArticle,
} from '@/lib/article-post-payload';
import { postMetaFromText } from '@/features/home/post-mentions';
import { placesMetaFromComposer } from '@/lib/post-place';
import {
  commerceEmbedFromDraft,
  dropPostKind,
  dropSnapshotExtra,
  resolvedDropPostText,
} from '@/features/scarces/drop-post-payload';
import { isDropComposeDraftReady } from '@/features/scarces/drop-compose-draft';
import {
  buildOptimisticMediaEntries,
  mediaKindFromFile,
} from '@/lib/post-media';
import { normalizeComposerContentLabels } from '@/lib/post-content-labels';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { splitComposerThread } from '@/lib/composer-thread';
import {
  allocateThreadPostIds,
  buildGuildThreadSetEntries,
  planComposerThreadChunks,
  threadSetEntriesFitEventBudget,
  type ComposerBeatWriteModel,
} from '@/lib/composer-thread-batch';
import { submitPersonalPost } from '@/features/home/submit-personal-post';
import { postThreadPath } from '@/lib/post-routes';

type TrackTransaction = (input: {
  txHashes: string[];
  submittedMessage: string;
  successMessage: string;
  failureMessage: string;
  actionHref?: string | null;
  actionLabel?: string | null;
  silent?: boolean;
  toastKind?: 'success' | 'error';
  explorerHash?: string | null;
}) => Promise<boolean>;

export interface GuildRootPostSubmitResult {
  confirmed: boolean;
  optimisticPost: PostRow | null;
  /** Root plus landed self-replies, oldest first. Partial flushes include what posted. */
  optimisticPosts?: PostRow[];
  groupId: string;
  postedCount?: number;
  totalCount?: number;
  txHashes?: string[];
}

/** @deprecated Prefer GuildRootPostSubmitResult */
export type GuildDropPostSubmitResult = GuildRootPostSubmitResult;

function optimisticGuildThreadPosts(args: {
  accountId: string;
  groupId: string;
  space: GuildSpace;
  ids: readonly string[];
  models: ComposerBeatWriteModel[];
  now: number;
  parent?: PostRow | null;
}): PostRow[] {
  const { accountId, groupId, space, ids, models, now, parent } = args;
  const channel = guildSpaceFeedChannel(space);
  const rows: PostRow[] = [];
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index]!;
    const dropKind = dropPostKind(model.drop);
    const commerceEmbed = model.drop
      ? commerceEmbedFromDraft(model.drop)
      : null;
    const articleExtra = model.article
      ? articleSnapshotExtra(model.article)
      : undefined;
    const row: PostRow = {
      accountId,
      postId: ids[index]!,
      value: JSON.stringify({
        v: 1,
        text: model.bodyText,
        ...postMetaFromText(model.bodyText),
        ...placesMetaFromComposer(model.places),
        ...(model.pollEmbed
          ? { embeds: [model.pollEmbed] }
          : commerceEmbed
            ? { embeds: [commerceEmbed] }
            : {}),
        ...(model.drop
          ? { x: dropSnapshotExtra(model.drop) }
          : articleExtra
            ? { x: articleExtra, contentType: 'md' }
            : {}),
        ...model.contentLabels,
      }),
      blockHeight: 0,
      blockTimestamp: now + index,
      groupId,
      isGroupContent: true,
      channel,
      kind: model.pollEmbed
        ? 'poll'
        : model.article
          ? 'longform'
          : (dropKind ?? space.kind),
    };
    const replyParent = index > 0 ? rows[index - 1]! : parent;
    if (replyParent) {
      row.parentAuthor = replyParent.accountId;
      row.parentPath = postContentPath(replyParent);
      row.parentType = 'post';
    }
    rows.push(row);
  }
  return rows;
}

async function submitGuildThreadBatch(args: {
  client: OnSocial;
  accountId: string;
  groupId: string;
  space: GuildSpace;
  beats: ComposerSubmit[];
  trackTransaction: TrackTransaction;
  parent?: PostRow | null;
  silent?: boolean;
}): Promise<GuildRootPostSubmitResult | null> {
  const { client, accountId, groupId, space, beats, trackTransaction, parent } =
    args;
  const now = Date.now();
  const ids = allocateThreadPostIds(beats.length, now);
  const { entries, models } = buildGuildThreadSetEntries({
    accountId,
    groupId,
    space,
    beats,
    ids,
    now,
    parentId: parent?.postId,
  });
  if (!threadSetEntriesFitEventBudget(entries)) return null;

  let response: unknown;
  try {
    response = await client.social.set(entries);
  } catch {
    if (!args.silent) {
      await trackTransaction({
        txHashes: [],
        submittedMessage: txToastConfirming.postingToGuild,
        successMessage: txToastError.guildPostFailed,
        failureMessage: txToastError.guildPostFailed,
        toastKind: 'error',
      });
    }
    return {
      confirmed: false,
      optimisticPost: null,
      groupId,
      postedCount: 0,
      totalCount: beats.length,
    };
  }

  const txHashes = collectRelayTxHashes(response);
  const landed = optimisticGuildThreadPosts({
    accountId,
    groupId,
    space,
    ids,
    models,
    now,
    parent,
  });
  const first = landed[0] ?? null;
  const confirmed = await trackTransaction({
    txHashes,
    submittedMessage: txToastConfirming.postingToGuild,
    successMessage: txToastSuccess.threadPublished,
    failureMessage: txToastError.guildPostFailed,
    ...(args.silent ? { silent: true } : {}),
    ...(!args.silent && first
      ? {
          actionHref: postThreadPath(first),
          actionLabel: txToastSuccess.viewThread,
        }
      : {}),
  });
  if (!confirmed) {
    return {
      confirmed: false,
      optimisticPost: null,
      groupId,
      postedCount: 0,
      totalCount: beats.length,
      txHashes,
    };
  }
  return {
    confirmed: true,
    optimisticPost: first,
    optimisticPosts: landed,
    groupId,
    postedCount: beats.length,
    totalCount: beats.length,
    txHashes,
  };
}

async function submitGuildThread(args: {
  client: OnSocial;
  accountId: string;
  groupId: string;
  space: GuildSpace;
  beats: ComposerSubmit[];
  trackTransaction: TrackTransaction;
}): Promise<GuildRootPostSubmitResult> {
  const { client, accountId, groupId, space, beats, trackTransaction } = args;
  const chunks = planComposerThreadChunks(beats);
  if (
    chunks.length === 1 &&
    chunks[0]!.beats.length === beats.length &&
    beats.length >= 2
  ) {
    const batched = await submitGuildThreadBatch({
      client,
      accountId,
      groupId,
      space,
      beats,
      trackTransaction,
    });
    if (batched) return batched;
  }

  const total = beats.length;
  let posted = 0;
  let parent: PostRow | null = null;
  let first: PostRow | null = null;
  const landed: PostRow[] = [];
  let lastHashes: string[] = [];

  const failPartial = async (): Promise<GuildRootPostSubmitResult> => {
    await trackTransaction({
      txHashes: [],
      explorerHash: lastHashes.at(-1) ?? null,
      submittedMessage: txToastConfirming.postingToGuild,
      successMessage:
        posted > 0
          ? txToastError.threadPartial(posted, total)
          : txToastError.guildPostFailed,
      failureMessage:
        posted > 0
          ? txToastError.threadPartial(posted, total)
          : txToastError.guildPostFailed,
      toastKind: 'error',
    });
    return {
      confirmed: false,
      optimisticPost: first,
      optimisticPosts: landed,
      groupId,
      postedCount: posted,
      totalCount: total,
      txHashes: lastHashes,
    };
  };

  for (const chunk of chunks) {
    if (chunk.beats.length >= 2) {
      const batched = await submitGuildThreadBatch({
        client,
        accountId,
        groupId,
        space,
        beats: chunk.beats,
        trackTransaction,
        parent,
        silent: true,
      });
      if (batched?.confirmed && batched.optimisticPosts?.length) {
        posted += batched.postedCount ?? batched.optimisticPosts.length;
        lastHashes = batched.txHashes?.length ? batched.txHashes : lastHashes;
        if (!first) first = batched.optimisticPost;
        landed.push(...batched.optimisticPosts);
        parent = landed[landed.length - 1] ?? parent;
        continue;
      }
      if (batched && !batched.confirmed) {
        return failPartial();
      }
    }
    for (const beat of chunk.beats) {
      let next: { confirmed: boolean; optimisticPost: PostRow | null; txHashes?: string[] };
      try {
        if (!parent) {
          next = await submitGuildRootPost({
            client,
            accountId,
            groupId,
            space,
            payload: beat,
            trackTransaction,
            silent: true,
          });
        } else {
          next = await submitPersonalPost({
            client,
            accountId,
            mode: 'reply',
            target: parent,
            payload: beat,
            trackTransaction,
            silent: true,
          });
        }
      } catch {
        next = { confirmed: false, optimisticPost: null };
      }
      if (!next.confirmed || !next.optimisticPost) {
        return failPartial();
      }
      posted += 1;
      lastHashes = next.txHashes?.length ? next.txHashes : lastHashes;
      if (!first) first = next.optimisticPost;
      landed.push(next.optimisticPost);
      parent = next.optimisticPost;
    }
  }

  await trackTransaction({
    txHashes: [],
    explorerHash: lastHashes.at(-1) ?? null,
    submittedMessage: txToastConfirming.postingToGuild,
    successMessage: txToastSuccess.threadPublished,
    failureMessage: txToastError.guildPostFailed,
    ...(first
      ? {
          actionHref: postThreadPath(first),
          actionLabel: txToastSuccess.viewThread,
        }
      : {}),
  });

  return {
    confirmed: true,
    optimisticPost: first,
    optimisticPosts: landed,
    groupId,
    postedCount: posted,
    totalCount: total,
    txHashes: lastHashes,
  };
}

/**
 * Root guild post from the shared composer (text / media / poll / Drop).
 */
export async function submitGuildRootPost(args: {
  client: OnSocial;
  accountId: string;
  groupId: string;
  space: GuildSpace;
  payload: ComposerSubmit;
  trackTransaction: TrackTransaction;
  silent?: boolean;
}): Promise<GuildRootPostSubmitResult> {
  const { client, accountId, groupId, space, payload, trackTransaction } =
    args;
  const threadBeats =
    !args.silent ? splitComposerThread(payload) : null;
  if (threadBeats && threadBeats.length > 1) {
    return submitGuildThread({
      client,
      accountId,
      groupId,
      space,
      beats: threadBeats,
      trackTransaction,
    });
  }
  const text = payload.text.trim();
  const files = payload.files ?? [];
  const drop = isDropComposeDraftReady(payload.drop) ? payload.drop! : null;
  const article = resolveComposerArticle(
    payload.article,
    Boolean(drop) || Boolean(payload.poll)
  );
  if (!text && !files.length && !drop && !article) {
    return { confirmed: false, optimisticPost: null, groupId };
  }

  const pollEmbed =
    payload.poll && !drop
      ? {
          kind: 'poll' as const,
          question: text,
          options: payload.poll.options,
          ...(payload.poll.durationMs != null
            ? { closesAt: Date.now() + payload.poll.durationMs }
            : {}),
        }
      : null;

  const commerceEmbed = drop ? commerceEmbedFromDraft(drop) : null;
  const dropKind = dropPostKind(drop);
  const articleExtra = article ? articleSnapshotExtra(article) : undefined;
  const bodyText = resolvedDropPostText(text, drop);
  const contentLabels = normalizeComposerContentLabels(payload);
  const newPostId = Date.now().toString();
  const tags = {
    ...postMetaFromText(bodyText),
    ...placesMetaFromComposer(payload.places),
  };
  const channel = guildSpaceFeedChannel(space);
  const mediaKind =
    !pollEmbed && !drop && files.length
      ? mediaKindFromFile(files[0]!)
      : undefined;
  const filePayload = files.length ? { files } : {};

  const response = await client.groups.post(
    groupId,
    {
      text: bodyText,
      access: 'group',
      groupId,
      channel,
      audiences: [space.audience],
      timestamp: Date.now(),
      ...tags,
      ...(pollEmbed
        ? { embeds: [pollEmbed] }
        : commerceEmbed
          ? {
              embeds: [commerceEmbed],
              x: dropSnapshotExtra(drop!),
              kind: dropKind ?? space.kind,
            }
          : articleExtra
            ? {
                x: articleExtra,
                contentType: 'md' as const,
                kind: 'longform',
              }
          : mediaKind
            ? { kind: mediaKind }
            : { kind: space.kind }),
      ...contentLabels,
      ...filePayload,
    },
    newPostId
  );

  const txHashes = collectRelayTxHashes(response);
  const confirmed = await trackTransaction({
    txHashes,
    submittedMessage: txToastConfirming.postingToGuild,
    successMessage: txToastSuccess.guildPostPublished,
    failureMessage: txToastError.guildPostFailed,
    ...(args.silent ? { silent: true } : {}),
  });

  if (!confirmed) {
    return { confirmed: false, optimisticPost: null, groupId, txHashes };
  }

  const media = files.length ? buildOptimisticMediaEntries(files) : undefined;
  const optimisticPost: PostRow = {
    accountId,
    postId: newPostId,
    value: JSON.stringify({
      v: 1,
      text: bodyText,
      ...tags,
      ...(pollEmbed
        ? { embeds: [pollEmbed] }
        : commerceEmbed
          ? { embeds: [commerceEmbed] }
          : {}),
      ...(drop
        ? { x: dropSnapshotExtra(drop) }
        : articleExtra
          ? { x: articleExtra, contentType: 'md' }
          : {}),
      ...(media ? { media } : {}),
      ...contentLabels,
    }),
    blockHeight: 0,
    blockTimestamp: Date.now(),
    groupId,
    isGroupContent: true,
    channel,
    kind: pollEmbed
      ? 'poll'
      : article
        ? 'longform'
        : (dropKind ?? mediaKind ?? space.kind),
  };

  return { confirmed: true, optimisticPost, groupId, txHashes };
}

/**
 * Root guild post that references a Drop via durable collection embed.
 * Same schema as personal “Post this Drop”.
 */
export async function submitGuildDropPost(args: {
  client: OnSocial;
  accountId: string;
  groupId: string;
  space: GuildSpace;
  text: string;
  drop: ComposerDropDraft;
  contentWarning?: string;
  nsfw?: boolean;
  trackTransaction: TrackTransaction;
}): Promise<GuildRootPostSubmitResult> {
  return submitGuildRootPost({
    client: args.client,
    accountId: args.accountId,
    groupId: args.groupId,
    space: args.space,
    payload: {
      text: args.text,
      drop: args.drop,
      contentWarning: args.contentWarning ?? '',
      nsfw: Boolean(args.nsfw),
    },
    trackTransaction: args.trackTransaction,
  });
}

const GUILD_POST_CONFIRMED = 'onsocial:guild-post-confirmed';

export function dispatchGuildPostConfirmed(input: {
  groupId: string;
  post: PostRow;
}): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(GUILD_POST_CONFIRMED, { detail: input })
  );
}

export function subscribeGuildPostConfirmed(
  listener: (input: { groupId: string; post: PostRow }) => void
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ groupId: string; post: PostRow }>)
      .detail;
    if (detail?.groupId && detail.post) listener(detail);
  };
  window.addEventListener(GUILD_POST_CONFIRMED, handler);
  return () => window.removeEventListener(GUILD_POST_CONFIRMED, handler);
}
