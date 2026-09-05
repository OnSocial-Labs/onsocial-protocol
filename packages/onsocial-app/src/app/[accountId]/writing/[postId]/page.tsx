import type { Metadata } from 'next';
import { PortfolioWritingArticleScreen } from '@/components/portfolio/portfolio-writing-article-screen';
import { PortfolioWritingScreen } from '@/components/portfolio/portfolio-writing-screen';
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
  const article = post ? parseArticleSnapshot(post.value) : null;
  if (!article || !post) {
    return {
      title: `Writing · ${titleLabel}`,
      description: `Articles by ${titleLabel}.`,
      alternates: {
        canonical: `/@${encodeURIComponent(accountId)}/writing`,
      },
    };
  }
  return {
    title: `${article.title} · ${titleLabel}`,
    description: `${article.title} by ${titleLabel}.`,
    alternates: {
      canonical: `/@${encodeURIComponent(accountId)}/writing/${encodeURIComponent(post.postId)}`,
    },
  };
}

export default async function PortfolioWritingArticlePage({
  params,
}: WritingArticlePageProps) {
  const { mood, accountId, titleLabel, avatarUrl, post, articles } =
    await loadPortfolioWritingArticlePage(params);
  if (!post) {
    return (
      <PortfolioWritingScreen
        mood={mood}
        accountId={accountId}
        titleLabel={titleLabel}
        avatarUrl={avatarUrl}
        articles={articles}
      />
    );
  }
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
