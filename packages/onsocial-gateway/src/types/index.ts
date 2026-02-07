import type { Request } from 'express';

export type Tier = 'free' | 'pro';

export interface TierInfo {
  tier: Tier;
  rateLimit: number;
}

export interface JwtPayload {
  accountId: string;
  tier: Tier;
  iat: number;
  exp: number;
}

export interface AuthRequest extends Request {
  auth?: JwtPayload;
}
