import { Router, Request, Response } from 'express';
import multer from 'multer';
import lighthouse from '@lighthouse-web3/sdk';
import { config } from '../../config/index.js';
import { logger } from '../../logger.js';
import { requireAuth } from '../../middleware/index.js';

const router = Router();

// Default 1GB, configurable via env (Lighthouse max: 24GB)
const maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '1073741824', 10);
const upload = multer({ limits: { fileSize: maxFileSize }, storage: multer.memoryStorage() });

const getApiKey = (): string => {
  const key = config.lighthouseApiKey;
  if (!key) throw new Error('LIGHTHOUSE_API_KEY not configured');
  return key;
};

/**
 * Validate IPFS CID format to prevent SSRF / path-traversal.
 * Accepts CIDv0 (Qm…) and CIDv1 (bafy…) only.
 */
const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|b[a-z2-7]{58,})$/;

function isValidCid(cid: string): boolean {
  return CID_PATTERN.test(cid);
}

// POST /storage/upload  — requires authentication
router.post('/upload', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file provided' });
    return;
  }

  try {
    const result = await lighthouse.uploadBuffer(req.file.buffer, getApiKey());
    res.json({ cid: result.data.Hash, size: result.data.Size });
  } catch (error) {
    logger.error({ error }, 'Upload error');
    res.status(500).json({ error: 'Upload failed' });
  }
});

// POST /storage/upload-json  — requires authentication
router.post('/upload-json', requireAuth, async (req: Request, res: Response) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    res.status(400).json({ error: 'No JSON provided' });
    return;
  }

  try {
    const result = await lighthouse.uploadText(JSON.stringify(req.body), getApiKey(), 'data.json');
    res.json({ cid: result.data.Hash, size: result.data.Size });
  } catch (error) {
    logger.error({ error }, 'Upload JSON error');
    res.status(500).json({ error: 'Upload failed' });
  }
});

// GET /storage/health
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: config.lighthouseApiKey ? 'ok' : 'unconfigured',
    gateway: 'https://gateway.lighthouse.storage',
  });
});

const GATEWAY_URL = 'https://gateway.lighthouse.storage/ipfs';

// GET /storage/url/:cid - Get gateway URL for a CID
router.get('/url/:cid', (req: Request, res: Response) => {
  const { cid } = req.params;
  if (!cid || !isValidCid(cid)) {
    res.status(400).json({ error: 'Invalid or missing CID' });
    return;
  }
  res.json({ url: `${GATEWAY_URL}/${cid}` });
});

// GET /storage/:cid/json - Download and parse as JSON (MUST come before /:cid)
router.get('/:cid/json', async (req: Request, res: Response) => {
  const { cid } = req.params;
  if (!cid || !isValidCid(cid)) {
    res.status(400).json({ error: 'Invalid or missing CID' });
    return;
  }

  try {
    const response = await fetch(`${GATEWAY_URL}/${cid}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      res.status(response.status).json({ error: 'File not found' });
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    logger.error({ error }, 'Download JSON error');
    res.status(500).json({ error: 'Download or parse failed' });
  }
});

// GET /storage/:cid - Download raw file (proxied through gateway)
router.get('/:cid', async (req: Request, res: Response) => {
  const { cid } = req.params;
  if (!cid || !isValidCid(cid)) {
    res.status(400).json({ error: 'Invalid or missing CID' });
    return;
  }

  try {
    const response = await fetch(`${GATEWAY_URL}/${cid}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      res.status(response.status).json({ error: 'File not found' });
      return;
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    logger.error({ error }, 'Download error');
    res.status(500).json({ error: 'Download failed' });
  }
});

export { router as storageRouter };
