import type { Request } from 'express';

export type Tier = 'free' | 'starter' | 'staker' | 'builder' | 'pro';

export interface TierInfo {
  tier: Tier;
  balance: string;
  rateLimit: number;
}

export interface JwtPayload {
  accountId: string;
  tier: Tier;
  appId?: string;  // Optional app tracking
  iat: number;
  exp: number;
}

export interface AuthRequest extends Request {
  auth?: JwtPayload;
}
