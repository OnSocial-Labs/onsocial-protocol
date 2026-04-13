import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth, requireTier } from '../middleware/index.js';
import {
  createNotificationRule,
  deleteNotificationRule,
  listNotificationRules,
} from '../services/notifications/rules.js';
import {
  createNotificationWebhook,
  deleteNotificationWebhook,
  listNotificationWebhooks,
} from '../services/notifications/webhooks.js';
import {
  getUnreadNotificationCount,
  listNotifications,
  listNotificationTypes,
  markNotificationsRead,
} from '../services/notifications/index.js';
import { ingestAppNotificationEvents } from '../services/notifications/app-events.js';

export const notificationRouter = Router();

notificationRouter.use(requireAuth);
notificationRouter.use(requireTier('pro', 'scale', 'service'));

function parseRead(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === 'true' || value === true) {
    return true;
  }
  if (value === 'false' || value === false) {
    return false;
  }
  return undefined;
}

function requireRecipient(req: Request, res: Response): string | undefined {
  const recipient = String(
    req.query.recipient ?? req.body?.recipient ?? ''
  ).trim();
  if (!recipient) {
    res.status(400).json({ error: 'recipient is required' });
    return undefined;
  }
  return recipient;
}

function requireAppId(req: Request, res: Response): string | undefined {
  const appId = String(req.query.appId ?? req.body?.appId ?? '').trim();
  if (!appId) {
    res.status(400).json({ error: 'appId is required' });
    return undefined;
  }
  return appId;
}

function normalizeEventBatch(req: Request): Array<Record<string, unknown>> {
  if (Array.isArray(req.body?.events)) {
    return req.body.events.filter(
      (event: unknown): event is Record<string, unknown> =>
        typeof event === 'object' && event !== null && !Array.isArray(event)
    );
  }

  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    return [req.body as Record<string, unknown>];
  }

  return [];
}

notificationRouter.get(
  '/notifications/types',
  (_req: Request, res: Response) => {
    res.json({ types: listNotificationTypes() });
  }
);

notificationRouter.get(
  '/notifications',
  async (req: Request, res: Response) => {
    const appId = requireAppId(req, res);
    if (!appId) {
      return;
    }
    const recipient = requireRecipient(req, res);
    if (!recipient) {
      return;
    }

    const parsedLimit = Number(req.query.limit);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;

    try {
      const result = await listNotifications({
        ownerAccountId: req.auth!.accountId,
        appId,
        recipient,
        limit,
        tier: req.auth!.tier,
        read: parseRead(req.query.read),
        type: typeof req.query.type === 'string' ? req.query.type : undefined,
        eventType:
          typeof req.query.eventType === 'string'
            ? req.query.eventType
            : undefined,
        cursor:
          typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
      });

      res.json(result);
    } catch (error) {
      req.log.error({ error }, 'Failed to list notifications');
      res.status(500).json({ error: 'Failed to list notifications' });
    }
  }
);

notificationRouter.get(
  '/notifications/count',
  async (req: Request, res: Response) => {
    const appId = requireAppId(req, res);
    if (!appId) {
      return;
    }
    const recipient = requireRecipient(req, res);
    if (!recipient) {
      return;
    }

    try {
      const unread = await getUnreadNotificationCount({
        ownerAccountId: req.auth!.accountId,
        appId,
        recipient,
        eventType:
          typeof req.query.eventType === 'string'
            ? req.query.eventType
            : undefined,
      });
      res.json({ recipient, unread });
    } catch (error) {
      req.log.error({ error }, 'Failed to fetch notification count');
      res.status(500).json({ error: 'Failed to fetch notification count' });
    }
  }
);

notificationRouter.post(
  '/notifications/events',
  async (req: Request, res: Response) => {
    const appId = requireAppId(req, res);
    if (!appId) {
      return;
    }

    const events = normalizeEventBatch(req);
    if (events.length === 0) {
      res.status(400).json({ error: 'events must contain at least one item' });
      return;
    }

    try {
      const result = await ingestAppNotificationEvents({
        ownerAccountId: req.auth!.accountId,
        appId,
        events: events.map((event) => ({
          recipient: typeof event.recipient === 'string' ? event.recipient : '',
          actor: typeof event.actor === 'string' ? event.actor : undefined,
          eventType: typeof event.eventType === 'string' ? event.eventType : '',
          dedupeKey: typeof event.dedupeKey === 'string' ? event.dedupeKey : '',
          objectId:
            typeof event.objectId === 'string' ? event.objectId : undefined,
          groupId:
            typeof event.groupId === 'string' ? event.groupId : undefined,
          sourceContract:
            typeof event.sourceContract === 'string'
              ? event.sourceContract
              : undefined,
          sourceReceiptId:
            typeof event.sourceReceiptId === 'string'
              ? event.sourceReceiptId
              : undefined,
          sourceBlockHeight:
            typeof event.sourceBlockHeight === 'string' ||
            typeof event.sourceBlockHeight === 'number'
              ? event.sourceBlockHeight
              : undefined,
          createdAt:
            typeof event.createdAt === 'string' ? event.createdAt : undefined,
          context:
            event.context &&
            typeof event.context === 'object' &&
            !Array.isArray(event.context)
              ? (event.context as Record<string, unknown>)
              : undefined,
        })),
      });

      if ('code' in result) {
        const status =
          result.code === 'APP_NOT_OWNED'
            ? 403
            : result.code === 'APP_NOT_FOUND'
              ? 404
              : result.code === 'DATABASE_NOT_CONFIGURED'
                ? 500
                : 400;
        res.status(status).json({ error: result.message, code: result.code });
        return;
      }

      res.status(201).json({ results: result });
    } catch (error) {
      req.log.error({ error }, 'Failed to ingest app notification events');
      res
        .status(500)
        .json({ error: 'Failed to ingest app notification events' });
    }
  }
);

