import type { Request } from 'express';

export type Tier = 'free' | 'pro' | 'scale' | 'service';

export type AuthMethod = 'jwt' | 'apikey';

export interface TierInfo {
  tier: Tier;
  rateLimit: number;
}

export interface JwtPayload {
  accountId: string;
  tier: Tier;
  /** Token purpose: 'access' for API calls, 'refresh' for silent renewal. */
  kind?: 'access' | 'refresh';
  /** How the request was authenticated */
  method?: AuthMethod;
  iat: number;
  exp: number;
}

export interface AuthRequest extends Request {
  auth?: JwtPayload;
}

// ---------------------------------------------------------------------------
// Contract auth
//
// All contract writes are NEP-366 SignedDelegateActions submitted via
// `/relay/delegate`. The user's session key signs the inner FunctionCall
// and the relayer broadcasts as `Action::Delegate(...)`. From the contract's
// view, `predecessor_account_id == signer_id == delegate.sender_id`.
//
// The gateway never impersonates users — the legacy Direct/Intent/DelegateAction
// passthroughs have been removed.
// ---------------------------------------------------------------------------
