/**
 * Usage metering middleware — records every authenticated request after the
 * response is sent. Fire-and-forget: never blocks or slows responses.
 *
 * Captures: endpoint, method, status code, response time, account, actor, key prefix.
 */

import type { Request, Response, NextFunction } from 'express';
import { recordUsage } from '../services/metering/index.js';

/**
 * Metering middleware — attach after auth middleware so req.auth is populated.
 * Hooks into `res.on('finish')` so the recording happens only after the
 * response has been fully sent to the client.
 */
export function meteringMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip unauthenticated requests — nothing to meter
  if (!req.auth) {
    next();
    return;
  }

  const start = Date.now();

  res.on('finish', () => {
    // Derive key prefix from the auth middleware's record
    // (authMiddleware stores the raw prefix for API key auth)
    const keyPrefix =
      req.auth?.method === 'apikey'
        ? ((req as RequestWithKeyPrefix)._keyPrefix ?? null)
        : null;

    // Actor passthrough: if body.actor_id was used, record it
    const actorId =
      req.body?.actor_id && req.body.actor_id !== req.auth?.accountId
        ? String(req.body.actor_id)
        : null;

    recordUsage({
      keyPrefix,
      accountId: req.auth!.accountId,
      actorId,
      endpoint: req.baseUrl + req.path,
      method: req.method,
      statusCode: res.statusCode,
      responseMs: Date.now() - start,
    });
  });

  next();
}

/** Extended request type — authMiddleware may attach _keyPrefix for metering. */
interface RequestWithKeyPrefix extends Request {
  _keyPrefix?: string;
}
