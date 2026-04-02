#!/usr/bin/env python3
"""
Generate developer-focused social posts from commit messages using NEAR AI,
then publish to X (Twitter) and Telegram.

Triggered by GitHub Actions when a commit message contains [post].
"""

import json
import os
import re
import subprocess
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
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "OnSocial-Labs/onsocial-protocol")
GITHUB_API_URL = os.environ.get("GITHUB_API_URL", "https://api.github.com")

X_API_KEY = os.environ.get("X_API_KEY", "")
X_API_SECRET = os.environ.get("X_API_SECRET", "")
X_ACCESS_TOKEN = os.environ.get("X_ACCESS_TOKEN", "")
X_ACCESS_TOKEN_SECRET = os.environ.get("X_ACCESS_TOKEN_SECRET", "")

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")
TELEGRAM_TOPIC_ID = os.environ.get("TELEGRAM_TOPIC_ID", "")


def strip_control_tags(message: str) -> str:
    return re.sub(r"\[(?:post|no-post)\]", "", message, flags=re.IGNORECASE).strip()


RAW_COMMIT_MESSAGE = os.environ.get("COMMIT_MESSAGE", "")
FORCE_POST = bool(re.search(r"\[post\]", RAW_COMMIT_MESSAGE, re.IGNORECASE))
COMMIT_MESSAGE = strip_control_tags(RAW_COMMIT_MESSAGE)
FULL_COMMIT_SHA = os.environ.get("COMMIT_SHA", "")
COMMIT_SHA = FULL_COMMIT_SHA[:7]
REPO_URL = os.environ.get(
    "REPO_URL", "https://github.com/OnSocial-Labs/onsocial-protocol"
)
DISCUSSIONS_URL = "https://github.com/orgs/OnSocial-Labs/discussions"

# =============================================================================
# Auto-detect which contracts/packages changed
# =============================================================================

# Map top-level directories to human-readable component names
COMPONENT_MAP = {
    "contracts/scarces-onsocial": "NFT marketplace contract (scarces-onsocial)",
    "contracts/boost-onsocial": "boost contract (boost-onsocial)",
    "contracts/core-onsocial": "social data contract (core-onsocial)",
    "contracts/token-onsocial": "SOCIAL token contract (token-onsocial)",
    "contracts/staking-onsocial": "staking contract (staking-onsocial)",
    "contracts/rewards-onsocial": "rewards contract (rewards-onsocial)",
    "contracts/manager-proxy-onsocial": "manager proxy contract",
    "packages/onsocial-relayer": "gasless transaction relayer",
    "packages/onsocial-gateway": "API gateway",
    "packages/onsocial-backend": "backend API service",
    "packages/onsocial-portal": "React frontend (portal)",
    "packages/onsocial-app": "web app",
    "packages/onsocial-rpc": "RPC package",
    "packages/onsocial-intents": "NEAR Intents integration",
    "indexers/substreams": "Substreams indexer",
    "crates/onsocial-types": "shared types crate",
    "crates/onsocial-auth": "auth crate",
    "tests": "integration tests",
}

MAX_CHANGED_FILES = 12
MAX_DIFF_SNIPPET_LINES = 36
MAX_DIFF_SNIPPET_CHARS = 2400
MAX_TITLE_LENGTH = 120
HYPE_WORDS = (
    "excited",
    "thrilled",
    "game-changing",
    "revolutionary",
    "huge",
    "dropped",
)
SKIP_LABELS = {"no-social-post", "skip-social-post", "internal-only"}


