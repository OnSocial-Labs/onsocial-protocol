#!/usr/bin/env python3
"""
Generate developer-focused social posts from commit messages using NEAR AI,
then publish to X (Twitter) and Telegram.

Triggered by GitHub Actions when a commit message contains [post].
"""

import json
import os
import re
import sys
import time

import requests
import tweepy


def parse_args() -> object:
    import argparse

    parser = argparse.ArgumentParser(description="Generate & publish social posts from commits.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Generate posts and print them, but don't publish to X or Telegram.",
    )
    return parser.parse_args()

# =============================================================================
# Config from environment
# =============================================================================

NEAR_AI_API_KEY = os.environ.get("NEAR_AI_API_KEY", "")

X_API_KEY = os.environ.get("X_API_KEY", "")
X_API_SECRET = os.environ.get("X_API_SECRET", "")
X_ACCESS_TOKEN = os.environ.get("X_ACCESS_TOKEN", "")
X_ACCESS_TOKEN_SECRET = os.environ.get("X_ACCESS_TOKEN_SECRET", "")

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")

# Strip the [post] tag from the message — it's a trigger, not content
COMMIT_MESSAGE = os.environ.get("COMMIT_MESSAGE", "").replace("[post]", "").strip()
COMMIT_SHA = os.environ.get("COMMIT_SHA", "")[:7]
REPO_URL = os.environ.get(
    "REPO_URL", "https://github.com/OnSocial-Labs/onsocial-protocol"
)
DISCUSSIONS_URL = "https://github.com/orgs/OnSocial-Labs/discussions"

# =============================================================================
# Generate posts via NEAR AI
# =============================================================================

PROMPT = f"""You are writing project update posts for OnSocial Protocol — a decentralized, \
gasless social media platform built on NEAR Protocol.

A new update was just pushed to the main branch.

Commit message: {COMMIT_MESSAGE}
Commit: {COMMIT_SHA}
Repo: {REPO_URL}
Discussions: {DISCUSSIONS_URL}

Tech stack: Rust smart contracts on NEAR, TypeScript relayer/gateway, React portal, \
gasless transactions via meta-transactions and session keys, NEAR AI integration, \
NEAR Intents for cross-chain operations.

Tone rules — follow these strictly:
- Write like a developer talking to other developers, not a marketing account
- Be specific about what changed, not vague about progress
- No hype words: no "excited", "thrilled", "game-changing", "revolutionary", "huge", "dropped"
- No exclamation marks
- Never use "we", "our", "us", or "team" — keep it impersonal and third-person. \
Write about the project and the code, not the people behind it.
- It's fine to acknowledge something is small, a fix, or a work in progress — that's honest
- No emoji on the tweet. One emoji max on Telegram, only if it fits naturally
- Choose 0-2 hashtags ONLY from this set, only if relevant to the specific change: \
#NEAR, #OnSocial, #OpenSource, #BuildInPublic, #Rust, #TypeScript, #SocialFi, \
#DevOps, #FOSS, #Wasm. \
If none fit naturally, use zero hashtags — that's fine.
- Sound like a real person building something, not a brand account
- Add dry, understated wit when you can — the kind that makes a developer smirk, not laugh. \
Deadpan, self-aware, technically literate humor. Think changelog poetry, not standup comedy. \
If the commit is mundane, that's even better material — the contrast is the joke. \
Never force it, never use puns, memes, or try-hard jokes. \
About half the posts should have a touch of wit; the other half can be straight.

Link rules:
- You have two URLs available: the repo URL and the discussions URL.
- For the TWEET: do NOT include a URL by default. Only include one if the post \
references something the reader would specifically want to click (a new release, \
a specific feature, a discussion thread). Most tweets should have NO link — \
the profile bio links to the repo.
- For TELEGRAM: include one URL only if it adds context. Use the repo URL for code changes, \
the discussions URL for feature or community-facing updates. \
If the message is self-contained, skip the link.

Examples of tone:
  Bad: "Huge update just dropped! We're thrilled to ship gasless auth!"
  Good: "Added gasless auth via NEAR meta-transactions. Keys are session-scoped, 30 min TTL."
  Good (wit): "Fixed sandbox ports not freeing on stop. The 'stop' part is apparently important."
  Good (wit): "Comment audit complete. Turns out past code had opinions about the future. Updated accordingly."

Write TWO versions:

1. TWEET: — max 240 characters, hard limit. Specific, calm, developer-focused. \
If you include a URL, count it as ~50 characters.

2. TELEGRAM: — 2-3 sentences. A bit more detail on what changed and why. \
No markdown formatting.

Return only the two posts with their labels, nothing else."""

MAX_TWEET_LENGTH = 280


