/**
 * Public community-board catalog. JWT is not required — listings are public.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { listCommunityAppCatalog } from '../services/developer-apps/index.js';

export const communityAppsRouter = Router();

communityAppsRouter.get(
  '/apps/catalog',
  async (req: Request, res: Response) => {
    try {
      const apps = await listCommunityAppCatalog();
      res.json({
        apps: apps.map((app) => ({
          appId: app.appId,
          name: app.name ?? app.appId,
          iconUrl: app.iconUrl,
          href: app.href,
        })),
      });
    } catch (error) {
      req.log.error({ error }, 'Failed to list community app catalog');
      res.status(500).json({ error: 'Failed to list catalog' });
    }
  }
);
