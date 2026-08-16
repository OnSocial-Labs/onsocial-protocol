import type { Notification } from '@onsocial/sdk';
import { formatSocialCalendarTime } from '@onsocial/ui';
import {
  APP_GROUPS_PATH,
  APP_HOME_PATH,
  collectionPath,
  messagesPath,
} from '@/lib/app-routes';
import { portfolioPath } from '@/lib/overlay-routes';
import { postThreadPath } from '@/lib/post-routes';

/** Mailbox owns DMs — Activity list/count/mark-all skip this kind. */
export const ACTIVITY_EXCLUDE_TYPE = 'dm';

function textField(
  context: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const value = context?.[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/** Parse `author/post/{id}` content paths used in notification context. */
export function parseNotificationPostPath(
  path: string | null | undefined
): { author: string; postId: string } | null {
  if (!path?.trim()) return null;
  const match = path.trim().match(/^(.+)\/post\/(.+)$/);
  if (!match?.[1] || !match[2]) return null;
  return { author: match[1], postId: match[2] };
}

function reactionVerb(
  context: Record<string, unknown> | null | undefined
): string {
  const raw = textField(context, 'reactionValue');
  if (!raw) return 'reacted to your post';
  try {
    const parsed = JSON.parse(raw) as { type?: unknown };
    if (parsed?.type === 'like') return 'liked your post';
  } catch {
    // Plain emoji / short token from older writers.
    if (raw.length <= 8 && !raw.includes('{')) {
      return `reacted ${raw} to your post`;
    }
  }
  return 'reacted to your post';
}

export function notificationVerb(
  type: string,
  context?: Record<string, unknown> | null
): string {
  switch (type) {
    case 'reply':
      return 'replied to your post';
    case 'quote':
      return 'quoted your post';
    case 'reaction':
      return reactionVerb(context);
    case 'mention':
      return 'mentioned you';
    case 'standing_new':
      return 'stood with you';
    case 'dm':
      return 'sent a private message';
    case 'group_invite':
      return 'invited you to a guild';
    case 'group_proposal':
      return 'opened a guild proposal';
    case 'scarces_sold':
      return 'bought your scarce';
    case 'scarces_offer':
      return 'made an offer';
    case 'reward_credited':
      return 'reward credited';
    case 'reward_claimed':
      return 'reward claimed';
    case 'boost_locked':
      return 'boost locked';
    case 'boost_extended':
      return 'boost extended';
    case 'boost_unlocked':
      return 'boost unlocked';
    case 'boost_reward_claimed':
      return 'boost reward claimed';
    case 'boost_credits_purchased':
      return 'boost credits purchased';
    case 'boost_storage_deposited':
      return 'boost storage deposited';
    case 'app_event':
      return 'app update';
    default:
      return 'activity';
  }
}

function postHrefFromContext(
  context: Record<string, unknown> | null,
  actor: string | null
): string | null {
  const fromPath =
    parseNotificationPostPath(textField(context, 'parentPath')) ??
    parseNotificationPostPath(textField(context, 'refPath')) ??
    parseNotificationPostPath(textField(context, 'reactionTargetPath')) ??
    parseNotificationPostPath(textField(context, 'path'));
  const groupId = textField(context, 'groupId');
  if (fromPath) {
    return postThreadPath({
      accountId: fromPath.author,
      postId: fromPath.postId,
      groupId,
    });
  }
  const postId = textField(context, 'postId');
  if (actor && postId) {
    return postThreadPath({
      accountId: actor,
      postId,
      groupId,
    });
  }
  return null;
}

/**
 * Resolve a deep link for a notification. Prefer concrete targets;
 * fall back to home when context is incomplete.
 */
export function notificationHref(
  notification: Pick<Notification, 'type' | 'actor' | 'context'>
): string {
  const context = notification.context ?? null;
  const type = notification.type;
  const actor = notification.actor?.trim() || null;

  if (type === 'dm') {
    const threadId = textField(context, 'threadId');
    const peer =
      textField(context, 'peerAccountId') ??
      textField(context, 'peer') ??
      actor;
    return messagesPath({
      threadId,
      peer: threadId ? null : peer,
    });
  }

  if (
    type === 'reply' ||
    type === 'quote' ||
    type === 'mention' ||
    type === 'reaction'
  ) {
    const postHref = postHrefFromContext(context, actor);
    if (postHref) return postHref;
    if (actor) return portfolioPath(actor);
  }

  if (type === 'standing_new') {
    if (actor) return portfolioPath(actor);
  }

  if (type === 'group_invite' || type === 'group_proposal') {
    const groupId = textField(context, 'groupId');
    if (groupId) {
      if (type === 'group_proposal') {
        return `${APP_GROUPS_PATH}/${encodeURIComponent(groupId)}/proposals`;
      }
      return `${APP_GROUPS_PATH}/${encodeURIComponent(groupId)}`;
    }
    return APP_GROUPS_PATH;
  }

  if (type === 'scarces_sold' || type === 'scarces_offer') {
    const collectionId = textField(context, 'collectionId');
    if (collectionId) return collectionPath(collectionId);
  }

  if (type.startsWith('boost_') || type.startsWith('reward_')) {
    return APP_HOME_PATH;
  }

  if (actor) return portfolioPath(actor);
  return APP_HOME_PATH;
}

export function formatNotificationTime(iso: string): {
  label: string;
  title: string;
} {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { label: '', title: '' };
  const calendar = formatSocialCalendarTime(date.getTime());
  if (!calendar) return { label: '', title: '' };
  return { label: calendar.label, title: calendar.title };
}

/** Row subtitle: verb · relative time. */
export function notificationDescription(
  notification: Pick<Notification, 'type' | 'context' | 'createdAt'>
): string {
  const verb = notificationVerb(notification.type, notification.context);
  const when = formatNotificationTime(notification.createdAt).label;
  return when ? `${verb} · ${when}` : verb;
}
