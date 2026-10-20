import { describe, expect, it } from 'vitest';
import {
  osAffixChromeClassName,
  osFieldBorderedClassName,
  osFieldClassName,
  osFieldPlainClassName,
  osFieldPlainRuleClassName,
  osFieldPlainValueClassName,
  osFieldSoftClassName,
} from './os-field.js';

describe('os-field class names', () => {
  it('exports stable chrome class names', () => {
    expect(osFieldBorderedClassName).toBe('os-field-bordered');
    expect(osFieldSoftClassName).toBe('os-field-soft');
    expect(osFieldPlainClassName).toBe('os-field-plain');
    expect(osFieldPlainValueClassName).toBe('os-field-plain-value');
    expect(osFieldPlainRuleClassName).toBe('os-field-plain-rule');
    expect(osFieldClassName).toBe('os-field');
    expect(osAffixChromeClassName('bordered')).toBe('os-field-bordered');
    expect(osAffixChromeClassName('soft')).toBe('os-field-soft');
    expect(osAffixChromeClassName('plain')).toBe('os-field-plain');
  });
});
