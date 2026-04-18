// ---------------------------------------------------------------------------
// Notifications module — list, count, mark-read, send custom events, rules
// ---------------------------------------------------------------------------

import type { HttpClient } from './http.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  ownerAccountId: string;
  appId: string;
  recipient: string;
  actor: string | null;
  notificationType: string;
  dedupeKey: string;
  objectPath: string | null;
  groupId: string | null;
  sourceContract: string | null;
  sourceReceiptId: string | null;
  sourceBlockHeight: number | null;
  read: boolean;
  context: Record<string, unknown> | null;
  createdAt: string;
}

export interface ListNotificationsParams {
  appId: string;
  recipient: string;
  limit?: number;
  cursor?: string;
  read?: boolean;
  type?: string;
  eventType?: string;
}

export interface ListNotificationsResult {
  notifications: Notification[];
  cursor: string | null;
}

export interface NotificationEvent {
  recipient: string;
  eventType: string;
  dedupeKey: string;
  actor?: string;
  objectId?: string;
  groupId?: string;
  context?: Record<string, unknown>;
}

export interface SendEventsParams {
  appId: string;
  events: NotificationEvent[];
}

export interface NotificationRule {
  id: string;
  ownerAccountId: string;
  appId: string;
  ruleType: 'recipient' | 'group';
  recipientAccountId: string | null;
  groupId: string | null;
  notificationTypes: string[] | null;
  createdAt: string;
}

export interface CreateRuleParams {
  appId: string;
  ruleType: 'recipient' | 'group';
  recipientAccountId?: string;
  groupId?: string;
  notificationTypes?: string[];
}

// ── Module ─────────────────────────────────────────────────────────────────

export class NotificationsModule {
  constructor(private readonly http: HttpClient) {}

  /** List notifications for a recipient. */
  async list(
    params: ListNotificationsParams
  ): Promise<ListNotificationsResult> {
    const qs = new URLSearchParams();
    qs.set('appId', params.appId);
    qs.set('recipient', params.recipient);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.read !== undefined) qs.set('read', String(params.read));
    if (params.type) qs.set('type', params.type);
    if (params.eventType) qs.set('eventType', params.eventType);
    return this.http.get<ListNotificationsResult>(
      `/developer/notifications?${qs.toString()}`
    );
  }

  /** Get unread notification count. */
  async unreadCount(
    appId: string,
    recipient: string,
    eventType?: string
  ): Promise<number> {
    const qs = new URLSearchParams({ appId, recipient });
    if (eventType) qs.set('eventType', eventType);
    const res = await this.http.get<{ recipient: string; unread: number }>(
      `/developer/notifications/count?${qs.toString()}`
    );
    return res.unread;
  }

  /** Mark notifications as read. Pass ids or `all: true`. */
  async markRead(
    appId: string,
    recipient: string,
    opts: { ids?: string[]; all?: boolean }
  ): Promise<number> {
    const res = await this.http.post<{ updated: number }>(
      '/developer/notifications/read',
      { appId, recipient, ...opts }
    );
    return res.updated;
  }

  /**
   * Send custom notification events (app_event type).
   * These are picked up by the notification worker and delivered via
   * webhooks if configured.
   */
  async sendEvents(params: SendEventsParams): Promise<unknown[]> {
    const res = await this.http.post<{ results: unknown[] }>(
      '/developer/notifications/events',
      { appId: params.appId, events: params.events }
    );
    return res.results;
  }

  /** List notification rules. */
  async listRules(): Promise<NotificationRule[]> {
    const res = await this.http.get<{ rules: NotificationRule[] }>(
      '/developer/notifications/rules'
    );
    return res.rules;
  }

  /** Create a notification rule. */
  async createRule(params: CreateRuleParams): Promise<NotificationRule> {
    const res = await this.http.post<{ rule: NotificationRule }>(
      '/developer/notifications/rules',
      params
    );
    return res.rule;
  }

  /** Delete a notification rule by ID. */
  async deleteRule(id: string): Promise<void> {
    await this.http.delete<{ status: string }>(
      `/developer/notifications/rules/${id}`
    );
  }

  /** List available notification types. */
  async types(): Promise<string[]> {
    const res = await this.http.get<{ types: string[] }>(
      '/developer/notifications/types'
    );
    return res.types;
  }
}
