import type { PostRow } from '@onsocial/sdk';
import { accountIdsEqual } from '@/lib/account-match';
import {
  formatPostPeekExcerpt,
  parsePostText,
} from '@/lib/post-display';
import type { PostRelationContext } from '@/lib/post-relation';
import {
  formatPostRelationTarget,
  isRepostRefType,
  postRelationContext,
  relationTargetAccountIdFromPost,
} from '@/lib/post-relation';
import { postThreadPath } from '@/lib/post-routes';

export type LauncherPostPeekSource = {
  author: string;
  postId: string;
  value: string;
  blockTimestamp: number;
  href: string;
  refType?: string;
  refPath?: string;
  refAuthor?: string;
  parentPath?: string;
  parentAuthor?: string;
  kind?: string | null;
};

export type LauncherPostPeekDisplay = {
  accountId: string;
  excerpt: string;
  href: string;
  relation: PostRelationContext | null;
  repostAttribution: string | null;
};

export function launcherRepostAttributionLabel(input: {
  reposterAccountId: string;
  reposterDisplayName?: string | null;
  viewerAccountId?: string | null;
  contentAccountId: string;
}): string {
  const reposter = input.reposterAccountId.trim();
  const contentAuthor = input.contentAccountId.trim();
  if (
    input.viewerAccountId &&
    accountIdsEqual(input.viewerAccountId, reposter)
  ) {
    return 'You reposted';
  }
  if (accountIdsEqual(reposter, contentAuthor)) {
    return 'Reposted';
  }
  const name = input.reposterDisplayName?.trim() || reposter;
  return `${name} reposted`;
}

/** Account id for reply / quote relation targets on launcher peeks. */
export function relationTargetAccountId(
  peek: Pick<
    LauncherPostPeekSource,
    'author' | 'parentPath' | 'parentAuthor'
  >
): string | null {
  return relationTargetAccountIdFromPost({
    accountId: peek.author,
    parentPath: peek.parentPath,
    parentAuthor: peek.parentAuthor,
  });
}

export const formatLauncherRelationTarget = formatPostRelationTarget;

export function launcherRelationLead(input: {
  relation?: PostRelationContext | null;
  repostAttribution?: string | null;
  relationTargetProfileName?: string | null;
}): string | null {
  if (input.repostAttribution) return input.repostAttribution;
  if (!input.relation) return null;
  if (input.relation.kind === 'repost') return input.relation.label;
  const target = formatLauncherRelationTarget(
    input.relation.handle,
    input.relationTargetProfileName
  );
  return `${input.relation.verb} ${target.label}`;
}

function excerptForPost(
  post: Pick<LauncherPostPeekSource, 'value' | 'kind' | 'postId'>
): string {
  return formatPostPeekExcerpt(post.value ?? '', {
    kind: post.kind,
    postId: post.postId,
  });
}

/**
 * Match feed-thread repost shells: bare reposts render the original author +
 * excerpt with a single `{name} reposted` line — never name twice.
 */
export function resolveLauncherPostPeekDisplay(input: {
  peek: LauncherPostPeekSource;
  resolvedByPath: Record<string, PostRow>;
  viewerAccountId?: string | null;
  authorDisplayName?: string | null;
}): LauncherPostPeekDisplay {
  const { peek, resolvedByPath, viewerAccountId, authorDisplayName } = input;
  const original =
    peek.refPath && isRepostRefType(peek.refType)
      ? resolvedByPath[peek.refPath]
      : undefined;
  const bareRepostShell =
    isRepostRefType(peek.refType) &&
    Boolean(peek.refPath) &&
    !parsePostText(peek.value).trim();

  if (bareRepostShell && original) {
    return {
      accountId: original.accountId,
      excerpt: excerptForPost(original),
      href: postThreadPath(original),
      relation: null,
      repostAttribution: launcherRepostAttributionLabel({
        reposterAccountId: peek.author,
        reposterDisplayName: authorDisplayName,
        viewerAccountId,
        contentAccountId: original.accountId,
      }),
    };
  }

  if (bareRepostShell) {
    return {
      accountId: peek.author,
      excerpt: excerptForPost(peek),
      href: peek.href,
      relation: null,
      repostAttribution: launcherRepostAttributionLabel({
        reposterAccountId: peek.author,
        reposterDisplayName: authorDisplayName,
        viewerAccountId,
        contentAccountId: peek.author,
      }),
    };
  }

  const relation = postRelationContext(
    { ...peek, accountId: peek.author },
    {
      viewerAccountId,
      authorName: authorDisplayName,
    }
  );

  if (relation?.kind === 'repost') {
    return {
      accountId: peek.author,
      excerpt: excerptForPost(peek),
      href: peek.href,
      relation: null,
      repostAttribution: launcherRepostAttributionLabel({
        reposterAccountId: peek.author,
        reposterDisplayName: authorDisplayName,
        viewerAccountId,
        contentAccountId: peek.author,
      }),
    };
  }

  return {
    accountId: peek.author,
    excerpt: excerptForPost(peek),
    href: peek.href,
    relation,
    repostAttribution: null,
  };
}
