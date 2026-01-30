import pg from 'pg';
const { Pool } = pg;
import { logger } from '../logger.js';

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'onsocial_gateway',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD,
  max: 20, // Maximum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err: Error) => {
  logger.error({ err }, 'Unexpected database pool error');
});

export interface Developer {
  account_id: string;
  credit_balance: number;
  tier: string;
  locked_usd_value: number | null;
  free_writes_used: number;
  free_writes_reset_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface WriteLog {
  id: number;
  developer_account_id: string;
  app_id: string | null;
  operation: 'ipfs_upload' | 'relay_tx';
  credits_used: number;
  used_free_allocation: boolean;
  file_size_mb: number | null;
  endpoint: string | null;
  timestamp: Date;
  request_metadata: Record<string, any> | null;
}

export interface CreditPurchase {
  id: number;
  developer_account_id: string;
  social_amount: string;
  social_price_usd: number;
  credits_received: number;
  tx_hash: string;
  timestamp: Date;
}

/**
 * Database query helpers
 */
export const db = {
  /**
   * Get developer account or create if not exists
   */
  async getDeveloper(accountId: string): Promise<Developer> {
    const result = await pool.query<Developer>(
      `INSERT INTO developers (account_id) 
       VALUES ($1) 
       ON CONFLICT (account_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [accountId]
    );
    return result.rows[0];
  },

  /**
   * Update developer credits
   */
  async updateCredits(accountId: string, credits: number): Promise<void> {
    await pool.query(
      'UPDATE developers SET credit_balance = credit_balance + $1 WHERE account_id = $2',
      [credits, accountId]
    );
  },

  /**
   * Deduct credits atomically
   */
  async deductCredits(accountId: string, amount: number): Promise<boolean> {
    const result = await pool.query(
      `UPDATE developers 
       SET credit_balance = credit_balance - $1 
       WHERE account_id = $2 AND credit_balance >= $1
       RETURNING credit_balance`,
      [amount, accountId]
    );
    return result.rowCount! > 0;
  },

  /**
   * Use free write allocation
   */
  async useFreeWrite(accountId: string): Promise<boolean> {
    const result = await pool.query(
      `UPDATE developers 
       SET free_writes_used = free_writes_used + 1 
       WHERE account_id = $1
       RETURNING free_writes_used`,
      [accountId]
    );
    return result.rowCount! > 0;
  },

  /**
   * Reset monthly free writes if needed
   */
  async resetFreeWritesIfNeeded(accountId: string): Promise<void> {
    await pool.query(
      `UPDATE developers 
       SET free_writes_used = 0, 
           free_writes_reset_at = date_trunc('month', NOW() + INTERVAL '1 month')
       WHERE account_id = $1 AND free_writes_reset_at <= NOW()`,
      [accountId]
    );
  },

  /**
   * Log write operation
   */
  async logWrite(params: {
    accountId: string;
    appId?: string;
    operation: 'ipfs_upload' | 'relay_tx';
    creditsUsed: number;
    usedFreeAllocation: boolean;
    fileSizeMb?: number;
    endpoint?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO write_logs 
       (developer_account_id, app_id, operation, credits_used, used_free_allocation, file_size_mb, endpoint, request_metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        params.accountId,
        params.appId || null,
        params.operation,
        params.creditsUsed,
        params.usedFreeAllocation,
        params.fileSizeMb || null,
        params.endpoint || null,
        params.metadata ? JSON.stringify(params.metadata) : null,
      ]
    );
  },

  /**
   * Log credit purchase
   */
  async logCreditPurchase(params: {
    accountId: string;
    socialAmount: string;
    socialPriceUsd: number;
    creditsReceived: number;
    txHash: string;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO credit_purchases 
       (developer_account_id, social_amount, social_price_usd, credits_received, tx_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        params.accountId,
        params.socialAmount,
        params.socialPriceUsd,
        params.creditsReceived,
        params.txHash,
      ]
    );
  },

  /**
   * Get usage stats for developer
   */
  async getDeveloperStats(accountId: string, days: number = 30) {
    const result = await pool.query(
      `SELECT 
        COUNT(*) as total_writes,
        SUM(credits_used) as total_credits_spent,
        SUM(CASE WHEN used_free_allocation THEN 1 ELSE 0 END) as free_writes_used,
        SUM(CASE WHEN NOT used_free_allocation THEN 1 ELSE 0 END) as paid_writes,
        SUM(file_size_mb) as total_mb_uploaded
       FROM write_logs
       WHERE developer_account_id = $1 
         AND timestamp >= NOW() - INTERVAL '${days} days'`,
      [accountId]
    );
    return result.rows[0];
  },

  /**
   * Get usage breakdown by app
   */
  async getAppBreakdown(accountId: string, days: number = 7) {
    const result = await pool.query(
      `SELECT 
        COALESCE(app_id, 'no-app-id') as app_id,
        operation,
        COUNT(*) as writes,
        SUM(credits_used) as credits,
        SUM(file_size_mb) as total_mb
       FROM write_logs
       WHERE developer_account_id = $1 
         AND timestamp >= NOW() - INTERVAL '${days} days'
       GROUP BY app_id, operation
       ORDER BY credits DESC`,
      [accountId]
    );
    return result.rows;
  },

  /**
   * Get platform-wide revenue stats
   */
  async getRevenueStats() {
    const result = await pool.query(`
      SELECT 
        SUM(credits_received) as total_credits_sold,
        SUM(credits_received * 0.01) as total_revenue_usd,
        COUNT(DISTINCT developer_account_id) as unique_buyers,
        COUNT(*) as total_purchases
      FROM credit_purchases
      WHERE timestamp >= date_trunc('month', NOW())
    `);
    return result.rows[0];
  },

  /**
   * Update developer tier
   */
  async updateTier(accountId: string, tier: string, lockedUsdValue: number): Promise<void> {
    await pool.query(
      'UPDATE developers SET tier = $1, locked_usd_value = $2 WHERE account_id = $3',
      [tier, lockedUsdValue, accountId]
    );
  },

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch (error) {
      logger.error({ error }, 'Database health check failed');
      return false;
    }
  },

  /**
   * Get pool for transactions
   */
  getPool() {
    return pool;
  },
};

export default db;