def generate_posts() -> tuple[str, str]:
    """Call NEAR AI to generate tweet and telegram text with retry."""
    if not NEAR_AI_API_KEY:
        raise RuntimeError("NEAR_AI_API_KEY is not set. Cannot generate posts.")
    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            resp = requests.post(
                url="https://cloud-api.near.ai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {NEAR_AI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "deepseek-ai/DeepSeek-V3.1",
                    "messages": [{"role": "user", "content": PROMPT}],
                },
                timeout=30,
            )
            resp.raise_for_status()
            output = resp.json()["choices"][0]["message"]["content"]
            print(f"NEAR AI output:\n{output}\n")
            return parse_posts(output)
        except (requests.RequestException, KeyError) as exc:
            last_error = exc
            wait = 2 ** attempt  # 2s, 4s, 8s
            print(f"⚠️  NEAR AI attempt {attempt}/3 failed: {exc}. Retrying in {wait}s...")
            time.sleep(wait)
    raise RuntimeError(f"NEAR AI failed after 3 attempts: {last_error}")


def parse_posts(output: str) -> tuple[str, str]:
    """Parse TWEET: and TELEGRAM: from AI output, handling multi-line values."""
    tweet_text = ""
    telegram_text = ""

    # Use regex to capture everything after each label until the next label or end
    tweet_match = re.search(
        r"TWEET:\s*(.+?)(?=\nTELEGRAM:|\Z)", output, re.DOTALL
    )
    telegram_match = re.search(r"TELEGRAM:\s*(.+?)(?=\Z)", output, re.DOTALL)

    if tweet_match:
        tweet_text = tweet_match.group(1).strip()
    if telegram_match:
        telegram_text = telegram_match.group(1).strip()

    # Fallbacks
    if not tweet_text:
        tweet_text = f"New update to OnSocial Protocol: {COMMIT_MESSAGE[:100]} {REPO_URL}"
    if not telegram_text:
        telegram_text = f"OnSocial Protocol update: {COMMIT_MESSAGE}\n\n{REPO_URL}"

    # Enforce hard tweet length limit
    if len(tweet_text) > MAX_TWEET_LENGTH:
        # Truncate text before the URL, preserving the repo link
        suffix = f"… {REPO_URL}"
        tweet_text = tweet_text[: MAX_TWEET_LENGTH - len(suffix)] + suffix
        print(f"⚠️  Tweet truncated to {len(tweet_text)} chars (was over {MAX_TWEET_LENGTH})")

    return tweet_text, telegram_text


# =============================================================================
# Publish to X (Twitter)
# =============================================================================


def post_to_x(text: str) -> bool:
    """Post a tweet. Returns True on success."""
    if not all([X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET]):
        print("⚠️  X credentials not set, skipping.")
        return False

    try:
        client = tweepy.Client(
            consumer_key=X_API_KEY,
            consumer_secret=X_API_SECRET,
            access_token=X_ACCESS_TOKEN,
            access_token_secret=X_ACCESS_TOKEN_SECRET,
        )
        client.create_tweet(text=text)
        print(f"✅ Posted to X ({len(text)} chars)")
        return True
    except Exception as e:
        print(f"❌ Failed to post to X: {e}")
        return False


# =============================================================================
# Publish to Telegram
# =============================================================================


def post_to_telegram(text: str) -> bool:
    """Send a message to the Telegram channel. Returns True on success."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("⚠️  Telegram credentials not set, skipping.")
        return False

    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={
                "chat_id": TELEGRAM_CHAT_ID,
                "text": text,
                "disable_web_page_preview": False,
            },
            timeout=10,
        )
        if resp.status_code == 200:
            print("✅ Posted to Telegram")
            return True
        else:
            print(f"❌ Telegram error ({resp.status_code}): {resp.text}")
            return False
    except Exception as e:
        print(f"❌ Failed to post to Telegram: {e}")
        return False


# =============================================================================
# Main
# =============================================================================


def main() -> None:
    args = parse_args()

    if not COMMIT_MESSAGE:
        print("No commit message provided, nothing to post.")
        sys.exit(0)

    if args.dry_run:
        print("🏃 DRY RUN — posts will be generated but NOT published.\n")

    print(f"Commit: {COMMIT_SHA}")
    print(f"Message: {COMMIT_MESSAGE}\n")

    tweet_text, telegram_text = generate_posts()

    print(f"\n--- Tweet ({len(tweet_text)} chars) ---")
    print(tweet_text)
    print(f"\n--- Telegram ({len(telegram_text)} chars) ---")
    print(telegram_text)
    print()

    if args.dry_run:
        print("🏃 DRY RUN complete — nothing was published.")
        return

    x_ok = post_to_x(tweet_text)
    tg_ok = post_to_telegram(telegram_text)

    print(f"\nResults: X={'✅' if x_ok else '❌'}  Telegram={'✅' if tg_ok else '❌'}")

    if not x_ok and not tg_ok:
        print("\n⚠️  No posts published (missing credentials or errors).")
        sys.exit(1)


if __name__ == "__main__":
    main()
