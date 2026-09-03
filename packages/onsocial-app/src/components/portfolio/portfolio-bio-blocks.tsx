'use client';

import { PostRichText } from '@/features/home/post-rich-text';
import { profileAboutBlocks } from '@/lib/profile-bio-rich';

export function PortfolioBioBlocks({
  text,
  headingAs = 'h2',
}: {
  text: string;
  headingAs?: 'h2' | 'p';
}) {
  const blocks = profileAboutBlocks(text);
  if (blocks.length === 0) return null;
  const HeadingTag = headingAs;

  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return (
            <HeadingTag
              key={`${index}-${block.text.slice(0, 24)}`}
              className="portfolio-about-heading"
            >
              <PostRichText
                text={block.text}
                emptyFallback=""
                showLinkIcon
                inlineMarks
              />
            </HeadingTag>
          );
        }
        if (block.type === 'list') {
          return (
            <ul
              key={`${index}-${block.items[0]?.slice(0, 24) ?? 'list'}`}
              className="portfolio-about-list"
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${itemIndex}-${item.slice(0, 24)}`}>
                  <PostRichText
                    text={item}
                    emptyFallback=""
                    showLinkIcon
                    inlineMarks
                  />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p
            key={`${index}-${block.text.slice(0, 24)}`}
            className="portfolio-about-bio"
          >
            <PostRichText
              text={block.text}
              emptyFallback=""
              showLinkIcon
              inlineMarks
            />
          </p>
        );
      })}
    </>
  );
}
