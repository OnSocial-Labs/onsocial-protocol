import { describe, expect, it } from 'vitest';
import { composeDockAriaLabel } from '@/components/portfolio/portfolio-summon-compose-button';

describe('composeDockAriaLabel', () => {
  it('names each dock action', () => {
    expect(composeDockAriaLabel('post')).toBe('Compose a post');
    expect(composeDockAriaLabel('announce')).toBe('Post this drop');
    expect(composeDockAriaLabel('drop')).toBe('Start a drop');
    expect(composeDockAriaLabel('mint')).toBe('Mint');
    expect(composeDockAriaLabel('propose')).toBe('Create a proposal');
  });
});
