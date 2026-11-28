'use client';

import { useState } from 'react';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { FeedArticleReadScreen } from '@/features/home/feed-article-read-screen';
import { useFeedReadBridge } from '@/features/home/feed-read-bridge';
import type { FeedReadFace } from '@/features/home/feed-read-face';
import {
  PostEngagementRow,
  type PostEngagementRowBaseProps,
} from '@/features/home/post-card-engagement';
import { PostLayerOwnerZProvider } from '@/features/home/post-layer-owner-z';
import { WritingReadDocument } from '@/features/scarces/scarce-writing-read-sheet';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { accountIdsEqual } from '@/lib/account-match';
import { postKey } from '@/lib/post-display';
import { resolveGlassSheetZIndex } from '@onsocial/ui';

/**
 * Feed Read on the place stack. Same slide-over as a drop Read, with this
 * post's engagement footer. The card does not paint a second screen.
 */
export function FeedReadLayerScreen({
  face,
  zIndex,
  openedAboveMediaFace,
  parked,
  open,
  onClose,
  onClosed,
  onLeave,
}: {
  face: FeedReadFace;
  zIndex: number;
  openedAboveMediaFace: boolean;
  /** Profile or post is the screen. Keep this reader mounted underneath. */
  parked: boolean;
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
  onLeave: (href: string) => void;
}) {
  const bridge = useFeedReadBridge(postKey(face.post));
  const profiles = usePostAuthorProfiles([face.body.accountId]);
  const { accountId: viewerAccountId } = useAppWallet();
  const [threadOpen, setThreadOpen] = useState(false);
  const renderedZ = resolveGlassSheetZIndex(zIndex, openedAboveMediaFace);
  const authorProfile =
    profiles[face.body.accountId] ??
    (accountIdsEqual(face.body.accountId, face.post.accountId)
      ? bridge?.authorProfile
      : undefined);
  const book = face.book;
  const engagement: PostEngagementRowBaseProps | null = bridge
    ? {
        post: face.post,
        engagement: bridge.engagement,
        countsReady: bridge.countsReady,
        reactionPending: bridge.reactionPending,
        savePending: bridge.savePending,
        sharePending: bridge.sharePending,
        onReply: () => setThreadOpen(true),
        onQuote: bridge.onQuote,
        onRepost: bridge.onRepost,
        onUndoRepost: bridge.onUndoRepost,
        onToggleReaction: bridge.onToggleReaction,
        onToggleSave: bridge.onToggleSave,
      }
    : null;

  return (
    <PostLayerOwnerZProvider value={renderedZ}>
      <FeedArticleReadScreen
        open={open}
        parked={parked}
        onPlaceLeave={onLeave}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        onClosed={onClosed}
        post={face.body}
        authorProfile={authorProfile}
        documentTitle={face.documentTitle ?? undefined}
        threadOpen={threadOpen}
        onDismissThread={() => setThreadOpen(false)}
        threadAuthor={face.post.accountId}
        threadPostId={face.post.postId}
        threadRoot={face.post}
        renderBody={
          face.holding
            ? () => null
            : book
              ? ({ onChromeTap }) => (
                  <WritingReadDocument
                    open={open}
                    title={book.title}
                    cover={book.cover}
                    coverSvg={book.coverSvg}
                    collectionId={book.collectionId}
                    accountId={viewerAccountId}
                    creatorId={book.creatorId}
                    sourcePostPath={book.sourcePostPath}
                    readables={book.readables}
                    bookPdf={book.bookPdf}
                    writingFormat={book.writingFormat}
                    hydrateSettled
                    onChromeTap={onChromeTap}
                  />
                )
              : undefined
        }
        commerce={bridge?.commerce ?? null}
        engagement={
          engagement && bridge ? (
            <PostEngagementRow
              {...engagement}
              shareHref={bridge.shareHref}
              shareTitle={bridge.shareTitle}
              onAmplify={bridge.onAmplify}
              shareDrawerZIndex={renderedZ}
            />
          ) : null
        }
      />
    </PostLayerOwnerZProvider>
  );
}
