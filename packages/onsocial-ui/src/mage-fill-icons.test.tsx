import { describe, expect, it } from 'vitest';
import {
  UserPlusFillIcon,
  InformationCircleFillIcon,
  DotsCircleFillIcon,
  FireFillIcon,
  ShopFillIcon,
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
    expect(typeof UserPlusFillIcon).toBe('function');
    expect(typeof InformationCircleFillIcon).toBe('function');
    expect(typeof DotsCircleFillIcon).toBe('function');
    expect(typeof FireFillIcon).toBe('function');
    expect(typeof ShopFillIcon).toBe('function');
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
