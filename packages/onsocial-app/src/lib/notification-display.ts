import type { Notification } from '@onsocial/sdk';
import { formatSocialCalendarTime } from '@onsocial/ui';
import { nearExplorerTxHref } from '@/lib/app-config';
import {
  APP_GROUPS_PATH,
  APP_HOME_PATH,
  collectionPath,
  daoPortfolioPath,
  messagesPath,
  type ProtocolFeedStatusFilter,
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

function numberField(
  context: Record<string, unknown> | null | undefined,
  key: string
): number | null {
  const value = context?.[key];
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

function daoStatusFilter(
  status: string | null | undefined
): ProtocolFeedStatusFilter | null {
  switch ((status ?? '').trim()) {
    case 'Approved':
      return 'approved';
    case 'Rejected':
      return 'rejected';
    case 'Removed':
      return 'removed';
    case 'Expired':
      return 'expired';
    case 'Failed':
      return 'failed';
    case 'Moved':
      return 'moved';
    case 'InProgress':
      return 'open';
    default:
      return null;
  }
}

function daoResolvedVerb(status: string | null | undefined): string {
  switch ((status ?? '').trim()) {
    case 'Approved':
      return 'DAO proposal approved';
    case 'Rejected':
      return 'DAO proposal rejected';
    case 'Removed':
      return 'DAO proposal removed';
    case 'Expired':
      return 'DAO proposal expired';
    case 'Failed':
      return 'DAO proposal failed';
    case 'Moved':
      return 'DAO proposal moved';
    default:
      return 'DAO proposal resolved';
  }
}

function daoVoteVerb(vote: string | null | undefined): string {
  switch ((vote ?? '').trim()) {
    case 'Approve':
      return 'approved your DAO proposal';
    case 'Reject':
      return 'rejected your DAO proposal';
    case 'Remove':
      return 'voted to remove your DAO proposal';
    default:
      return 'voted on your DAO proposal';
  }
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
    case 'repost':
      return 'reposted your post';
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
    case 'dao_proposal':
      return 'opened a DAO proposal';
    case 'dao_proposal_resolved':
      return daoResolvedVerb(textField(context, 'status'));
    case 'dao_proposal_vote':
      return daoVoteVerb(textField(context, 'vote'));
    case 'scarces_sold':
      return 'bought your scarce';
    case 'scarces_offer':
      return 'made an offer';
    case 'reward_credited':
      return 'credited';
    case 'reward_claimed':
      return 'collected';
    case 'boost_locked':
      return 'boost locked';
    case 'boost_extended':
      return 'boost extended';
    case 'boost_unlocked':
      return 'boost unlocked';
    case 'boost_reward_claimed':
      return 'boost claimed';
    case 'boost_credits_purchased':
      return 'boost credits purchased';
    case 'boost_storage_deposited':
      return 'boost storage deposited';
    case 'app_event':
      return 'app update';
    case 'profile_anniversary': {
      const years = numberField(context, 'years');
      if (years === 1) return '1 year on OnSocial';
      if (years != null && years > 1) return `${years} years on OnSocial`;
      return 'anniversary on OnSocial';
    }
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
  notification: Pick<Notification, 'type' | 'actor' | 'context'> & {
    recipient?: string;
  }
): string {
  const context = notification.context ?? null;
  const type = notification.type;
  const actor = notification.actor?.trim() || null;

  if (type === 'profile_anniversary') {
    const accountId =
      textField(context, 'accountId') ??
      (notification.recipient?.trim() || null);
    if (accountId) return portfolioPath(accountId);
    return APP_HOME_PATH;
  }

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
    type === 'repost' ||
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
        return `${APP_GROUPS_PATH}/${encodeURIComponent(groupId)}?sheet=proposals`;
      }
      return `${APP_GROUPS_PATH}/${encodeURIComponent(groupId)}`;
    }
    return APP_GROUPS_PATH;
  }

  if (
    type === 'dao_proposal' ||
    type === 'dao_proposal_resolved' ||
    type === 'dao_proposal_vote'
  ) {
    const daoAccountId = textField(context, 'daoAccountId');
    if (daoAccountId) {
      const proposalId = numberField(context, 'proposalId');
      const status = daoStatusFilter(textField(context, 'status'));
      return daoPortfolioPath(daoAccountId, {
        proposal: proposalId,
        status: type === 'dao_proposal_resolved' ? status : 'open',
      });
    }
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

/** Verb + optional DAO snippet (time lives in the row aside). */
export function notificationDetail(
  notification: Pick<Notification, 'type' | 'context'>
): { verb: string; snippet: string | null } {
  const verb = notificationVerb(notification.type, notification.context);
  const snippet =
    notification.type === 'dao_proposal' ||
    notification.type === 'dao_proposal_resolved' ||
    notification.type === 'dao_proposal_vote'
      ? textField(notification.context, 'description')
      : null;
  return { verb, snippet };
}

export type NotificationSystemFamily =
  | 'boost'
  | 'collect'
  | 'dao'
  | 'scarces'
  | 'guild'
  | 'app'
  | 'onsocial'
  | 'activity';

export interface NotificationSystemChrome {
  family: NotificationSystemFamily;
  familyLabel: string;
  action: string;
}

/**
 * System / protocol events — Mage mark + family title (not a person avatar).
 * Social events with an actor stay on StandingIdentity.
 */
export function isSystemNotification(
  notification: Pick<Notification, 'type' | 'actor'>
): boolean {
  const type = notification.type;
  if (
    type.startsWith('boost_') ||
    type.startsWith('reward_') ||
    type === 'app_event' ||
    type === 'profile_anniversary' ||
    type === 'dao_proposal_resolved'
  ) {
    return true;
  }
  return !notification.actor?.trim();
}

function systemFamily(type: string): NotificationSystemFamily {
  if (type.startsWith('boost_')) return 'boost';
  if (type.startsWith('reward_')) return 'collect';
  if (type.startsWith('dao_')) return 'dao';
  if (type.startsWith('scarces_')) return 'scarces';
  if (type.startsWith('group_')) return 'guild';
  if (type === 'app_event') return 'app';
  if (type === 'profile_anniversary') return 'onsocial';
  return 'activity';
}

const SYSTEM_FAMILY_LABEL: Record<NotificationSystemFamily, string> = {
  boost: 'Boost',
  collect: 'Collect',
  dao: 'DAO',
  scarces: 'Scarces',
  guild: 'Guild',
  app: 'App',
  onsocial: 'OnSocial',
  activity: 'Activity',
};

function systemAction(
  type: string,
  context?: Record<string, unknown> | null
): string {
  switch (type) {
    case 'boost_reward_claimed':
      return 'Claimed';
    case 'boost_locked':
      return 'Locked';
    case 'boost_extended':
      return 'Extended';
    case 'boost_unlocked':
      return 'Unlocked';
    case 'boost_credits_purchased':
      return 'Credits purchased';
    case 'boost_storage_deposited':
      return 'Storage deposited';
    case 'reward_credited':
      return 'Credited';
    case 'reward_claimed':
      return 'Collected';
    case 'profile_anniversary': {
      const years = numberField(context, 'years');
      if (years === 1) return '1 year on OnSocial';
      if (years != null && years > 1) return `${years} years on OnSocial`;
      return 'Anniversary';
    }
    case 'dao_proposal_resolved': {
      const status = textField(context, 'status');
      switch ((status ?? '').trim()) {
        case 'Approved':
          return 'Proposal approved';
        case 'Rejected':
          return 'Proposal rejected';
        case 'Removed':
          return 'Proposal removed';
        case 'Expired':
          return 'Proposal expired';
        case 'Failed':
          return 'Proposal failed';
        case 'Moved':
          return 'Proposal moved';
        default:
          return 'Proposal resolved';
      }
    }
    case 'app_event':
      return 'Update';
    default: {
      const verb = notificationVerb(type, context);
      return verb.charAt(0).toUpperCase() + verb.slice(1);
    }
  }
}

export function notificationSystemChrome(
  notification: Pick<Notification, 'type' | 'context'>
): NotificationSystemChrome {
  const family = systemFamily(notification.type);
  return {
    family,
    familyLabel: SYSTEM_FAMILY_LABEL[family],
    action: systemAction(notification.type, notification.context),
  };
}

/**
 * Nearblocks link when the notification has an on-chain receipt.
 * Off-chain rows (anniversary, some app events) return null.
 */
export function notificationExplorerHref(
  notification: Pick<Notification, 'source' | 'context'>
): string | null {
  const fromSource = nearExplorerTxHref(notification.source?.receiptId);
  if (fromSource) return fromSource;
  const fromContext =
    textField(notification.context, 'txHash') ??
    textField(notification.context, 'transactionHash');
  return nearExplorerTxHref(fromContext);
}

/** @deprecated Prefer `notificationDetail` + aside time; kept for tests. */
export function notificationDescription(
  notification: Pick<Notification, 'type' | 'context' | 'createdAt'>
): string {
  const { verb, snippet } = notificationDetail(notification);
  const when = formatNotificationTime(notification.createdAt).label;
  const parts = [verb, snippet, when || null].filter((part): part is string =>
    Boolean(part)
  );
  return parts.join(' · ');
}
