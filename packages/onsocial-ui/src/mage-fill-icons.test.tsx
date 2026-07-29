import { describe, expect, it } from 'vitest';
import {
  CopyFillIcon,
  TrashFillIcon,
  UserFillIcon,
  UserMinusFillIcon,
  UserPlusFillIcon,
  InformationCircleFillIcon,
  DotsCircleFillIcon,
  FireBFillIcon,
  FireFillIcon,
  TimeFillIcon,
  ShopFillIcon,
  StarMovingFillIcon,
  UsersFillIcon,
  HomeFillIcon,
  SearchFillIcon,
  GlobeFillIcon,
  GiftFillIcon,
  HeartFillIcon,
  PenFillIcon,
  MessageFillIcon,
  UserCircleFillIcon,
} from './mage-fill-icons.js';

describe('mage fill icons', () => {
  it('exports icon components', () => {
    expect(typeof CopyFillIcon).toBe('function');
    expect(typeof TrashFillIcon).toBe('function');
    expect(typeof UserFillIcon).toBe('function');
    expect(typeof UserMinusFillIcon).toBe('function');
    expect(typeof UserPlusFillIcon).toBe('function');
    expect(typeof InformationCircleFillIcon).toBe('function');
    expect(typeof DotsCircleFillIcon).toBe('function');
    expect(typeof FireBFillIcon).toBe('function');
    expect(typeof FireFillIcon).toBe('function');
    expect(typeof TimeFillIcon).toBe('function');
    expect(typeof ShopFillIcon).toBe('function');
    expect(typeof StarMovingFillIcon).toBe('function');
    expect(typeof UsersFillIcon).toBe('function');
    expect(typeof HomeFillIcon).toBe('function');
    expect(typeof SearchFillIcon).toBe('function');
    expect(typeof GlobeFillIcon).toBe('function');
    expect(typeof GiftFillIcon).toBe('function');
    expect(typeof HeartFillIcon).toBe('function');
    expect(typeof PenFillIcon).toBe('function');
    expect(typeof MessageFillIcon).toBe('function');
    expect(typeof UserCircleFillIcon).toBe('function');
  });
});
