import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  THEME_BAR_DARK,
  THEME_BAR_LIGHT,
  THEME_CANVAS_DARK,
  THEME_CANVAS_LIGHT,
  themeInitScript,
} from '@/lib/theme-init';

function runThemeScript(options: {
  stored?: string | null;
  light?: boolean;
  installed?: boolean;
  iosStandalone?: boolean;
}) {
  const context = vm.createContext({
    stored: options.stored ?? null,
    light: Boolean(options.light),
    installed: Boolean(options.installed),
    iosStandalone: Boolean(options.iosStandalone),
    result: {
      theme: '',
      colorScheme: '',
      canvas: '',
      metas: [] as Array<{ content: string; media: string | null }>,
    },
  });
  vm.runInContext(
    `
    var metas = [
      { content: ${JSON.stringify(THEME_BAR_LIGHT)}, media: '(prefers-color-scheme: light)' },
      { content: ${JSON.stringify(THEME_BAR_DARK)}, media: '(prefers-color-scheme: dark)' }
    ];
    var styles = [];
    var root = {
      theme: 'dark',
      style: {},
      getAttribute: function (name) { return name === 'data-theme' ? this.theme : null; },
      setAttribute: function (name, value) { if (name === 'data-theme') this.theme = value; }
    };
    var document = {
      documentElement: root,
      head: { appendChild: function (node) { if (node && node.id) styles.push(node); } },
      getElementById: function (id) {
        for (var i = 0; i < styles.length; i++) if (styles[i].id === id) return styles[i];
        return null;
      },
      createElement: function (tag) {
        if (tag === 'style') return { id: '', textContent: '' };
        return {
          setAttribute: function (name, value) {
            if (name === 'name') this.name = value;
            if (name === 'content') this.content = value;
            if (name === 'media') this.media = value;
            if (this.name === 'theme-color') metas.push(this);
          }
        };
      },
      querySelectorAll: function () {
        return metas.map(function (meta) {
          return {
            setAttribute: function (name, value) {
              if (name === 'content') meta.content = value;
              if (name === 'media') meta.media = value;
            }
          };
        });
      }
    };
    var localStorage = { getItem: function () { return stored; } };
    var navigator = { standalone: iosStandalone };
    var window = {
      matchMedia: function (query) {
        var standaloneQuery = String(query).indexOf('display-mode: standalone') !== -1;
        return {
          matches: standaloneQuery ? installed : light,
          addEventListener: function () {}
        };
      }
    };
    var MutationObserver = function () { this.observe = function () {}; };
    ${themeInitScript}
    result.theme = root.theme;
    result.colorScheme = root.style.colorScheme || '';
    result.canvas = styles[0] ? styles[0].textContent : '';
    result.metas = metas.map(function (meta) { return { content: meta.content, media: meta.media }; });
    `,
    context
  );
  return context.result as {
    theme: string;
    colorScheme: string;
    canvas: string;
    metas: Array<{ content: string; media: string | null }>;
  };
}

describe('theme init script', () => {
  it('paints a light bar and canvas when the stored theme is light', () => {
    const painted = runThemeScript({ stored: 'light' });
    expect(painted.theme).toBe('light');
    expect(painted.colorScheme).toBe('light');
    expect(painted.canvas).toContain(THEME_CANVAS_LIGHT);
    expect(painted.metas.map((meta) => meta.content)).toEqual([
      THEME_BAR_LIGHT,
      THEME_BAR_LIGHT,
    ]);
  });

  it('keeps the dark bar when the stored theme is dark on a light system', () => {
    const painted = runThemeScript({ stored: 'dark', light: true });
    expect(painted.theme).toBe('dark');
    expect(painted.canvas).toContain(THEME_CANVAS_DARK);
    expect(painted.metas.map((meta) => meta.content)).toEqual([
      THEME_BAR_DARK,
      THEME_BAR_DARK,
    ]);
  });

  it('leaves both media colors when the person has not chosen', () => {
    const painted = runThemeScript({ stored: null, light: true });
    expect(painted.theme).toBe('light');
    expect(painted.metas).toEqual([
      {
        content: THEME_BAR_LIGHT,
        media: '(prefers-color-scheme: light)',
      },
      {
        content: THEME_BAR_DARK,
        media: '(prefers-color-scheme: dark)',
      },
    ]);
  });

  it('stays dark in a standalone install when nothing is stored', () => {
    const painted = runThemeScript({
      stored: null,
      light: true,
      installed: true,
    });
    expect(painted.theme).toBe('dark');
    expect(painted.colorScheme).toBe('dark');
    expect(painted.canvas).toContain(THEME_CANVAS_DARK);
    expect(painted.metas.map((meta) => meta.content)).toEqual([
      THEME_BAR_DARK,
      THEME_BAR_DARK,
    ]);
  });

  it('stays dark when iOS reports navigator.standalone and nothing is stored', () => {
    const painted = runThemeScript({
      stored: null,
      light: true,
      iosStandalone: true,
    });
    expect(painted.theme).toBe('dark');
    expect(painted.canvas).toContain(THEME_CANVAS_DARK);
    expect(painted.metas.map((meta) => meta.content)).toEqual([
      THEME_BAR_DARK,
      THEME_BAR_DARK,
    ]);
  });

  it('keeps a stored light theme in a standalone install', () => {
    const painted = runThemeScript({
      stored: 'light',
      light: true,
      installed: true,
    });
    expect(painted.theme).toBe('light');
    expect(painted.colorScheme).toBe('light');
    expect(painted.canvas).toContain(THEME_CANVAS_LIGHT);
    expect(painted.metas.map((meta) => meta.content)).toEqual([
      THEME_BAR_LIGHT,
      THEME_BAR_LIGHT,
    ]);
  });
});
