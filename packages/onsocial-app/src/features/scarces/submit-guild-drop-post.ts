import { type OnSocial, type PostRow } from '@onsocial/sdk';
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
import { submitPersonalPost } from '@/features/home/submit-personal-post';

type TrackTransaction = (input: {
  txHashes: string[];
  submittedMessage: string;
  successMessage: string;
  failureMessage: string;
  silent?: boolean;
  toastKind?: 'success' | 'error';
}) => Promise<boolean>;

export interface GuildRootPostSubmitResult {
  confirmed: boolean;
  optimisticPost: PostRow | null;
  groupId: string;
}

/** @deprecated Prefer GuildRootPostSubmitResult */
export type GuildDropPostSubmitResult = GuildRootPostSubmitResult;

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
    const [root, ...rest] = threadBeats;
    const first = await submitGuildRootPost({
      client,
      accountId,
      groupId,
      space,
      payload: root!,
      trackTransaction,
      silent: true,
    });
    if (!first.confirmed || !first.optimisticPost) {
      await trackTransaction({
        txHashes: [],
        submittedMessage: txToastConfirming.postingToGuild,
        successMessage: txToastError.guildPostFailed,
        failureMessage: txToastError.guildPostFailed,
        toastKind: 'error',
      });
      return first;
    }
    let parent = first.optimisticPost;
    let posted = 1;
    const total = threadBeats.length;
    for (const beat of rest) {
      let next;
      try {
        next = await submitPersonalPost({
          client,
          accountId,
          mode: 'reply',
          target: parent,
          payload: beat,
          trackTransaction,
          silent: true,
        });
      } catch {
        next = { confirmed: false, optimisticPost: null };
      }
      if (!next.confirmed || !next.optimisticPost) {
        await trackTransaction({
          txHashes: [],
          submittedMessage: txToastConfirming.postingToGuild,
          successMessage: txToastError.threadPartial(posted, total),
          failureMessage: txToastError.threadPartial(posted, total),
          toastKind: 'error',
        });
        return { ...first, confirmed: true };
      }
      parent = next.optimisticPost;
      posted += 1;
    }
    await trackTransaction({
      txHashes: [],
      submittedMessage: txToastConfirming.postingToGuild,
      successMessage: txToastSuccess.threadPublished,
      failureMessage: txToastError.guildPostFailed,
    });
    return first;
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

  const confirmed = await trackTransaction({
    txHashes: collectRelayTxHashes(response),
    submittedMessage: txToastConfirming.postingToGuild,
    successMessage: txToastSuccess.guildPostPublished,
    failureMessage: txToastError.guildPostFailed,
    ...(args.silent ? { silent: true } : {}),
  });

  if (!confirmed) {
    return { confirmed: false, optimisticPost: null, groupId };
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

  return { confirmed: true, optimisticPost, groupId };
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
