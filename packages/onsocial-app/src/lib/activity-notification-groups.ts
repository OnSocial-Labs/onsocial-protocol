import type { Notification } from '@onsocial/sdk';
import { dmLocalDayKey } from '@/features/messages/dm-time';
import {
  notificationVerb,
  parseNotificationPostPath,
  parseNotificationReactionPath,
} from '@/lib/notification-display';

/** Repeated gestures that say the same thing. Mentions and replies stay rows. */
const GROUP_TYPES = new Set(['reaction', 'repost', 'standing_new']);

function textField(
  context: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const value = context?.[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function gestureTargetKey(
  notification: Pick<Notification, 'type' | 'context'>
): string | null {
  const context = notification.context;
  if (notification.type === 'standing_new') return 'standing';
  const ref =
    notification.type === 'reaction'
      ? (parseNotificationPostPath(textField(context, 'reactionTargetPath')) ??
        parseNotificationReactionPath(textField(context, 'path')))
      : (parseNotificationPostPath(textField(context, 'path')) ??
        parseNotificationPostPath(textField(context, 'parentPath')) ??
        parseNotificationPostPath(textField(context, 'refPath')));
  if (!ref) return null;
  return `${ref.author}/${ref.groupId ?? ''}/${ref.postId}`;
}

/**
 * Same gesture, same target, same local day. Null means the row stays alone
 * (a mention, a reply, or a gesture whose target we cannot see).
 */
export function activityGestureGroupKey(
  notification: Pick<Notification, 'type' | 'context' | 'createdAt'>
): string | null {
  if (!GROUP_TYPES.has(notification.type)) return null;
  const target = gestureTargetKey(notification);
  if (!target) return null;
  const day = dmLocalDayKey(notification.createdAt) ?? '';
  return `${notification.type}:${day}:${target}`;
}

/** Newest first. Items in a group stay newest first. */
export function groupActivityNotifications<
  T extends Pick<Notification, 'type' | 'context' | 'createdAt'>,
>(items: readonly T[]): T[][] {
  const groups: T[][] = [];
  const indexByKey = new Map<string, number>();
  for (const item of items) {
    const key = activityGestureGroupKey(item);
    if (!key) {
      groups.push([item]);
      continue;
    }
    const existing = indexByKey.get(key);
    if (existing == null) {
      indexByKey.set(key, groups.length);
      groups.push([item]);
    } else {
      groups[existing].push(item);
    }
  }
  return groups;
}

/** "liked your post" or "and 3 others liked your post". */
export function activityGroupVerb(
  items: readonly Pick<Notification, 'type' | 'context'>[]
): string {
  const head = items[0];
  if (!head) return 'activity';
  const verb = notificationVerb(head.type, head.context);
  const others = items.length - 1;
  if (others <= 0) return verb;
  const company = others === 1 ? '1 other' : `${others} others`;
  return `and ${company} ${verb}`;
}
