import { describe, expect, it } from 'vitest';
import {
  OsChromeSubject,
  osChromeSubjectClassName,
} from './os-chrome-subject.js';

describe('OsChromeSubject', () => {
  it('exports the chrome subject cluster', () => {
    expect(typeof OsChromeSubject).toBe('function');
    expect(osChromeSubjectClassName).toBe('os-chrome-subject');
  });
});
