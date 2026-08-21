import {
  postContentPath,
  type OnSocial,
  type PostRow,
} from '@onsocial/sdk';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { inheritedGuildReplyFeedMeta } from '@/features/guilds/guild-post-feed-meta';
import type {
  ComposerDropDraft,
  ComposerMode,
  ComposerSubmit,
} from '@/features/guilds/guild-composer-sheet';
import { assertCanReplyToGuildPost } from '@/features/home/assert-can-reply-to-guild-post';
import { postMetaFromText } from '@/features/home/post-mentions';
import {
  commerceEmbedFromDraft,
  dropPostKind,
  dropSnapshotExtra,
  resolvedDropPostText,
} from '@/features/scarces/drop-post-payload';
import { isDropComposeDraftReady } from '@/features/scarces/drop-compose-draft';
import {
  applyMediaKindOverride,
  buildOptimisticMediaEntries,
  mediaKindFromFile,
} from '@/lib/post-media';
import {
  normalizeComposerContentLabels,
  type PostContentLabels,
} from '@/lib/post-content-labels';
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
  drop: ComposerDropDraft | null;
  files?: File[];
  contentLabels?: PostContentLabels;
}): PostRow {
  const {
    accountId,
    newPostId,
    text,
    mode,
    target,
    pollEmbed,
    drop,
    files,
    contentLabels,
  } = args;
  const media = files?.length ? buildOptimisticMediaEntries(files) : undefined;
  const commerceEmbed = drop ? commerceEmbedFromDraft(drop) : null;
  const dropKind = dropPostKind(drop);
  const mediaKind =
    !pollEmbed && !drop && files?.length
      ? mediaKindFromFile(files[0]!)
      : undefined;
  const base: PostRow = {
    accountId,
    postId: newPostId,
    value: JSON.stringify({
      v: 1,
      text,
      ...postMetaFromText(text),
      ...(pollEmbed
        ? { embeds: [pollEmbed] }
        : commerceEmbed
          ? { embeds: [commerceEmbed] }
          : {}),
      ...(drop ? { x: dropSnapshotExtra(drop) } : {}),
      ...(media ? { media } : {}),
      ...contentLabels,
    }),
    blockHeight: 0,
    blockTimestamp: Date.now(),
  };

  if (mode === 'post' || !target) {
    return {
      ...base,
      isGroupContent: false,
      ...(pollEmbed
        ? { kind: 'poll' }
        : dropKind
          ? { kind: dropKind }
          : mediaKind
            ? { kind: mediaKind }
            : {}),
    };
  }

  const feedMeta = applyMediaKindOverride(
    target.groupId
      ? inheritedGuildReplyFeedMeta(target)
      : {
          ...(target.channel ? { channel: target.channel } : {}),
          ...(target.kind ? { kind: target.kind } : {}),
        },
    files ?? []
  );

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
  const files = payload.files ?? [];
  const drop =
    mode === 'post' && payload.drop?.collectionId?.trim()
      ? payload.drop
      : null;
  if (!text && !files.length && !drop) {
    return { confirmed: false, optimisticPost: null };
  }
  if (mode !== 'post' && !target) {
    return { confirmed: false, optimisticPost: null };
  }

  const pollEmbed =
    mode === 'post' && payload.poll && !drop
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
  const bodyText = resolvedDropPostText(text, drop);
  const contentLabels = normalizeComposerContentLabels(payload);

  const newPostId = Date.now().toString();
  const filePayload = files.length ? { files } : {};
  const tags = postMetaFromText(bodyText);
  let response: unknown;

  if (mode === 'post') {
    response = await client.posts.create(
      {
        text: bodyText,
        timestamp: Date.now(),
        ...tags,
        ...(pollEmbed
          ? { embeds: [pollEmbed] }
          : commerceEmbed
            ? { embeds: [commerceEmbed] }
            : {}),
        ...(drop ? { x: dropSnapshotExtra(drop) } : {}),
        ...(dropKind ? { kind: dropKind } : {}),
        ...contentLabels,
        ...filePayload,
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
    const feedMeta = applyMediaKindOverride(
      inheritedGuildReplyFeedMeta(target!),
      files
    );
    const postData = {
      text,
      access: 'group' as const,
      groupId,
      timestamp: Date.now(),
      ...tags,
      ...feedMeta,
      ...contentLabels,
      ...filePayload,
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
    const feedMeta = applyMediaKindOverride(
      {
        ...(target!.channel ? { channel: target!.channel } : {}),
        ...(target!.kind ? { kind: target!.kind } : {}),
      },
      files
    );
    const postData = {
      text,
      timestamp: Date.now(),
      ...tags,
      ...feedMeta,
      ...contentLabels,
      ...filePayload,
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
      text: bodyText,
      mode,
      target,
      pollEmbed,
      drop,
      files: files.length ? files : undefined,
      contentLabels,
    }),
  };
}

/** One-tap repost — empty-text `refType: 'repost'` write. */
export async function submitPersonalRepost(params: {
  client: OnSocial;
  accountId: string;
  target: PostRow;
  trackTransaction: TrackTransaction;
}): Promise<PersonalPostSubmitResult> {
  const { client, accountId, target, trackTransaction } = params;
  const newPostId = Date.now().toString();
  const postData = {
    text: '',
    timestamp: Date.now(),
  };

  let response;
  if (target.groupId) {
    await assertCanReplyToGuildPost(client, accountId, target);
    const groupId = target.groupId;
    response = await client.groups.repostPost(
      groupId,
      {
        author: target.accountId,
        groupId,
        postId: target.postId,
      },
      postData,
      newPostId
    );
  } else {
    response = await client.posts.repost(
      {
        author: target.accountId,
        postId: target.postId,
      },
      postData,
      newPostId
    );
  }

  const confirmed = await trackTransaction({
    txHashes: collectRelayTxHashes(response),
    submittedMessage: txToastConfirming.reposting,
    successMessage: txToastSuccess.repostPublished,
    failureMessage: txToastError.repostFailed,
  });

  if (!confirmed) {
    return { confirmed: false, optimisticPost: null };
  }

  const optimisticPost: PostRow = {
    accountId,
    postId: newPostId,
    value: JSON.stringify({
      v: 1,
      text: '',
      ref: postContentPath(target),
      refType: 'repost',
      timestamp: postData.timestamp,
    }),
    blockHeight: 0,
    blockTimestamp: postData.timestamp,
    refPath: postContentPath(target),
    refAuthor: target.accountId,
    refType: 'repost',
    isGroupContent: Boolean(target.groupId),
    ...(target.groupId
      ? { groupId: target.groupId }
      : {}),
    ...(target.channel ? { channel: target.channel } : {}),
    ...(target.kind ? { kind: target.kind } : {}),
  };

  return { confirmed: true, optimisticPost };
}
