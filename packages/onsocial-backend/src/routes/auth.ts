import { Router } from 'express';

const router = Router();

// Example: GET /auth/health
router.get('/health', (_req, res) => {
  res.json({ status: 'auth ok' });
});

// TODO: Add wallet-based login and verification endpoints

export default router;
