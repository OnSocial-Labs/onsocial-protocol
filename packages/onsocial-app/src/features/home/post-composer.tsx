'use client';

import { useCallback, useState } from 'react';
import { useOnSocialWriter } from '@/hooks/use-onsocial-writer';

interface PostComposerProps {
  onPosted?: () => void;
}

export function PostComposer({ onPosted }: PostComposerProps) {
  const { isConnected, isLoading, withClient } = useOnSocialWriter();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { client } = await withClient();
      await client.posts.create({ text: trimmed });
      setText('');
      onPosted?.();
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'Could not publish post.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, onPosted, text, withClient]);

  if (isLoading) {
    return <div className="post-composer is-loading" aria-hidden />;
  }

  if (!isConnected) {
    return (
      <section className="post-composer post-composer-guest">
        <p className="post-composer-lead">Connect your wallet to post.</p>
      </section>
    );
  }

  return (
    <section className="post-composer">
      <label className="post-composer-label" htmlFor="home-compose">
        Share something
      </label>
      <textarea
        id="home-compose"
        className="post-composer-input"
        rows={3}
        placeholder="What's happening on NEAR?"
        value={text}
        disabled={isSubmitting}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="post-composer-actions">
        <button
          type="button"
          className="post-composer-submit"
          disabled={isSubmitting || !text.trim()}
          onClick={() => void submit()}
        >
          {isSubmitting ? 'Publishing…' : 'Post'}
        </button>
      </div>
      {error ? <p className="post-composer-error">{error}</p> : null}
    </section>
  );
}
