import type { Metadata } from 'next';
import { PortfolioWritingArticleScreen } from '@/components/portfolio/portfolio-writing-article-screen';
import { parseArticleSnapshot } from '@/lib/article-post-payload';
import { loadPortfolioWritingArticlePage } from '@/lib/load-portfolio-writing';

type WritingArticlePageProps = {
  params: Promise<{ accountId: string; postId: string }>;
};

export async function generateMetadata({
  params,
}: WritingArticlePageProps): Promise<Metadata> {
  const { titleLabel, accountId, post } =
    await loadPortfolioWritingArticlePage(params);
  const article = parseArticleSnapshot(post.value);
  const title = article?.title ?? 'Article';
  return {
    title: `${title} · ${titleLabel}`,
    description: article?.title
      ? `${article.title} by ${titleLabel}.`
      : `Article by ${titleLabel}.`,
    alternates: {
      canonical: `/@${encodeURIComponent(accountId)}/writing/${encodeURIComponent(post.postId)}`,
    },
  };
}

export default async function PortfolioWritingArticlePage({
  params,
}: WritingArticlePageProps) {
  const { mood, accountId, titleLabel, avatarUrl, post } =
    await loadPortfolioWritingArticlePage(params);
  return (
    <PortfolioWritingArticleScreen
      mood={mood}
      accountId={accountId}
      titleLabel={titleLabel}
      avatarUrl={avatarUrl}
      post={post}
    />
  );
}
