import {
  buildGroupPostPath,
  buildGroupPostSetData,
  buildGroupReplySetData,
  buildPostSetData,
  buildReplySetData,
  type PostData,
} from '@onsocial/sdk';

import type {
  ComposerDropDraft,
  ComposerSubmit,
} from '@/features/guilds/guild-composer-sheet';
import type { GuildSpace } from '@/features/guilds/guild-structure';
import { guildSpaceFeedChannel } from '@/features/guilds/guild-structure';
import { postMetaFromText } from '@/features/home/post-mentions';
import {
  commerceEmbedFromDraft,
  dropPostKind,
  dropSnapshotExtra,
  resolvedDropPostText,
} from '@/features/scarces/drop-post-payload';
import { isDropComposeDraftReady } from '@/features/scarces/drop-compose-draft';
import {
  articleSnapshotExtra,
  resolveComposerArticle,
  type ArticleComposeInput,
} from '@/lib/article-post-payload';
import {
  COMPOSER_THREAD_MAX_BEATS,
  composerSubmitHasContent,
} from '@/lib/composer-thread';
import {
  normalizeComposerContentLabels,
  type PostContentLabels,
} from '@/lib/post-content-labels';
import { placesMetaFromComposer } from '@/lib/post-place';

type SocialSetData = Record<string, unknown>;

/** Stay under NEAR `log_utf8` 16KB per EVENT_JSON line. */
export const COMPOSER_THREAD_EVENT_BUDGET_BYTES = 14 * 1024;

export type ComposerPollEmbed = {
  kind: 'poll';
  question: string;
  options: string[];
  closesAt?: number;
};

/** Resolved write fields for one thread beat (no File uploads). */
export type ComposerBeatWriteModel = {
  bodyText: string;
  pollEmbed: ComposerPollEmbed | null;
  drop: ComposerDropDraft | null;
  article: ArticleComposeInput | null;
  places?: string[];
  contentLabels: PostContentLabels;
  postData: PostData;
};

export function allocateThreadPostIds(
  count: number,
  now = Date.now()
): string[] {
  return Array.from({ length: count }, (_, index) => String(now + index));
}

/** Serialized NEP-297 set event size for one path value. */
export function estimateSetEventBytes(value: unknown): number {
  const event = {
    standard: 'nep297',
    version: '1.0.0',
    event: 'set',
    data: value,
  };
  return new TextEncoder().encode(
    `EVENT_JSON:${JSON.stringify(event)}`
  ).length;
}

export function threadSetEntriesFitEventBudget(
  entries: SocialSetData
): boolean {
  return Object.values(entries).every(
    (value) => estimateSetEventBytes(value) <= COMPOSER_THREAD_EVENT_BUDGET_BYTES
  );
}

export function composerSubmitHasUploadFiles(
  payload: ComposerSubmit
): boolean {
  return Boolean(payload.files?.length);
}

/**
 * Text-only threads of 2–10 beats can share one Action::Set.
 * File beats stay sequential — gateway batch set does not upload.
 */
export function canBatchComposerThread(
  beats: readonly ComposerSubmit[]
): boolean {
  if (beats.length < 2 || beats.length > COMPOSER_THREAD_MAX_BEATS) {
    return false;
  }
  if (!beats.every(composerSubmitHasContent)) return false;
  return !beats.some(composerSubmitHasUploadFiles);
}

export type ComposerThreadChunk = {
  beats: ComposerSubmit[];
  startIndex: number;
};

/** One beat can join a batched set: no File uploads and EVENT_JSON fits. */
export function composerBeatCanBatch(
  payload: ComposerSubmit,
  now = Date.now()
): boolean {
  if (!composerSubmitHasContent(payload)) return false;
  if (composerSubmitHasUploadFiles(payload)) return false;
  const drop = isDropComposeDraftReady(payload.drop)
    ? payload.drop!
    : personalDrop(payload);
  const model = composerBeatWriteModel(payload, now, drop);
  const sample = buildPostSetData(model.postData, '0', now);
  return threadSetEntriesFitEventBudget(sample);
}

/**
 * Consecutive batchable beats share a set. File / oversize beats stay
 * their own sequential create-or-reply so the rest of the thread can
 * still batch.
 */
export function planComposerThreadChunks(
  beats: readonly ComposerSubmit[],
  now = Date.now()
): ComposerThreadChunk[] {
  const chunks: ComposerThreadChunk[] = [];
  let run: ComposerSubmit[] = [];
  let runStart = 0;

  const flushRun = () => {
    if (run.length === 0) return;
    chunks.push({ beats: run, startIndex: runStart });
    run = [];
  };

  beats.forEach((beat, index) => {
    if (composerBeatCanBatch(beat, now + index)) {
      if (run.length === 0) runStart = index;
      run.push(beat);
      if (run.length >= COMPOSER_THREAD_MAX_BEATS) flushRun();
      return;
    }
    flushRun();
    chunks.push({ beats: [beat], startIndex: index });
  });
  flushRun();
  return chunks;
}

