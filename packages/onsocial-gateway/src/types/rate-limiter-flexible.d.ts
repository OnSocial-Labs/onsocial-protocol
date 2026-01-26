declare module 'rate-limiter-flexible' {
  export class RateLimiterMemory {
    constructor(opts: {
      points: number;
      duration: number;
      blockDuration?: number;
    });
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
