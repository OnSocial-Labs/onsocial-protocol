import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../types/index.js';
import { db } from '../db/index.js';
import { logger } from '../logger.js';

// Free write allocations per tier
const FREE_WRITES_PER_TIER: Record<string, number> = {
  free: 10,
  starter: 25,
  staker: 50,
  builder: 200,
  pro: 500,
};

// Fixed credit costs (never change)
const CREDIT_COSTS = {
  uploadMb: 1,  // 1 credit per MB = $0.01
  relayTx: 5,   // 5 credits per relay = $0.05
};

export class PaymentRequiredError extends Error {
  statusCode = 402;
  constructor(message: string) {
    super(message);
    this.name = 'PaymentRequiredError';
  }
}

/**
 * Credit check middleware for write operations (uploads/relays)
 * 
 * Flow:
 * 1. Check free allocation first
 * 2. If exhausted, deduct from credit balance
 * 3. Log usage for analytics
 * 
 * Read operations are FREE (no credit check, only rate limiting)
 */
export async function creditCheckWrite(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Only check credits for write operations
    const isWrite = req.path.includes('/upload') || req.path.includes('/relay');
    if (!isWrite) {
      return next();
    }

    // Require authentication for writes
    if (!req.auth?.accountId) {
      res.status(401).json({ error: 'Authentication required for write operations' });
      return;
    }

    const { accountId, appId } = req.auth;
    const operation = req.path.includes('/upload') ? 'ipfs_upload' : 'relay_tx';
    
    // Get account state
    let dev = await db.getDeveloper(accountId);
    
    // Reset monthly free allocation if needed
    await db.resetFreeWritesIfNeeded(accountId);
    dev = await db.getDeveloper(accountId); // Refresh after potential reset

    // Check free allocation first
    const freeLimit = FREE_WRITES_PER_TIER[dev.tier] || 10;
    const useFreeWrite = dev.free_writes_used < freeLimit;

    if (useFreeWrite) {
      // Use free allocation
      await db.useFreeWrite(accountId);
      
      // Log usage (async, don't block)
      db.logWrite({
        accountId,
        appId,
        operation,
        creditsUsed: 0,
        usedFreeAllocation: true,
        endpoint: req.path,
        metadata: { ip: req.ip, userAgent: req.get('user-agent') },
      }).catch((err) => logger.error({ err }, 'Failed to log write'));

      logger.debug(
        { accountId, operation, freeUsed: dev.free_writes_used + 1, freeLimit },
        'Used free write allocation'
      );
      
      return next();
    }

    // Free allocation exhausted, calculate credit cost
    const fileSize = req.file?.size || (req.body?.data ? Buffer.from(req.body.data).length : 0);
    const fileSizeMb = fileSize / 1024 / 1024;
    
    const cost = operation === 'ipfs_upload'
      ? Math.ceil(fileSizeMb) * CREDIT_COSTS.uploadMb  // 1 credit per MB
      : CREDIT_COSTS.relayTx;  // 5 credits per relay

    // Check credit balance
    if (dev.credit_balance < cost) {
      throw new PaymentRequiredError(
        `Insufficient credits. Need ${cost}, have ${dev.credit_balance}. ` +
        `Buy credits at /credits/buy or wait for monthly free allocation reset.`
      );
    }

    // Deduct credits atomically
    const success = await db.deductCredits(accountId, cost);
    if (!success) {
      // Race condition: balance dropped below cost
      throw new PaymentRequiredError('Insufficient credits (concurrent request)');
    }

    // Log usage (async, don't block)
    db.logWrite({
      accountId,
      appId,
      operation,
      creditsUsed: cost,
      usedFreeAllocation: false,
      fileSizeMb,
      endpoint: req.path,
      metadata: { ip: req.ip, userAgent: req.get('user-agent') },
    }).catch((err) => logger.error({ err }, 'Failed to log write'));

    logger.info(
      { accountId, operation, cost, balance: dev.credit_balance - cost },
      'Deducted credits for write operation'
    );

    next();
  } catch (error) {
    if (error instanceof PaymentRequiredError) {
      res.status(402).json({ error: error.message });
      return;
    }
    logger.error({ error }, 'Credit check failed');
    res.status(500).json({ error: 'Credit check failed' });
  }
}

/**
 * Helper to get operation type from request
 */
function getOperation(req: Request): 'ipfs_upload' | 'relay_tx' {
  if (req.path.includes('/upload')) return 'ipfs_upload';
  if (req.path.includes('/relay')) return 'relay_tx';
  return 'ipfs_upload'; // default
}
