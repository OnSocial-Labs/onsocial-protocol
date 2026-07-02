import { describe, expect, it } from 'vitest';
import {
  osFloatingPanelItemClassName,
  osFloatingPanelMenuAlignClassName,
} from './floating-panel.js';
import { FloatingPanelMenu } from './floating-panel-menu.js';

describe('floating panel', () => {
  it('exports panel class names', () => {
    expect(osFloatingPanelItemClassName).toBe('os-floating-panel-item');
    expect(osFloatingPanelMenuAlignClassName('left')).toBe(
      'os-floating-panel-menu--align-left'
    );
  });

  it('exports FloatingPanelMenu component', () => {
    expect(FloatingPanelMenu).toBeTruthy();
  });
});
