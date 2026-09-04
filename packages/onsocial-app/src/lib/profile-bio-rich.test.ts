import { describe, expect, it } from 'vitest';
import {
  continueProfileBioListOnEnter,
  isProfileBioRangeHeading,
  isProfileBioRangeItalic,
  isProfileBioRangeList,
  profileAboutBlocks,
  profileBioHtmlToMarkdown,
  profileBioMarkdownToHtml,
  profileBioPlainPreview,
  splitProfileBioInlineDisplayRuns,
  toggleProfileBioHeading,
  toggleProfileBioItalic,
  toggleProfileBioList,
} from '@/lib/profile-bio-rich';

describe('toggleProfileBioItalic', () => {
  it('wraps a selection', () => {
    expect(toggleProfileBioItalic('hello world', 6, 11)).toEqual({
      text: 'hello *world*',
      start: 7,
      end: 12,
    });
  });

  it('unwraps when the caret is inside italic', () => {
    expect(toggleProfileBioItalic('hello *world*', 8, 8)).toEqual({
      text: 'hello world',
      start: 7,
      end: 7,
    });
  });

  it('does not treat bold markers as italic', () => {
    expect(toggleProfileBioItalic('see **you** later', 6, 9)).toEqual({
      text: 'see ***you*** later',
      start: 7,
      end: 10,
    });
  });

  it('wraps the word under the caret when there is no selection', () => {
    expect(toggleProfileBioItalic('hello there', 1, 1)).toEqual({
      text: '*hello* there',
      start: 1,
      end: 6,
    });
  });

  it('does not insert an empty nest between words', () => {
    expect(toggleProfileBioItalic('hi ', 3, 3)).toEqual({
      text: 'hi ',
      start: 3,
      end: 3,
    });
  });
});

describe('splitProfileBioInlineDisplayRuns', () => {
  it('parses bold then italic', () => {
    expect(
      splitProfileBioInlineDisplayRuns('see **you** and *me* later')
    ).toEqual([
      { bold: false, italic: false, value: 'see ' },
      { bold: true, italic: false, value: 'you' },
      { bold: false, italic: false, value: ' and ' },
      { bold: false, italic: true, value: 'me' },
      { bold: false, italic: false, value: ' later' },
    ]);
  });
});

describe('isProfileBioRangeItalic', () => {
  it('is true only inside the inner run', () => {
    expect(isProfileBioRangeItalic('*hi*', 1, 3)).toBe(true);
    expect(isProfileBioRangeItalic('*hi*', 0, 1)).toBe(false);
    expect(isProfileBioRangeItalic('**hi**', 2, 4)).toBe(false);
  });
});

describe('toggleProfileBioHeading', () => {
  it('prefixes the current line', () => {
    expect(toggleProfileBioHeading('Hello\nthere', 0, 0)).toEqual({
      text: '# Hello\nthere',
      start: 2,
      end: 2,
    });
  });

  it('unwraps an existing heading', () => {
    expect(toggleProfileBioHeading('# Hello\nthere', 2, 2)).toEqual({
      text: 'Hello\nthere',
      start: 0,
      end: 0,
    });
  });

  it('does not turn #near into a heading', () => {
    expect(toggleProfileBioHeading('#near forever', 1, 1)).toEqual({
      text: '#near forever',
      start: 1,
      end: 1,
    });
    expect(toggleProfileBioHeading('#', 0, 0)).toEqual({
      text: '#',
      start: 0,
      end: 0,
    });
  });
});

describe('toggleProfileBioList', () => {
  it('prefixes selected lines', () => {
    expect(toggleProfileBioList('one\ntwo', 0, 7)).toEqual({
      text: '• one\n• two',
      start: 2,
      end: 11,
    });
  });

  it('unwraps list lines', () => {
    expect(toggleProfileBioList('• one\n• two', 0, 11)).toEqual({
      text: 'one\ntwo',
      start: 0,
      end: 7,
    });
  });
});

describe('heading and list active ranges', () => {
  it('reads the current line', () => {
    expect(isProfileBioRangeHeading('# Hello\nthere', 3, 3)).toBe(true);
    expect(isProfileBioRangeHeading('#near\nthere', 1, 1)).toBe(false);
    expect(isProfileBioRangeList('- one\ntwo', 2, 2)).toBe(true);
    expect(isProfileBioRangeList('one\ntwo', 1, 1)).toBe(false);
  });
});

describe('profileAboutBlocks', () => {
  it('keeps blank-line paragraphs', () => {
    expect(
      profileAboutBlocks('First graph.\n\nSecond graph.\nStill second.')
    ).toEqual([
      { type: 'paragraph', text: 'First graph.' },
      { type: 'paragraph', text: 'Second graph.\nStill second.' },
    ]);
  });

  it('turns "# Title" into a heading and leaves #near as prose', () => {
    expect(
      profileAboutBlocks('# Work\n\nI build on #near.\n\n#near forever')
    ).toEqual([
      { type: 'heading', text: 'Work' },
      { type: 'paragraph', text: 'I build on #near.' },
      { type: 'paragraph', text: '#near forever' },
    ]);
  });

  it('groups dash lists and still allows italic in items', () => {
    expect(
      profileAboutBlocks('Before\n- one *two*\n- three\n\nAfter')
    ).toEqual([
      { type: 'paragraph', text: 'Before' },
      { type: 'list', items: ['one *two*', 'three'] },
      { type: 'paragraph', text: 'After' },
    ]);
  });

  it('does not treat a lone hash or empty dash as structure', () => {
    expect(profileAboutBlocks('#\n- \nOnly one.')).toEqual([
      { type: 'paragraph', text: '#' },
      { type: 'paragraph', text: 'Only one.' },
    ]);
  });
});

