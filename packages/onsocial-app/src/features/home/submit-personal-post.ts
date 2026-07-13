import {
  postContentPath,
  type OnSocial,
  type PostRow,
} from '@onsocial/sdk';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { inheritedGuildReplyFeedMeta } from '@/features/guilds/guild-post-feed-meta';
import type {
  ComposerMode,
  ComposerSubmit,
} from '@/features/guilds/guild-composer-sheet';
import { assertCanReplyToGuildPost } from '@/features/home/assert-can-reply-to-guild-post';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';

export interface PersonalPostSubmitResult {
  confirmed: boolean;
  optimisticPost: PostRow | null;
}

type TrackTransaction = (input: {
  txHashes: string[];
  submittedMessage: string;
  successMessage: string;
  failureMessage: string;
}) => Promise<boolean>;

function toastCopy(mode: ComposerMode) {
  if (mode === 'quote') {
    return {
      submittedMessage: txToastConfirming.quoting,
      successMessage: txToastSuccess.quotePublished,
      failureMessage: txToastError.quoteFailed,
    };
  }
  if (mode === 'reply') {
    return {
      submittedMessage: txToastConfirming.posting,
      successMessage: txToastSuccess.replyPublished,
      failureMessage: txToastError.replyFailed,
    };
  }
  return {
    submittedMessage: txToastConfirming.posting,
    successMessage: txToastSuccess.postPublished,
    failureMessage: txToastError.postFailed,
  };
}

function buildOptimisticPost(args: {
  accountId: string;
  newPostId: string;
  text: string;
  mode: ComposerMode;
  target: PostRow | null;
  pollEmbed: {
    kind: 'poll';
    question: string;
    options: string[];
    closesAt?: number;
  } | null;
}): PostRow {
  const { accountId, newPostId, text, mode, target, pollEmbed } = args;
  const base: PostRow = {
    accountId,
    postId: newPostId,
    value: JSON.stringify({
      v: 1,
      text,
      ...(pollEmbed ? { embeds: [pollEmbed] } : {}),
    }),
    blockHeight: 0,
    blockTimestamp: Date.now(),
  };

  if (mode === 'post' || !target) {
    return {
      ...base,
      isGroupContent: false,
      ...(pollEmbed ? { kind: 'poll' } : {}),
    };
  }

  const feedMeta = target.groupId
    ? inheritedGuildReplyFeedMeta(target)
    : {
        ...(target.channel ? { channel: target.channel } : {}),
        ...(target.kind ? { kind: target.kind } : {}),
      };

  if (mode === 'quote') {
    return {
      ...base,
      ...(target.groupId
        ? { groupId: target.groupId, isGroupContent: true }
        : { isGroupContent: false }),
      refAuthor: target.accountId,
      refPath: postContentPath(target),
      refType: 'post',
      ...feedMeta,
    };
  }

  return {
    ...base,
    ...(target.groupId
      ? { groupId: target.groupId, isGroupContent: true }
      : { isGroupContent: false }),
    parentAuthor: target.accountId,
    parentPath: postContentPath(target),
    parentType: 'post',
    ...feedMeta,
  };
}

/**
 * Create / reply / quote outside the guild composer panels.
 * Replies and quotes to group posts stay on the group write path.
 */
export async function submitPersonalPost(args: {
  client: OnSocial;
  accountId: string;
  mode: ComposerMode;
  target: PostRow | null;
  payload: ComposerSubmit;
  trackTransaction: TrackTransaction;
}): Promise<PersonalPostSubmitResult> {
  const { client, accountId, mode, target, payload, trackTransaction } = args;
  const text = payload.text.trim();
  if (!text) {
    return { confirmed: false, optimisticPost: null };
  }
  if (mode !== 'post' && !target) {
    return { confirmed: false, optimisticPost: null };
  }

  const pollEmbed =
    mode === 'post' && payload.poll
      ? {
          kind: 'poll' as const,
          question: text,
          options: payload.poll.options,
          ...(payload.poll.durationMs != null
            ? { closesAt: Date.now() + payload.poll.durationMs }
            : {}),
        }
      : null;

  const newPostId = Date.now().toString();
  let response: unknown;

  if (mode === 'post') {
    response = await client.posts.create(
      {
        text,
        timestamp: Date.now(),
        ...(pollEmbed ? { embeds: [pollEmbed] } : {}),
      },
      newPostId
    );
  } else if (target!.groupId) {
    await assertCanReplyToGuildPost(client, accountId, target!);
    const groupId = target!.groupId;
    const ref = {
      author: target!.accountId,
      groupId,
      postId: target!.postId,
    };
    const feedMeta = inheritedGuildReplyFeedMeta(target!);
    const postData = {
      text,
      access: 'group' as const,
      groupId,
      timestamp: Date.now(),
      ...feedMeta,
    };
    response =
      mode === 'quote'
        ? await client.groups.quotePost(groupId, ref, postData, newPostId)
        : await client.groups.replyToPost(groupId, ref, postData, newPostId);
  } else {
    const ref = {
      author: target!.accountId,
      postId: target!.postId,
    };
    const postData = {
      text,
      timestamp: Date.now(),
      ...(target!.channel ? { channel: target!.channel } : {}),
      ...(target!.kind ? { kind: target!.kind } : {}),
    };
    response =
      mode === 'quote'
        ? await client.posts.quote(ref, postData, newPostId)
        : await client.posts.reply(ref, postData, newPostId);
  }

  const confirmed = await trackTransaction({
    txHashes: collectRelayTxHashes(response),
    ...toastCopy(mode),
  });

  if (!confirmed) {
    return { confirmed: false, optimisticPost: null };
  }

  return {
    confirmed: true,
    optimisticPost: buildOptimisticPost({
      accountId,
      newPostId,
      text,
      mode,
      target,
      pollEmbed,
    }),
  };
}
