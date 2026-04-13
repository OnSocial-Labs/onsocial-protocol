/**
 * Developer API routes — key management and app namespaces.
 *
 * All routes require JWT auth. API keys cannot manage keys or app namespaces.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/index.js';
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  type ApiKeyError,
} from '../services/apikeys/index.js';
import {
  deleteDeveloperApp,
  listDeveloperApps,
  registerDeveloperApp,
  type DeveloperAppError,
} from '../services/developer-apps/index.js';
import { getUsageSummary } from '../services/metering/index.js';

export const developerRouter = Router();

function requireJwtAuth(req: Request, res: Response, next: () => void): void {
  if (!req.auth) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.auth.method === 'apikey') {
    res
      .status(403)
      .json({ error: 'API keys cannot manage developer resources. Use JWT.' });
    return;
  }
  next();
}

developerRouter.use(requireAuth);
developerRouter.use(requireJwtAuth);

developerRouter.post('/keys', async (req: Request, res: Response) => {
  try {
    const accountId = req.auth!.accountId;
    const label: string = req.body?.label ?? 'default';
    const result = await createApiKey(accountId, label);

    if ('code' in result) {
      const err = result as ApiKeyError;
      const status = err.code === 'MAX_KEYS_REACHED' ? 409 : 400;
      res.status(status).json({ error: err.message, code: err.code });
      return;
    }

    res.status(201).json({
      key: result.rawKey,
      prefix: result.prefix,
      label: result.label,
      tier: result.tier,
      warning: 'Save this key now. It cannot be retrieved again.',
    });
  } catch (error) {
    req.log.error({ error }, 'Failed to create API key');
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

developerRouter.get('/keys', async (req: Request, res: Response) => {
  try {
    const keys = await listApiKeys(req.auth!.accountId);
    res.json({ keys });
  } catch (error) {
    req.log.error({ error }, 'Failed to list API keys');
    res.status(500).json({ error: 'Failed to list keys' });
  }
});

developerRouter.delete('/keys/:prefix', async (req: Request, res: Response) => {
  try {
    const revoked = await revokeApiKey(req.auth!.accountId, req.params.prefix);

    if (revoked) {
      res.json({ status: 'revoked' });
    } else {
      res.status(404).json({ error: 'Key not found' });
    }
  } catch (error) {
    req.log.error({ error }, 'Failed to revoke API key');
    res.status(500).json({ error: 'Failed to revoke key' });
  }
});

developerRouter.post(
  '/keys/:prefix/rotate',
  async (req: Request, res: Response) => {
    const accountId = req.auth!.accountId;
    const { prefix } = req.params;

    try {
      const existing = await listApiKeys(accountId);
      const oldKey = existing.find((key) => key.prefix === prefix);

      if (!oldKey) {
        res.status(404).json({ error: 'Key not found' });
        return;
      }

      const revoked = await revokeApiKey(accountId, prefix);
      if (!revoked) {
        res.status(404).json({ error: 'Key not found or already revoked' });
        return;
      }

      const result = await createApiKey(accountId, oldKey.label);
      if ('code' in result) {
        const err = result as ApiKeyError;
        res.status(400).json({ error: err.message, code: err.code });
        return;
      }

      res.status(201).json({
        key: result.rawKey,
        prefix: result.prefix,
        label: result.label,
        tier: result.tier,
        revokedPrefix: prefix,
        warning: 'Save this key now. It cannot be retrieved again.',
      });
    } catch (error) {
      req.log.error({ error }, 'Failed to rotate API key');
      res.status(500).json({ error: 'Failed to rotate key' });
    }
  }
);

developerRouter.get('/usage', async (req: Request, res: Response) => {
  try {
    const summary = await getUsageSummary(req.auth!.accountId);
    res.json(summary);
  } catch (error) {
    req.log.error({ error }, 'Failed to fetch usage summary');
    res.status(500).json({ error: 'Failed to fetch usage statistics' });
  }
});

developerRouter.post('/apps', async (req: Request, res: Response) => {
  try {
    const appId = String(req.body?.appId ?? '').trim();
    if (!appId) {
      res.status(400).json({ error: 'appId is required' });
      return;
    }

    const result = await registerDeveloperApp(req.auth!.accountId, appId);
    if ('code' in result) {
      const err = result as DeveloperAppError;
      const status =
        err.code === 'APP_ALREADY_EXISTS'
          ? 409
          : err.code === 'INVALID_APP_ID'
            ? 400
            : 404;
      res.status(status).json({ error: err.message, code: err.code });
      return;
    }

    res.status(201).json({ app: result });
  } catch (error) {
    req.log.error({ error }, 'Failed to register developer app');
    res.status(500).json({ error: 'Failed to register app' });
  }
});

developerRouter.get('/apps', async (req: Request, res: Response) => {
  try {
    const apps = await listDeveloperApps(req.auth!.accountId);
    res.json({ apps });
  } catch (error) {
    req.log.error({ error }, 'Failed to list developer apps');
    res.status(500).json({ error: 'Failed to list apps' });
  }
});

developerRouter.delete('/apps/:appId', async (req: Request, res: Response) => {
  try {
    const deleted = await deleteDeveloperApp(
      req.auth!.accountId,
      req.params.appId
    );
    if (!deleted) {
      res.status(404).json({ error: 'App not found' });
      return;
    }

    res.json({ status: 'deleted' });
  } catch (error) {
    req.log.error({ error }, 'Failed to delete developer app');
    res.status(500).json({ error: 'Failed to delete app' });
  }
});
