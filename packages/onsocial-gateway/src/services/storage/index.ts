import { Router, Request, Response } from 'express';
import multer from 'multer';
import lighthouse from '@lighthouse-web3/sdk';
import { RateLimiterMemory } from 'rate-limiter-flexible';

const router = Router();

const rateLimiter = new RateLimiterMemory({ points: 100, duration: 60 });

// Default 1GB, configurable via env (Lighthouse max: 24GB)
const maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '1073741824', 10);
const upload = multer({ limits: { fileSize: maxFileSize }, storage: multer.memoryStorage() });

const getApiKey = (): string => {
  const key = process.env.LIGHTHOUSE_API_KEY;
  if (!key) throw new Error('LIGHTHOUSE_API_KEY not configured');
  return key;
};

// POST /storage/upload
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    await rateLimiter.consume(req.ip || 'unknown');
  } catch {
    res.status(429).json({ error: 'Too many requests' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'No file provided' });
    return;
  }

  try {
    const result = await lighthouse.uploadBuffer(req.file.buffer, getApiKey());
    res.json({ cid: result.data.Hash, size: result.data.Size });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// POST /storage/upload-json
router.post('/upload-json', async (req: Request, res: Response) => {
  try {
    await rateLimiter.consume(req.ip || 'unknown');
  } catch {
    res.status(429).json({ error: 'Too many requests' });
    return;
  }

  if (!req.body || Object.keys(req.body).length === 0) {
    res.status(400).json({ error: 'No JSON provided' });
    return;
  }

  try {
    const result = await lighthouse.uploadText(JSON.stringify(req.body), getApiKey(), 'data.json');
    res.json({ cid: result.data.Hash, size: result.data.Size });
  } catch (error) {
    console.error('Upload JSON error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// GET /storage/health
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: process.env.LIGHTHOUSE_API_KEY ? 'ok' : 'unconfigured',
    gateway: 'https://gateway.lighthouse.storage',
  });
});

const GATEWAY_URL = 'https://gateway.lighthouse.storage/ipfs';

// GET /storage/url/:cid - Get gateway URL for a CID
router.get('/url/:cid', (req: Request, res: Response) => {
  const { cid } = req.params;
  if (!cid) {
    res.status(400).json({ error: 'CID required' });
    return;
  }
  res.json({ url: `${GATEWAY_URL}/${cid}` });
});

// GET /storage/:cid/json - Download and parse as JSON (MUST come before /:cid)
router.get('/:cid/json', async (req: Request, res: Response) => {
  const { cid } = req.params;
  if (!cid) {
    res.status(400).json({ error: 'CID required' });
    return;
  }

  try {
    const response = await fetch(`${GATEWAY_URL}/${cid}`);
    if (!response.ok) {
      res.status(response.status).json({ error: 'File not found' });
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Download JSON error:', error);
    res.status(500).json({ error: 'Download or parse failed' });
  }
});

// GET /storage/:cid - Download raw file (proxied through gateway)
router.get('/:cid', async (req: Request, res: Response) => {
  const { cid } = req.params;
  if (!cid) {
    res.status(400).json({ error: 'CID required' });
    return;
  }

  try {
    const response = await fetch(`${GATEWAY_URL}/${cid}`);
    if (!response.ok) {
      res.status(response.status).json({ error: 'File not found' });
      return;
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

export { router as storageRouter };
