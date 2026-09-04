import { describe, expect, it } from 'vitest';
import {
  OS_RICH_CHIP_ATTR,
  richTextSegmentsToChipHtml,
} from './rich-text-chips.js';
import { profileBioHtmlToMarkdown } from './profile-bio-rich.js';

describe('richTextSegmentsToChipHtml', () => {
  it('wraps hashtag, mention, ticker, and url in chip spans', () => {
    const html = richTextSegmentsToChipHtml(
      'hi @alice.testnet $SOCIAL #gm see https://onsocial.id'
    );
    expect(html).toContain(
      `<span ${OS_RICH_CHIP_ATTR}="mention" class="os-mention">@alice.testnet</span>`
    );
    expect(html).toContain(
      `<span ${OS_RICH_CHIP_ATTR}="ticker" class="os-ticker">$SOCIAL</span>`
    );
    expect(html).toContain(
      `<span ${OS_RICH_CHIP_ATTR}="hashtag" class="os-hashtag">#gm</span>`
    );
    expect(html).toContain(
      `<span ${OS_RICH_CHIP_ATTR}="url" class="os-link">https://onsocial.id</span>`
    );
    expect(html).not.toContain('<a ');
  });

  it('escapes plain text and leaves incomplete urls plain', () => {
    expect(richTextSegmentsToChipHtml('a <b> & c')).toBe('a &lt;b&gt; &amp; c');
    expect(richTextSegmentsToChipHtml('www.onsocial')).toBe('www.onsocial');
  });

  it('does not emit chip markup into stored markdown via html serializer', () => {
    const chipHtml = `<p>hello <span ${OS_RICH_CHIP_ATTR}="hashtag" class="os-hashtag">#near</span> <strong>bold</strong></p>`;
    // Minimal ParentNode-like root for the serializer.
    const root = {
      childNodes: [
        {
          nodeType: 1,
          tagName: 'P',
          childNodes: [
            { nodeType: 3, textContent: 'hello ' },
            {
              nodeType: 1,
              tagName: 'SPAN',
              hasAttribute: (name: string) => name === OS_RICH_CHIP_ATTR,
              getAttribute: (name: string) =>
                name === OS_RICH_CHIP_ATTR ? 'hashtag' : null,
              childNodes: [{ nodeType: 3, textContent: '#near' }],
            },
            { nodeType: 3, textContent: ' ' },
            {
              nodeType: 1,
              tagName: 'STRONG',
              hasAttribute: () => false,
              getAttribute: () => null,
              childNodes: [{ nodeType: 3, textContent: 'bold' }],
            },
          ],
          children: [],
        },
      ],
    } as unknown as ParentNode;

    expect(profileBioHtmlToMarkdown(root)).toBe('hello #near **bold**');
    expect(chipHtml).toContain(OS_RICH_CHIP_ATTR);
  });
});
