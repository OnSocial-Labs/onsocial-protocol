import { describe, expect, it } from 'vitest';
import {
  osProposalCardActionsClassName,
  osProposalCardBodyClassName,
  osProposalCardClassName,
  osProposalCardFooterClassName,
  osProposalCardListClassName,
  osProposalCardSepClassName,
  osProposalCardStripClassName,
  osProposalCardStripMainClassName,
} from './os-proposal-card.js';

describe('os-proposal-card class names', () => {
  it('exports stable chrome selectors', () => {
    expect(osProposalCardListClassName).toBe('os-proposal-card-list');
    expect(osProposalCardClassName).toBe('os-proposal-card');
    expect(osProposalCardStripClassName).toBe('os-proposal-card-strip');
    expect(osProposalCardStripMainClassName).toBe(
      'os-proposal-card-strip-main'
    );
    expect(osProposalCardSepClassName).toBe('os-proposal-card-sep');
    expect(osProposalCardBodyClassName).toBe('os-proposal-card-body');
    expect(osProposalCardFooterClassName).toBe('os-proposal-card-footer');
    expect(osProposalCardActionsClassName).toBe('os-proposal-card-actions');
  });
});
