// ---------------------------------------------------------------------------
// Notifications module — list, count, mark-read, send custom events, rules
// ---------------------------------------------------------------------------

import type { HttpClient } from './http.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  recipient: string;
  actor: string | null;
  type: string;
  dedupeKey: string | null;
  read: boolean;
  source: {
    contract: string | null;
    receiptId: string | null;
    blockHeight: number | null;
  };
  context: Record<string, unknown> | null;
  createdAt: string;
}

export interface ListNotificationsParams {
  /** App namespace. Falls back to the SDK-level `appId` (default: `'default'`). */
  appId?: string;
  recipient: string;
  limit?: number;
  cursor?: string;
  read?: boolean;
  type?: string;
  eventType?: string;
}

export interface ListNotificationsResult {
  notifications: Notification[];
  nextCursor: string | null;
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
  /** App namespace. Falls back to the SDK-level `appId` (default: `'default'`). */
  appId?: string;
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
  /** App namespace. Falls back to the SDK-level `appId` (default: `'default'`). */
  appId?: string;
  ruleType: 'recipient' | 'group';
  recipientAccountId?: string;
  groupId?: string;
  notificationTypes?: string[];
}

// ── Module ─────────────────────────────────────────────────────────────────

export class NotificationsModule {
  private readonly defaultAppId: string;

  constructor(
    private readonly http: HttpClient,
    appId?: string
  ) {
    this.defaultAppId = appId ?? 'default';
  }

  private appId(override?: string): string {
    return override ?? this.defaultAppId;
  }

  /** List notifications for a recipient. */
  async list(
    params: ListNotificationsParams
  ): Promise<ListNotificationsResult> {
    const qs = new URLSearchParams();
    qs.set('appId', this.appId(params.appId));
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
    recipient: string,
    opts?: { appId?: string; eventType?: string }
  ): Promise<number> {
    const qs = new URLSearchParams({
      appId: this.appId(opts?.appId),
      recipient,
    });
    if (opts?.eventType) qs.set('eventType', opts.eventType);
    const res = await this.http.get<{ recipient: string; unread: number }>(
      `/developer/notifications/count?${qs.toString()}`
    );
    return res.unread;
  }

  /** Mark notifications as read. Pass ids or `all: true`. */
  async markRead(
    recipient: string,
    opts: { ids?: string[]; all?: boolean; appId?: string }
  ): Promise<number> {
    const res = await this.http.post<{ updated: number }>(
      '/developer/notifications/read',
      { appId: this.appId(opts.appId), recipient, ids: opts.ids, all: opts.all }
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
      { appId: this.appId(params.appId), events: params.events }
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
      { ...params, appId: this.appId(params.appId) }
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
