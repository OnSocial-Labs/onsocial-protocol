import type { Notification } from '@onsocial/sdk';
import {
  APP_GROUPS_PATH,
  APP_HOME_PATH,
  collectionPath,
  messagesPath,
} from '@/lib/app-routes';
import { portfolioPath } from '@/lib/overlay-routes';
import { personalPostPath } from '@/lib/post-routes';

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

export function notificationVerb(type: string): string {
  switch (type) {
    case 'reply':
      return 'replied to your post';
    case 'quote':
      return 'quoted your post';
    case 'reaction':
      return 'reacted to your post';
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
    case 'boost_extended':
    case 'boost_unlocked':
    case 'boost_reward_claimed':
    case 'boost_credits_purchased':
    case 'boost_storage_deposited':
      return 'boost update';
    case 'app_event':
      return 'app update';
    default:
      return 'activity';
  }
}

/**
 * Resolve a deep link for a notification. Prefer concrete targets;
 * fall back to the activity inbox when context is incomplete.
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
    const fromPath =
      parseNotificationPostPath(textField(context, 'parentPath')) ??
      parseNotificationPostPath(textField(context, 'refPath')) ??
      parseNotificationPostPath(textField(context, 'reactionTargetPath')) ??
      parseNotificationPostPath(textField(context, 'path'));
    if (fromPath) {
      return personalPostPath(fromPath.author, fromPath.postId);
    }
    const postId = textField(context, 'postId');
    if (actor && postId) {
      return personalPostPath(actor, postId);
    }
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

export function formatNotificationTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