def run_git_command(*args: str) -> str:
    """Run a git command and return stdout, or an empty string on failure."""
    try:
        result = subprocess.run(
            ["git", *args],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except Exception:
        return ""

    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def get_changed_files() -> list[str]:
    output = run_git_command("diff", "--name-only", "HEAD~1", "HEAD")
    if not output:
        return []
    return [line.strip() for line in output.splitlines() if line.strip()]


def fetch_json(url: str, headers: dict[str, str] | None = None) -> object | None:
    request_headers = {"Accept": "application/vnd.github+json"}
    if headers:
        request_headers.update(headers)

    try:
        response = requests.get(url, headers=request_headers, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as exc:
        print(f"⚠️  GitHub metadata lookup failed: {exc}")
        return None


def fetch_associated_pr() -> dict[str, object] | None:
    if not GITHUB_TOKEN or not FULL_COMMIT_SHA or not GITHUB_REPOSITORY:
        return None

    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    pulls_url = f"{GITHUB_API_URL}/repos/{GITHUB_REPOSITORY}/commits/{FULL_COMMIT_SHA}/pulls"
    payload = fetch_json(pulls_url, headers=headers)
    if not isinstance(payload, list) or not payload:
        return None

    pull = payload[0]
    if not isinstance(pull, dict):
        return None
    return pull


def normalize_title(text: str) -> str:
    cleaned = strip_control_tags(text)
    cleaned = re.sub(r"^(feat|fix|chore|docs|refactor|test|ci|build|perf)(\([^)]*\))?!?:\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    return cleaned[:MAX_TITLE_LENGTH].strip()


def is_docs_only_file(path: str) -> bool:
    doc_prefixes = (
        "Resources/",
        "docs/",
    )
    doc_files = {"README.md", "CONTRIBUTING.md", "LICENSE.md"}
    return path.endswith(".md") or path.startswith(doc_prefixes) or path in doc_files


def is_test_only_file(path: str) -> bool:
    return (
        path.startswith(("tests/", "test-core/", "test-partner-sdk/"))
        or "/tests/" in path
        or path.endswith((".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"))
    )


def is_ci_only_file(path: str) -> bool:
    return path.startswith(".github/") or path in {"pnpm-lock.yaml", "Cargo.lock"}


def detect_change_kind(files: list[str]) -> str:
    if any(path.startswith("contracts/") for path in files):
        return "contract change"
    if any(path.startswith("packages/onsocial-backend/") for path in files):
        return "backend change"
    if any(path.startswith("packages/onsocial-portal/") for path in files):
        return "portal change"
    if any(path.startswith("packages/") for path in files):
        return "package change"
    if any(path.startswith("deployment/") for path in files):
        return "deployment change"
    return "repo change"


def should_skip_post(files: list[str], pr_labels: set[str]) -> tuple[bool, str]:
    if FORCE_POST:
        return False, "[post] tag present"
    if pr_labels & SKIP_LABELS:
        labels = ", ".join(sorted(pr_labels & SKIP_LABELS))
        return True, f"PR labeled to skip social posting ({labels})"
    if not files:
        return False, "No changed files detected"
    if all(is_docs_only_file(path) for path in files):
        return True, "Docs-only change"
    if all(is_test_only_file(path) for path in files):
        return True, "Test-only change"
    if all(is_ci_only_file(path) for path in files):
        return True, "CI or lockfile-only change"
    if all(is_docs_only_file(path) or is_ci_only_file(path) for path in files):
        return True, "Docs/CI-only change"
    return False, "Change is meaningful enough to post"


def first_component_label(files: list[str]) -> str:
    for path in files:
        for prefix, label in COMPONENT_MAP.items():
            if path.startswith(prefix):
                return label
    return "OnSocial Protocol"


def detect_changed_components() -> str:
    """Run git diff to find which components were touched in this commit."""
    files = get_changed_files()
    if not files:
        return "(could not detect changed files)"

    components = set()
    for f in files:
        for prefix, label in COMPONENT_MAP.items():
            if f.startswith(prefix):
                components.add(label)
                break

    if not components:
        return "misc / repo-level changes"
    return ", ".join(sorted(components))


def summarize_changed_files() -> str:
    files = get_changed_files()
    if not files:
        return "(could not detect changed files)"

    visible_files = files[:MAX_CHANGED_FILES]
    summary = "\n".join(f"- {path}" for path in visible_files)
    remaining = len(files) - len(visible_files)
    if remaining > 0:
        summary += f"\n- ... and {remaining} more"
    return summary


CHANGED_COMPONENTS = detect_changed_components()
CHANGED_FILES = summarize_changed_files()
CHANGED_FILE_LIST = get_changed_files()

# Map contract directories to their nearblocks URLs (testnet + mainnet)
CONTRACT_NEARBLOCKS = {
    "contracts/scarces-onsocial": "https://testnet.nearblocks.io/address/scarces.onsocial.testnet",
    "contracts/boost-onsocial": "https://testnet.nearblocks.io/address/boost.onsocial.testnet",
    "contracts/core-onsocial": "https://testnet.nearblocks.io/address/core.onsocial.testnet",
    "contracts/staking-onsocial": "https://testnet.nearblocks.io/address/staking.onsocial.testnet",
    "contracts/token-onsocial": "https://testnet.nearblocks.io/address/token.onsocial.testnet",
    "contracts/rewards-onsocial": "https://testnet.nearblocks.io/address/rewards.onsocial.testnet",
}


def detect_nearblocks_links() -> str:
    """Return nearblocks explorer links for any contracts changed in this commit."""
    files = get_changed_files()
    if not files:
        return ""

    links = set()
    for f in files:
        for prefix, url in CONTRACT_NEARBLOCKS.items():
            if f.startswith(prefix):
                links.add(url)
                break

    if not links:
        return ""
    return "\n".join(sorted(links))


NEARBLOCKS_LINKS = detect_nearblocks_links()


def detect_diff_stat() -> str:
    stat = run_git_command("diff", "--stat", "HEAD~1", "HEAD")
    return stat or "(diff stat unavailable)"


def detect_diff_snippets() -> str:
    diff = run_git_command("diff", "--no-color", "--unified=1", "HEAD~1", "HEAD")
    if not diff:
        return "(diff snippets unavailable)"

    lines: list[str] = []
    snippet_chars = 0
    for raw_line in diff.splitlines():
        line = raw_line.rstrip()
        if line.startswith(("diff --git", "index ", "--- ", "+++ ")):
            continue
        if not line.startswith(("@@", "+", "-", " ")):
            continue

        if line.startswith(" "):
            continue

        candidate = line[:220]
        candidate_len = len(candidate) + 1
        if len(lines) >= MAX_DIFF_SNIPPET_LINES or snippet_chars + candidate_len > MAX_DIFF_SNIPPET_CHARS:
            lines.append("... (diff trimmed)")
            break

        lines.append(candidate)
        snippet_chars += candidate_len

    if not lines:
        return "(diff snippets unavailable)"
    return "\n".join(lines)


DIFF_STAT = detect_diff_stat()
DIFF_SNIPPETS = detect_diff_snippets()
ASSOCIATED_PR = fetch_associated_pr()
PR_TITLE = normalize_title(str(ASSOCIATED_PR.get("title", ""))) if ASSOCIATED_PR else ""
PR_BODY = str(ASSOCIATED_PR.get("body", "")).strip() if ASSOCIATED_PR else ""
PR_URL = str(ASSOCIATED_PR.get("html_url", "")).strip() if ASSOCIATED_PR else ""
PR_NUMBER = str(ASSOCIATED_PR.get("number", "")).strip() if ASSOCIATED_PR else ""
PR_LABELS = {
    str(label.get("name", "")).strip().lower()
    for label in ASSOCIATED_PR.get("labels", [])
    if isinstance(label, dict)
} if ASSOCIATED_PR else set()
CHANGE_KIND = detect_change_kind(CHANGED_FILE_LIST)
SHOULD_SKIP, SKIP_REASON = should_skip_post(CHANGED_FILE_LIST, PR_LABELS)


def summarize_pr_body(body: str) -> str:
    if not body:
        return "none"
    collapsed = re.sub(r"\s+", " ", body).strip()
    return collapsed[:300] + ("..." if len(collapsed) > 300 else "")


PR_BODY_SUMMARY = summarize_pr_body(PR_BODY)

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
Associated PR: {f'#{PR_NUMBER} {PR_TITLE}' if PR_NUMBER and PR_TITLE else 'none'}
PR labels: {', '.join(sorted(PR_LABELS)) if PR_LABELS else 'none'}
PR URL: {PR_URL if PR_URL else 'none'}
PR summary: {PR_BODY_SUMMARY}
Detected change kind: {CHANGE_KIND}
Changed components: {CHANGED_COMPONENTS}
Changed files:
{CHANGED_FILES}
Diff stat:
{DIFF_STAT}
Representative diff snippets:
{DIFF_SNIPPETS}
Nearblocks explorer links: {NEARBLOCKS_LINKS if NEARBLOCKS_LINKS else "none (no contract changes)"}

This is a monorepo with multiple contracts and packages. The "Changed components" line \
above tells you exactly which parts of the codebase were modified. Always mention the \
specific component in both the tweet and telegram post — followers need to know which \
part of the system changed. Use the friendly name, not the directory path.

Use the changed files, diff stat, and diff snippets to infer what materially changed. \
Treat that code context as the primary source of truth. The commit message can help with \
framing, but if it is vague, rely on the diff context instead. Do not invent behavior that \
is not visible in the context.

If PR metadata is available, use it to understand the intent and user impact. PR title and \
labels are usually better summaries than the raw commit message. Still prefer the diff if \
the PR text overstates the change.

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
- You have several URLs available: the repo URL, the discussions URL, and nearblocks \
explorer links for any contracts that changed.
- For the TWEET: do NOT include a URL by default. Only include one if the post \
references something the reader would specifically want to click (a new release, \
a specific feature, a discussion thread). When the commit is about a contract \
deployment, upgrade, testnet/mainnet activity, or on-chain verification, include \
the relevant nearblocks explorer link so devs can inspect the contract. \
Most tweets should have NO link — the profile bio links to the repo.
- For TELEGRAM: include one URL only if it adds context. Use the repo URL for code changes, \
the discussions URL for feature or community-facing updates, or the nearblocks link \
for contract deployments and on-chain activity. \
If the message is self-contained, skip the link.

Examples of tone:
  Bad: "Huge update just dropped! We're thrilled to ship gasless auth!"
  Bad (jargon): "New IterableSet index on app_pool_ids with paginated view capped at 100."
  Bad (repetitive opener): "Added app discovery views. Added test coverage. Added..."
  Good: "Gasless auth now works via NEAR meta-transactions. Keys are session-scoped, 30 min TTL."
  Good: "NFT marketplace apps can now be discovered on-chain — app listing and count views are live."
  Good: "The scarces contract now covers 6 more modules with integration tests. Transfer, payouts, moderation, and more."
  Good (wit): "Sandbox ports weren't freeing on stop. The 'stop' part is apparently important."
  Good (wit): "Comment audit complete. Turns out past code had opinions about the future."

Write TWO versions:

1. TWEET: — max 240 characters, hard limit. Must be understandable by someone who has \
never seen the repo. Lead with WHAT changed (the feature or fix), not HOW (implementation \
details like struct names or storage keys). Avoid internal jargon — translate it to what \
the user or developer gains. If the commit is about tests, emphasize what's now covered, \
not the test count. One clear sentence is better than two cramped ones. \
IMPORTANT: Vary the sentence structure. Do NOT start with "Added", "Updated", "Fixed", \
or any past-tense verb every time. Mix it up — use noun phrases ("App discovery is now \
on-chain"), present tense ("The scarces contract now exposes..."), or context-first \
structure ("For frontend devs: ..."). Never start two consecutive posts the same way. \
If you include a URL, count it as ~50 characters.

2. TELEGRAM: — 2-3 sentences. A bit more detail on what changed and why. \
No markdown formatting.

Return only the two posts with their labels, nothing else."""

MAX_TWEET_LENGTH = 240


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
                timeout=45,
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


def contains_forbidden_language(text: str) -> str | None:
    lowered = text.lower()
    for word in HYPE_WORDS:
        if word in lowered:
            return f'hype word "{word}"'
    if re.search(r"\b(we|our|us|team)\b", lowered):
        return "first-person or team language"
    if "!" in text:
        return "exclamation mark"
    return None


def validate_posts(tweet_text: str, telegram_text: str) -> list[str]:
    errors: list[str] = []
    if len(tweet_text) > MAX_TWEET_LENGTH:
        errors.append(f"tweet too long ({len(tweet_text)} > {MAX_TWEET_LENGTH})")

    tweet_error = contains_forbidden_language(tweet_text)
    if tweet_error:
        errors.append(f"tweet contains {tweet_error}")

    telegram_error = contains_forbidden_language(telegram_text)
    if telegram_error:
        errors.append(f"telegram contains {telegram_error}")

    if not tweet_text.strip() or not telegram_text.strip():
        errors.append("empty generated post")

    if CHANGED_COMPONENTS != "(could not detect changed files)" and CHANGED_COMPONENTS != "misc / repo-level changes":
        component = first_component_label(CHANGED_FILE_LIST).split(" (")[0].lower()
        if component and component not in tweet_text.lower() and component not in telegram_text.lower():
            errors.append("posts do not mention the primary changed component")

    return errors


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
        payload = {
            "chat_id": TELEGRAM_CHAT_ID,
            "text": text,
            "disable_web_page_preview": False,
        }
        if TELEGRAM_TOPIC_ID:
            payload["message_thread_id"] = int(TELEGRAM_TOPIC_ID)
        resp = requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json=payload,
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

    if SHOULD_SKIP:
        print(f"Skipping social post: {SKIP_REASON}")
        sys.exit(0)

    if args.dry_run:
        print("🏃 DRY RUN — posts will be generated but NOT published.\n")

    print(f"Commit: {COMMIT_SHA}")
    print(f"Message: {COMMIT_MESSAGE}\n")
    if PR_TITLE:
        print(f"PR: {PR_TITLE}")
    if PR_LABELS:
        print(f"PR labels: {', '.join(sorted(PR_LABELS))}")
    print(f"Detected change kind: {CHANGE_KIND}\n")

    try:
        tweet_text, telegram_text = generate_posts()
    except RuntimeError as err:
        print(f"Skipping social post: AI generation failed: {err}")
        sys.exit(0)

    validation_errors = validate_posts(tweet_text, telegram_text)
    if validation_errors:
        print("Skipping social post: generated posts failed validation:")
        for error in validation_errors:
            print(f"  - {error}")
        sys.exit(0)

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