notificationRouter.post(
  '/notifications/read',
  async (req: Request, res: Response) => {
    const appId = requireAppId(req, res);
    if (!appId) {
      return;
    }
    const recipient = requireRecipient(req, res);
    if (!recipient) {
      return;
    }

    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.filter(
          (id: unknown): id is string => typeof id === 'string'
        )
      : undefined;
    const all = req.body?.all === true;

    if (!all && (!ids || ids.length === 0)) {
      res.status(400).json({ error: 'Provide ids or all=true' });
      return;
    }

    try {
      const updated = await markNotificationsRead({
        ownerAccountId: req.auth!.accountId,
        appId,
        recipient,
        ids,
        all,
      });
      res.json({ updated });
    } catch (error) {
      req.log.error({ error }, 'Failed to mark notifications read');
      res.status(500).json({ error: 'Failed to mark notifications read' });
    }
  }
);

notificationRouter.get(
  '/notifications/rules',
  async (req: Request, res: Response) => {
    try {
      const rules = await listNotificationRules(req.auth!.accountId);
      res.json({ rules });
    } catch (error) {
      req.log.error({ error }, 'Failed to list notification rules');
      res.status(500).json({ error: 'Failed to list notification rules' });
    }
  }
);

notificationRouter.post(
  '/notifications/rules',
  async (req: Request, res: Response) => {
    const appId = requireAppId(req, res);
    if (!appId) {
      return;
    }

    const ruleType = req.body?.ruleType;
    if (ruleType !== 'recipient' && ruleType !== 'group') {
      res.status(400).json({ error: 'ruleType must be recipient or group' });
      return;
    }

    try {
      const result = await createNotificationRule({
        ownerAccountId: req.auth!.accountId,
        appId,
        ruleType,
        recipientAccountId:
          typeof req.body?.recipientAccountId === 'string'
            ? req.body.recipientAccountId
            : undefined,
        groupId:
          typeof req.body?.groupId === 'string' ? req.body.groupId : undefined,
        notificationTypes: Array.isArray(req.body?.notificationTypes)
          ? req.body.notificationTypes.filter(
              (value: unknown): value is string => typeof value === 'string'
            )
          : undefined,
      });

      if ('code' in result) {
        const status = result.code === 'INVALID_RULE' ? 400 : 404;
        res.status(status).json({ error: result.message, code: result.code });
        return;
      }

      res.status(201).json({ rule: result });
    } catch (error) {
      req.log.error({ error }, 'Failed to create notification rule');
      res.status(500).json({ error: 'Failed to create notification rule' });
    }
  }
);

notificationRouter.delete(
  '/notifications/rules/:id',
  async (req: Request, res: Response) => {
    try {
      const deleted = await deleteNotificationRule(
        req.auth!.accountId,
        req.params.id
      );
      if (!deleted) {
        res.status(404).json({ error: 'Rule not found' });
        return;
      }

      res.json({ status: 'deleted' });
    } catch (error) {
      req.log.error({ error }, 'Failed to delete notification rule');
      res.status(500).json({ error: 'Failed to delete notification rule' });
    }
  }
);

notificationRouter.get(
  '/notifications/webhooks',
  async (req: Request, res: Response) => {
    try {
      const webhooks = await listNotificationWebhooks(req.auth!.accountId);
      res.json({ webhooks });
    } catch (error) {
      req.log.error({ error }, 'Failed to list notification webhooks');
      res.status(500).json({ error: 'Failed to list notification webhooks' });
    }
  }
);

notificationRouter.post(
  '/notifications/webhooks',
  async (req: Request, res: Response) => {
    const appId = requireAppId(req, res);
    if (!appId) {
      return;
    }

    const url = typeof req.body?.url === 'string' ? req.body.url : '';
    if (!url) {
      res.status(400).json({ error: 'url is required' });
      return;
    }

    try {
      const result = await createNotificationWebhook({
        ownerAccountId: req.auth!.accountId,
        appId,
        url,
      });

      if ('code' in result) {
        const status = result.code === 'INVALID_URL' ? 400 : 404;
        res.status(status).json({ error: result.message, code: result.code });
        return;
      }

      res.status(201).json({ webhook: result });
    } catch (error) {
      req.log.error({ error }, 'Failed to create notification webhook');
      res.status(500).json({ error: 'Failed to create notification webhook' });
    }
  }
);

notificationRouter.delete(
  '/notifications/webhooks/:id',
  async (req: Request, res: Response) => {
    try {
      const deleted = await deleteNotificationWebhook(
        req.auth!.accountId,
        req.params.id
      );
      if (!deleted) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }

      res.json({ status: 'deleted' });
    } catch (error) {
      req.log.error({ error }, 'Failed to delete notification webhook');
      res.status(500).json({ error: 'Failed to delete notification webhook' });
    }
  }
);
