import { Router } from 'express';

const router = Router();

// Example: POST /relay/submit
router.post('/submit', (req, res) => {
  // TODO: Validate and forward transaction to relayer
  res.json({ status: 'relay received', body: req.body });
});

export default router;
