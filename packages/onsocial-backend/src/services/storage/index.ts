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

export { router as storageRouter };