function personalDrop(
  payload: ComposerSubmit
): ComposerDropDraft | null {
  return payload.drop?.collectionId?.trim() ? payload.drop : null;
}

export function composerBeatWriteModel(
  payload: ComposerSubmit,
  now: number,
  drop: ComposerDropDraft | null
): ComposerBeatWriteModel {
  const text = payload.text.trim();
  const article = resolveComposerArticle(
    payload.article,
    Boolean(drop) || Boolean(payload.poll)
  );
  const pollEmbed =
    payload.poll && !drop
      ? {
          kind: 'poll' as const,
          question: text,
          options: payload.poll.options,
          ...(payload.poll.durationMs != null
            ? { closesAt: now + payload.poll.durationMs }
            : {}),
        }
      : null;
  const commerceEmbed = drop ? commerceEmbedFromDraft(drop) : null;
  const dropKind = dropPostKind(drop);
  const articleExtra = article ? articleSnapshotExtra(article) : undefined;
  const bodyText = resolvedDropPostText(text, drop);
  const contentLabels = normalizeComposerContentLabels(payload);
  const tags = {
    ...postMetaFromText(bodyText),
    ...placesMetaFromComposer(payload.places),
  };
  const postData: PostData = {
    text: bodyText,
    timestamp: now,
    ...tags,
    ...(pollEmbed
      ? { embeds: [pollEmbed] }
      : commerceEmbed
        ? { embeds: [commerceEmbed] }
        : {}),
    ...(drop
      ? { x: dropSnapshotExtra(drop) }
      : articleExtra
        ? { x: articleExtra, contentType: 'md' as const }
        : {}),
    ...(dropKind
      ? { kind: dropKind }
      : article
        ? { kind: 'longform' as const }
        : {}),
    ...contentLabels,
  };
  return {
    bodyText,
    pollEmbed,
    drop,
    article,
    places: payload.places,
    contentLabels,
    postData,
  };
}

export function personalThreadBeatModels(
  beats: readonly ComposerSubmit[],
  now: number
): ComposerBeatWriteModel[] {
  return beats.map((beat, index) =>
    composerBeatWriteModel(beat, now + index, personalDrop(beat))
  );
}

export function buildPersonalThreadSetEntries(args: {
  accountId: string;
  beats: readonly ComposerSubmit[];
  ids: readonly string[];
  now: number;
  /** When set, the first beat replies to this post instead of opening a root. */
  parentId?: string;
}): { entries: SocialSetData; models: ComposerBeatWriteModel[] } {
  const { accountId, beats, ids, now, parentId } = args;
  const models = personalThreadBeatModels(beats, now);
  const entries: SocialSetData = {};
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index]!;
    const postId = ids[index]!;
    const stamp = now + index;
    const replyParentId = index === 0 ? parentId : ids[index - 1];
    const slice = replyParentId
      ? buildReplySetData(
          accountId,
          replyParentId,
          model.postData,
          postId,
          stamp
        )
      : buildPostSetData(model.postData, postId, stamp);
    Object.assign(entries, slice);
  }
  return { entries, models };
}

export function buildGuildThreadSetEntries(args: {
  accountId: string;
  groupId: string;
  space: GuildSpace;
  beats: readonly ComposerSubmit[];
  ids: readonly string[];
  now: number;
  /** When set, the first beat replies to this guild post instead of opening a root. */
  parentId?: string;
}): { entries: SocialSetData; models: ComposerBeatWriteModel[] } {
  const { accountId, groupId, space, beats, ids, now, parentId } = args;
  const channel = guildSpaceFeedChannel(space);
  const models = beats.map((beat, index) => {
    const drop = isDropComposeDraftReady(beat.drop) ? beat.drop! : null;
    const model = composerBeatWriteModel(beat, now + index, drop);
    const mediaKind = model.pollEmbed
      ? 'poll'
      : model.article
        ? 'longform'
        : (dropPostKind(drop) ?? space.kind);
    model.postData = {
      ...model.postData,
      access: 'group',
      groupId,
      channel,
      audiences: [space.audience],
      kind: mediaKind,
    };
    return model;
  });

  const entries: SocialSetData = {};
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index]!;
    const postId = ids[index]!;
    const stamp = now + index;
    const replyParentId = index === 0 ? parentId : ids[index - 1];
    const slice = replyParentId
      ? buildGroupReplySetData(
          groupId,
          buildGroupPostPath({
            author: accountId,
            groupId,
            postId: replyParentId,
          }),
          model.postData,
          postId,
          stamp
        )
      : buildGroupPostSetData(groupId, model.postData, postId, stamp);
    Object.assign(entries, slice);
  }
  return { entries, models };
}
