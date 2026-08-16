import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/index.js';
import {
  countUnreadDmThreads,
  listDmMessages,
  listDmThreads,
  markDmThreadRead,
  sendDmMessage,
  type DmMediaRef,
} from '../services/dm/index.js';

export const dmRouter = Router();

dmRouter.use('/dm', requireAuth);

function asMedia(value: unknown): DmMediaRef[] | null {
  if (!Array.isArray(value)) return null;
  const media: DmMediaRef[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const cid = typeof row.cid === 'string' ? row.cid.trim() : '';
    const mime = typeof row.mime === 'string' ? row.mime.trim() : '';
    const nonce = typeof row.nonce === 'string' ? row.nonce.trim() : undefined;
    const senderNonce =
      typeof row.senderNonce === 'string' ? row.senderNonce.trim() : undefined;
    const size = typeof row.size === 'number' ? row.size : Number(row.size);
    if (!cid || !mime || !Number.isFinite(size)) continue;
    media.push({
      cid,
      mime,
      size,
      ...(nonce ? { nonce } : {}),
      ...(senderNonce ? { senderNonce } : {}),
    });
  }
  return media.length > 0 ? media : null;
}

dmRouter.get('/dm/threads', async (req: Request, res: Response) => {
  try {
    const result = await listDmThreads(req.auth!.accountId);
    if ('code' in result) {
      res.status(400).json({ error: result.message, code: result.code });
      return;
    }
    res.json({ threads: result });
  } catch (error) {
    req.log.error({ error }, 'Failed to list DM threads');
    res.status(500).json({ error: 'Failed to list threads' });
  }
});

dmRouter.get('/dm/unread-count', async (req: Request, res: Response) => {
  try {
    const result = await countUnreadDmThreads(req.auth!.accountId);
    if (typeof result !== 'number') {
      res.status(400).json({ error: result.message, code: result.code });
      return;
    }
    res.json({ unread: result });
  } catch (error) {
    req.log.error({ error }, 'Failed to count unread DMs');
    res.status(500).json({ error: 'Failed to count unread' });
  }
});

dmRouter.get('/dm/threads/:threadId', async (req: Request, res: Response) => {
  const threadId = String(req.params.threadId ?? '').trim();
  const limit = Number(req.query.limit ?? 100);
  try {
    const result = await listDmMessages(
      req.auth!.accountId,
      threadId,
      Number.isFinite(limit) ? limit : 100
    );
    if ('code' in result) {
      const status =
        result.code === 'FORBIDDEN'
          ? 403
          : result.code === 'NOT_FOUND'
            ? 404
            : 400;
      res.status(status).json({ error: result.message, code: result.code });
      return;
    }
    res.json({ messages: result });
  } catch (error) {
    req.log.error({ error }, 'Failed to list DM messages');
    res.status(500).json({ error: 'Failed to list messages' });
  }
});

dmRouter.post('/dm/send', async (req: Request, res: Response) => {
  const recipientAccountId = String(req.body?.recipientAccountId ?? '').trim();
  const ciphertext = String(req.body?.ciphertext ?? '').trim();
  const nonce = String(req.body?.nonce ?? '').trim();
  const senderCiphertext = String(req.body?.senderCiphertext ?? '').trim();
  const senderNonce = String(req.body?.senderNonce ?? '').trim();
  const senderPubkey = String(req.body?.senderPubkey ?? '').trim();
  const media = asMedia(req.body?.media);

  try {
    const result = await sendDmMessage({
      senderAccountId: req.auth!.accountId,
      recipientAccountId,
      ciphertext,
      nonce,
      senderCiphertext: senderCiphertext || null,
      senderNonce: senderNonce || null,
      senderPubkey,
      media,
    });
    if ('code' in result) {
      const status =
        result.code === 'MUTED' || result.code === 'BLOCKED' ? 403 : 400;
      res.status(status).json({ error: result.message, code: result.code });
      return;
    }
    res.status(201).json({ message: result });
  } catch (error) {
    req.log.error({ error }, 'Failed to send DM');
    res.status(500).json({ error: 'Failed to send message' });
  }
});

dmRouter.post('/dm/read', async (req: Request, res: Response) => {
  const threadId = String(req.body?.threadId ?? '').trim();
  try {
    const result = await markDmThreadRead(req.auth!.accountId, threadId);
    if (result !== true) {
      const status =
        result.code === 'FORBIDDEN'
          ? 403
          : result.code === 'NOT_FOUND'
            ? 404
            : 400;
      res.status(status).json({ error: result.message, code: result.code });
      return;
    }
    res.json({ status: 'ok' });
  } catch (error) {
    req.log.error({ error }, 'Failed to mark DM read');
    res.status(500).json({ error: 'Failed to mark read' });
  }
});
