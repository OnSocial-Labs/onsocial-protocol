import type { PostRow } from '@onsocial/sdk';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

const POST_ROW_SELECTION = `
  accountId postId value blockHeight blockTimestamp receiptId
  parentPath parentAuthor parentType refPath refAuthor refType channel kind audiences
  groupId isGroupContent
`;

/** Indexed personal post by author + id (`isGroupContent: false`). */
export async function fetchPersonalPost(ref: {
  author: string;
  postId: string;
}): Promise<PostRow | null> {
  const client = createReadOnlyOnSocialClient();
  const res = await client.query.graphql<{ postsCurrent: PostRow[] }>({
    query: `query PersonalPost($accountId: String!, $postId: String!) {
      postsCurrent(
        where: {
          accountId: {_eq: $accountId},
          postId: {_eq: $postId},
          isGroupContent: {_eq: false}
        },
        limit: 1,
        orderBy: [{blockHeight: DESC}]
      ) {
        ${POST_ROW_SELECTION}
      }
    }`,
    variables: {
      accountId: ref.author,
      postId: ref.postId,
    },
  });
  return res.data?.postsCurrent?.[0] ?? null;
}
