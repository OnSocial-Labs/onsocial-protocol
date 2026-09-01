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
import { placesMetaFromComposer } from '@/lib/post-place';
import {
  commerceEmbedFromDraft,
  dropPostKind,
  dropSnapshotExtra,
} from '@/features/scarces/drop-post-payload';
import { resolveComposerAttach } from '@/features/guilds/composer-post-attach';
import type { ComposerProposalDraft } from '@/features/guilds/guild-composer-sheet';
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
import { appendThreadFocusReply, postThreadPath } from '@/lib/post-routes';

export interface PersonalPostSubmitResult {
  confirmed: boolean;
  optimisticPost: PostRow | null;
}

type TrackTransaction = (input: {
  txHashes: string[];
  submittedMessage: string;
  successMessage: string;
  failureMessage: string;
  actionHref?: string | null;
  actionLabel?: string | null;
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
  proposal?: ComposerProposalDraft | null;
  files?: File[];
  places?: string[];
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
    proposal,
    files,
    places,
    contentLabels,
  } = args;
  const media = files?.length ? buildOptimisticMediaEntries(files) : undefined;
  const attach = resolveComposerAttach({
    text,
    poll: pollEmbed
      ? { options: pollEmbed.options, durationMs: undefined }
      : null,
    drop,
    proposal,
  });
  const commerceEmbed = drop ? commerceEmbedFromDraft(drop) : null;
  const proposalEmbed = attach.proposalEmbed;
  const dropKind = dropPostKind(drop);
  const mediaKind =
    !pollEmbed && !drop && !proposal && files?.length
      ? mediaKindFromFile(files[0]!)
      : undefined;
  const base: PostRow = {
    accountId,
    postId: newPostId,
    value: JSON.stringify({
      v: 1,
      text,
      ...postMetaFromText(text),
      ...placesMetaFromComposer(places),
      ...(pollEmbed
        ? { embeds: [pollEmbed] }
        : commerceEmbed
          ? { embeds: [commerceEmbed] }
          : proposalEmbed
            ? { embeds: [proposalEmbed] }
            : {}),
      ...(drop
        ? { x: dropSnapshotExtra(drop) }
        : attach.extra
          ? { x: attach.extra }
          : {}),
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
  const attach =
    mode === 'post'
      ? resolveComposerAttach({
          text,
          poll: payload.poll,
          drop: payload.drop,
          proposal: payload.proposal,
        })
      : resolveComposerAttach({ text });
  const drop = attach.drop;
  const proposal = attach.proposal;
  if (!text && !files.length && !attach.hasAttach) {
    return { confirmed: false, optimisticPost: null };
  }
  if (mode !== 'post' && !target) {
    return { confirmed: false, optimisticPost: null };
  }

  const pollEmbed = attach.pollEmbed;
  const commerceEmbed = attach.commerceEmbed;
  const dropKind = dropPostKind(drop);
  const bodyText = attach.bodyText;
  const contentLabels = normalizeComposerContentLabels(payload);

  const newPostId = Date.now().toString();
  const filePayload = files.length ? { files } : {};
  const tags = {
    ...postMetaFromText(bodyText),
    ...placesMetaFromComposer(payload.places),
  };
  let response: unknown;

  if (mode === 'post') {
    response = await client.posts.create(
      {
        text: bodyText,
        timestamp: Date.now(),
        ...tags,
        ...attach.writeFields,
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
    ...(mode === 'reply' && target
      ? {
          actionHref: appendThreadFocusReply(postThreadPath(target), newPostId),
          actionLabel: txToastSuccess.viewThread,
        }
      : {}),
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
      proposal,
      files: files.length ? files : undefined,
      places: payload.places,
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
  const timestamp = Date.now();

  let response;
  let postData: {
    text: string;
    timestamp: number;
    access?: 'group';
    groupId?: string;
    channel?: string;
    kind?: string;
    audiences?: string;
  };

  if (target.groupId) {
    await assertCanReplyToGuildPost(client, accountId, target);
    const groupId = target.groupId;
    const feedMeta = inheritedGuildReplyFeedMeta(target);
    postData = {
      text: '',
      access: 'group',
      groupId,
      timestamp,
      ...feedMeta,
    };
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
    postData = {
      text: '',
      timestamp,
      ...(target.channel ? { channel: target.channel } : {}),
      ...(target.kind ? { kind: target.kind } : {}),
    };
    response = await client.posts.repost(
      {
        author: target.accountId,
        postId: target.postId,
      },
      postData,
      newPostId,
      { wait: true }
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
    ...(target.groupId ? { groupId: target.groupId } : {}),
    ...(postData.channel ? { channel: postData.channel } : {}),
    ...(postData.kind ? { kind: postData.kind } : {}),
    ...(postData.audiences ? { audiences: postData.audiences } : {}),
  };

  return { confirmed: true, optimisticPost };
}

/** SocialDB path for a viewer's own share post (personal or guild). */
export function viewerRepostWritePath(opts: {
  postId: string;
  groupId?: string | null;
}): string {
  const groupId = opts.groupId?.trim();
  if (groupId) return `groups/${groupId}/content/post/${opts.postId}`;
  return `post/${opts.postId}`;
}

/** Undo a one-tap repost by deleting the viewer's share post. */
export async function submitPersonalUnrepost(params: {
  client: OnSocial;
  accountId: string;
  target: PostRow;
  viewerRepost: { postId: string; groupId?: string | null };
  trackTransaction: TrackTransaction;
}): Promise<PersonalPostSubmitResult> {
  const { client, accountId, target, viewerRepost, trackTransaction } = params;
  if (target.groupId) {
    await assertCanReplyToGuildPost(client, accountId, target);
  }

  const path = viewerRepostWritePath(viewerRepost);
  const response = await client.social.set(path, null, { wait: true });
  const confirmed = await trackTransaction({
    txHashes: collectRelayTxHashes(response),
    submittedMessage: txToastConfirming.unreposting,
    successMessage: txToastSuccess.unrepostPublished,
    failureMessage: txToastError.unrepostFailed,
  });

  return { confirmed, optimisticPost: null };
}
