# Social-OnSocial Contract

The `social-onsocial` contract enables social media interactions within the OnSocial Protocol.

## Key Features

- **Post Creation**: Allow users to create posts.
- **Post Engagement**: Enable users to like and interact with posts.

## Key Methods

- `create_post`: Create a new post with content.
- `like_post`: Like an existing post.

## Deployment

To deploy the contract:

```bash
make deploy CONTRACT=social-onsocial NETWORK=sandbox AUTH_ACCOUNT=test.near
```

## Testing

Run the tests for this contract:

```bash
make test-unit CONTRACT=social-onsocial
```