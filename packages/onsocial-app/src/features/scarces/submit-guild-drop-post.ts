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
import { postMetaFromText } from '@/features/home/post-mentions';
import { placesMetaFromComposer } from '@/lib/post-place';
import {
  guildAttachWriteFields,
  resolveComposerAttach,
} from '@/features/guilds/composer-post-attach';
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

type TrackTransaction = (input: {
  txHashes: string[];
  submittedMessage: string;
  successMessage: string;
  failureMessage: string;
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
}): Promise<GuildRootPostSubmitResult> {
  const { client, accountId, groupId, space, payload, trackTransaction } =
    args;
  const text = payload.text.trim();
  const files = payload.files ?? [];
  const attach = resolveComposerAttach({
    text,
    poll: payload.poll,
    drop: payload.drop,
    proposal: payload.proposal,
  });
  if (!text && !files.length && !attach.hasAttach) {
    return { confirmed: false, optimisticPost: null, groupId };
  }

  const bodyText = attach.bodyText;
  const contentLabels = normalizeComposerContentLabels(payload);
  const newPostId = Date.now().toString();
  const tags = {
    ...postMetaFromText(bodyText),
    ...placesMetaFromComposer(payload.places),
  };
  const channel = guildSpaceFeedChannel(space);
  const mediaKind =
    !attach.hasAttach && files.length
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
      ...guildAttachWriteFields(attach, mediaKind ?? space.kind),
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
      ...attach.valueFields,
      ...(media ? { media } : {}),
      ...contentLabels,
    }),
    blockHeight: 0,
    blockTimestamp: Date.now(),
    groupId,
    isGroupContent: true,
    channel,
    kind: attach.kind ?? mediaKind ?? space.kind,
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
