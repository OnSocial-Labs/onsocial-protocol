export type Tier = 'free' | 'staker' | 'builder';

export interface TierInfo {
  tier: Tier;
  balance: string;
  rateLimit: number;
}

export interface JwtPayload {
  accountId: string;
  tier: Tier;
  iat: number;
  exp: number;
}

export interface AuthRequest extends Express.Request {
  auth?: JwtPayload;
}
