import {
  type OnSocial,
  type PostRow,
} from '@onsocial/sdk';
import type { ComposerDropDraft } from '@/features/guilds/guild-composer-sheet';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  guildSpaceFeedChannel,
  type GuildSpace,
} from '@/features/guilds/guild-structure';
import { postMetaFromText } from '@/features/home/post-mentions';
import {
  collectionEmbedFromDraft,
  dropPostKind,
  dropSnapshotExtra,
  resolvedDropPostText,
} from '@/features/scarces/drop-post-payload';
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

export interface GuildDropPostSubmitResult {
  confirmed: boolean;
  optimisticPost: PostRow | null;
  groupId: string;
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
  trackTransaction: TrackTransaction;
}): Promise<GuildDropPostSubmitResult> {
  const { client, accountId, groupId, space, drop, trackTransaction } = args;
  const bodyText = resolvedDropPostText(args.text, drop);
  const collectionEmbed = collectionEmbedFromDraft(drop);
  const dropKind = dropPostKind(drop);
  const newPostId = Date.now().toString();
  const tags = postMetaFromText(bodyText);
  const channel = guildSpaceFeedChannel(space);

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
      embeds: [collectionEmbed],
      x: dropSnapshotExtra(drop),
      kind: dropKind ?? space.kind,
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

  const optimisticPost: PostRow = {
    accountId,
    postId: newPostId,
    value: JSON.stringify({
      v: 1,
      text: bodyText,
      ...tags,
      embeds: [collectionEmbed],
      x: dropSnapshotExtra(drop),
    }),
    blockHeight: 0,
    blockTimestamp: Date.now(),
    groupId,
    isGroupContent: true,
    channel,
    kind: dropKind ?? space.kind,
  };

  return { confirmed: true, optimisticPost, groupId };
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