describe('profileBioPlainPreview', () => {
  it('strips marks and flattens lists for one-line teasers', () => {
    expect(
      profileBioPlainPreview('Ship **UI**.\n- React\n- *TS*')
    ).toBe('Ship UI. React TS');
  });
});

describe('continueProfileBioListOnEnter', () => {
  it('continues a bullet under the caret', () => {
    expect(continueProfileBioListOnEnter('• React', 7, 7)).toEqual({
      text: '• React\n• ',
      start: 10,
      end: 10,
    });
  });

  it('exits the list on an empty bullet', () => {
    expect(continueProfileBioListOnEnter('• React\n• ', 10, 10)).toEqual({
      text: '• React\n',
      start: 8,
      end: 8,
    });
  });
});

type FakeNode = {
  nodeType: number;
  nodeName: string;
  tagName: string;
  textContent: string;
  childNodes: FakeNode[];
  children: FakeNode[];
};

function textNode(value: string): FakeNode {
  return {
    nodeType: 3,
    nodeName: '#text',
    tagName: '',
    textContent: value,
    childNodes: [],
    children: [],
  };
}

function element(tag: string, children: FakeNode[] = []): FakeNode {
  const upper = tag.toUpperCase();
  const node: FakeNode = {
    nodeType: 1,
    nodeName: upper,
    tagName: upper,
    textContent: '',
    childNodes: children,
    children: children.filter((child) => child.nodeType === 1),
  };
  node.textContent = children.map((child) => child.textContent).join('');
  return node;
}

function fragmentFromHtml(html: string): ParentNode {
  const root = element('div');
  let i = 0;

  const readUntil = (marker: string) => {
    const start = i;
    const at = html.indexOf(marker, i);
    if (at === -1) {
      i = html.length;
      return html.slice(start);
    }
    i = at;
    return html.slice(start, at);
  };

  const parseInline = (closeTag: string): FakeNode[] => {
    const nodes: FakeNode[] = [];
    while (i < html.length) {
      if (html.startsWith(closeTag, i)) {
        i += closeTag.length;
        break;
      }
      if (html.startsWith('<br>', i) || html.startsWith('<br/>', i)) {
        i += html.startsWith('<br/>', i) ? 5 : 4;
        nodes.push(element('br'));
        continue;
      }
      if (html.startsWith('<strong>', i)) {
        i += 8;
        nodes.push(element('strong', parseInline('</strong>')));
        continue;
      }
      if (html.startsWith('<em>', i)) {
        i += 4;
        nodes.push(element('em', parseInline('</em>')));
        continue;
      }
      if (html[i] === '<') {
        const end = html.indexOf('>', i);
        i = end === -1 ? html.length : end + 1;
        continue;
      }
      const text = readUntil('<');
      if (text) nodes.push(textNode(text));
    }
    return nodes;
  };

  while (i < html.length) {
    if (html.startsWith('<h3>', i)) {
      i += 4;
      root.childNodes.push(element('h3', parseInline('</h3>')));
      continue;
    }
    if (html.startsWith('<p>', i)) {
      i += 3;
      root.childNodes.push(element('p', parseInline('</p>')));
      continue;
    }
    if (html.startsWith('<ul>', i)) {
      i += 4;
      const items: FakeNode[] = [];
      while (i < html.length && !html.startsWith('</ul>', i)) {
        if (html.startsWith('<li>', i)) {
          i += 4;
          items.push(element('li', parseInline('</li>')));
          continue;
        }
        i += 1;
      }
      if (html.startsWith('</ul>', i)) i += 5;
      root.childNodes.push(element('ul', items));
      continue;
    }
    i += 1;
  }

  root.children = root.childNodes.filter((child) => child.nodeType === 1);
  return root as unknown as ParentNode;
}

describe('profileBio markdown html roundtrip', () => {
  it('roundtrips bold, italic, list, and heading', () => {
    const markdown = '# Hello\nSee **bold** and *italic*.\n• one\n• two';
    const html = profileBioMarkdownToHtml(markdown);
    expect(html).toBe(
      '<h3>Hello</h3><p>See <strong>bold</strong> and <em>italic</em>.</p><ul><li>one</li><li>two</li></ul>'
    );
    expect(profileBioHtmlToMarkdown(fragmentFromHtml(html))).toBe(markdown);
  });

  it('keeps Enter / trailing line breaks', () => {
    expect(
      profileBioHtmlToMarkdown(fragmentFromHtml('<p>Hello</p><p><br></p>'))
    ).toBe('Hello\n');
    expect(profileBioMarkdownToHtml('Hello\n')).toContain('<p><br></p>');
    expect(
      profileBioHtmlToMarkdown(fragmentFromHtml('<p>Hello<br></p>'))
    ).toContain('\n');
  });
});
