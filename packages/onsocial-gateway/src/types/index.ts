import type { Request } from 'express';

export type Tier = 'free' | 'pro' | 'scale';

export type AuthMethod = 'jwt' | 'apikey';

export interface TierInfo {
  tier: Tier;
  rateLimit: number;
}

export interface JwtPayload {
  accountId: string;
  tier: Tier;
  /** How the request was authenticated */
  method?: AuthMethod;
  iat: number;
  exp: number;
}

export interface AuthRequest extends Request {
  auth?: JwtPayload;
}
