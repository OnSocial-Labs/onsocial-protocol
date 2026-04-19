// ---------------------------------------------------------------------------
// Minimal template — clean card layout
// ---------------------------------------------------------------------------

import type { PageData } from '../types.js';

export function minimal(data: PageData): string {
  const name = data.profile.name ?? data.accountId;
  const bio = data.profile.bio ?? '';
  const avatar = data.profile.avatar;
  const theme = data.config.theme ?? {};
  const primary = theme.primary ?? '#6366f1';
  const bg = theme.background ?? '#0f0f11';
  const text = theme.text ?? '#e4e4e7';
  const accent = theme.accent ?? primary;
  const tagline = data.config.tagline ?? '';

  const avatarHtml = avatar
    ? `<img class="avatar" src="${escAttr(avatar)}" alt="${escAttr(name)}" />`
    : `<div class="avatar avatar-placeholder">${escHtml(name.charAt(0).toUpperCase())}</div>`;

  const linksHtml = (data.profile.links ?? [])
    .map(
      (l) =>
        `<a class="link-btn" href="${escAttr(l.url)}" target="_blank" rel="noopener">${escHtml(l.label)}</a>`
    )
    .join('\n        ');

  const tagsHtml = (data.profile.tags ?? [])
    .map((t) => `<span class="tag">${escHtml(t)}</span>`)
    .join(' ');

  const badgesHtml =
    data.badges.length > 0
      ? `<div class="badges">${(data.badges as Array<{ name: string }>).map((b) => `<span class="badge">${escHtml(b.name)}</span>`).join(' ')}</div>`
      : '';

  return `
    <div class="page-card">
      ${avatarHtml}
      <h1 class="name">${escHtml(name)}</h1>
      ${tagline ? `<p class="tagline">${escHtml(tagline)}</p>` : ''}
      ${bio ? `<p class="bio">${escHtml(bio)}</p>` : ''}
      ${tagsHtml ? `<div class="tags">${tagsHtml}</div>` : ''}
      ${badgesHtml}
      <div class="links">
        ${linksHtml}
      </div>
      <div class="actions">
        <button class="btn btn-stand" onclick="standWith('${escAttr(data.accountId)}')">Stand With</button>
        <button class="btn btn-support" onclick="support('${escAttr(data.accountId)}')">Support</button>
      </div>
      <div class="stats">
        <span>${data.stats.standingCount} standing</span>
        <span>${data.stats.postCount} posts</span>
        <span>${data.stats.badgeCount} badges</span>
      </div>
    </div>

    <style>
      :root {
        --primary: ${primary};
        --bg: ${bg};
        --text: ${text};
        --accent: ${accent};
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: var(--bg);
        color: var(--text);
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        padding: 2rem;
      }
      .page-card {
        text-align: center;
        max-width: 440px;
        width: 100%;
      }
      .avatar {
        width: 96px;
        height: 96px;
        border-radius: 50%;
        object-fit: cover;
        margin: 0 auto 1rem;
        display: block;
        border: 3px solid var(--primary);
      }
      .avatar-placeholder {
        background: var(--primary);
        color: var(--bg);
        font-size: 2.5rem;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .name { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.25rem; }
      .tagline { color: var(--accent); font-size: 0.95rem; margin-bottom: 0.5rem; }
      .bio { font-size: 0.95rem; opacity: 0.8; margin-bottom: 1rem; line-height: 1.5; }
      .tags { margin-bottom: 1rem; display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      .tag {
        background: rgba(255,255,255,0.08);
        border-radius: 999px;
        padding: 0.25rem 0.75rem;
        font-size: 0.8rem;
      }
      .badges { margin-bottom: 1rem; display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      .badge {
        background: var(--primary);
        color: var(--bg);
        border-radius: 999px;
        padding: 0.2rem 0.6rem;
        font-size: 0.75rem;
        font-weight: 600;
      }
      .links { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem; }
      .link-btn {
        display: block;
        padding: 0.75rem 1.25rem;
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 12px;
        color: var(--text);
        text-decoration: none;
        font-weight: 500;
        transition: all 0.2s;
      }
      .link-btn:hover {
        border-color: var(--primary);
        background: rgba(255,255,255,0.04);
      }
      .actions { display: flex; gap: 0.75rem; justify-content: center; margin-bottom: 1.5rem; }
      .btn {
        padding: 0.6rem 1.5rem;
        border-radius: 999px;
        font-weight: 600;
        font-size: 0.9rem;
        border: none;
        cursor: pointer;
        transition: transform 0.15s;
      }
      .btn:hover { transform: scale(1.04); }
      .btn-stand { background: transparent; border: 2px solid var(--primary); color: var(--primary); }
      .btn-support { background: var(--primary); color: var(--bg); }
      .stats { font-size: 0.8rem; opacity: 0.5; display: flex; gap: 1.5rem; justify-content: center; }
    </style>
  `;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;');
}
