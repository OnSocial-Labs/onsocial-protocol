declare module 'rate-limiter-flexible' {
  import type { Redis } from 'ioredis';

  export interface RateLimiterOpts {
    points: number;
    duration: number;
    blockDuration?: number;
    keyPrefix?: string;
    insuranceLimiter?: RateLimiterMemory;
  }

  export class RateLimiterMemory {
    constructor(opts: RateLimiterOpts);
    consume(key: string, points?: number): Promise<RateLimiterRes>;
    delete(key: string): Promise<boolean>;
    reward(key: string, points?: number): Promise<RateLimiterRes>;
    block(key: string, secDuration?: number): Promise<RateLimiterRes>;
    get(key: string): Promise<RateLimiterRes | null>;
  }

  export class RateLimiterRedis {
    constructor(opts: RateLimiterOpts & { storeClient: Redis });
    consume(key: string, points?: number): Promise<RateLimiterRes>;
    delete(key: string): Promise<boolean>;
    reward(key: string, points?: number): Promise<RateLimiterRes>;
    block(key: string, secDuration?: number): Promise<RateLimiterRes>;
    get(key: string): Promise<RateLimiterRes | null>;
  }

  export interface RateLimiterRes {
    msBeforeNext: number;
    remainingPoints: number;
    consumedPoints: number;
    isFirstInDuration: boolean;
  }
}
