import { describe, expect, it } from 'vitest';
import {
  isPortfolioOwner,
  portfolioAccountFromPath,
} from './portfolio-owner-mark';

describe('portfolio owner mark', () => {
  it('reads the account from the face and from Writing', () => {
    expect(portfolioAccountFromPath('/@alice.testnet')).toBe('alice.testnet');
    expect(portfolioAccountFromPath('/@alice.testnet/writing')).toBe(
      'alice.testnet'
    );
    expect(portfolioAccountFromPath('/home')).toBe('');
  });

  it('matches the viewer without caring about case', () => {
    expect(isPortfolioOwner('Alice.testnet', 'alice.testnet')).toBe(true);
    expect(isPortfolioOwner('bob.testnet', 'alice.testnet')).toBe(false);
    expect(isPortfolioOwner('alice.testnet', null)).toBe(false);
  });
});
