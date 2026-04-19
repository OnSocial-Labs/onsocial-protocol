// ---------------------------------------------------------------------------
// Creator template — rich layout with posts, events, collectibles sections
// ---------------------------------------------------------------------------

import type { PageData, PageSection } from '../types.js';

export function creator(data: PageData): string {
  const name = data.profile.name ?? data.accountId;
  const bio = data.profile.bio ?? '';
  const avatar = data.profile.avatar;
  const theme = data.config.theme ?? {};
  const primary = theme.primary ?? '#f97316';
  const bg = theme.background ?? '#0a0a0a';
  const text = theme.text ?? '#fafafa';
  const accent = theme.accent ?? '#818cf8';
  const tagline = data.config.tagline ?? '';
  const sections: PageSection[] = data.config.sections ?? [
    'profile',
    'links',
    'support',
    'posts',
    'badges',
  ];

  const avatarHtml = avatar
    ? `<img class="avatar" src="${escAttr(avatar)}" alt="${escAttr(name)}" />`
    : `<div class="avatar avatar-placeholder">${escHtml(name.charAt(0).toUpperCase())}</div>`;

  const linksSection = sections.includes('links')
    ? `<section class="section" id="links">
        <h2>Links</h2>
        <div class="link-grid">
          ${(data.profile.links ?? []).map((l) => `<a class="link-card" href="${escAttr(l.url)}" target="_blank" rel="noopener"><span class="link-label">${escHtml(l.label)}</span></a>`).join('\n          ')}
        </div>
      </section>`
    : '';

  const supportSection = sections.includes('support')
    ? `<section class="section" id="support">
        <h2>Support</h2>
        <div class="support-row">
          <button class="btn btn-stand" onclick="standWith('${escAttr(data.accountId)}')">
            <span class="btn-icon">✊</span> Stand With
          </button>
          <button class="btn btn-tip" onclick="support('${escAttr(data.accountId)}')">
            <span class="btn-icon">💜</span> Tip SOCIAL
          </button>
        </div>
      </section>`
    : '';

  const postsSection = sections.includes('posts')
    ? `<section class="section" id="posts">
        <h2>Recent Posts</h2>
        ${
          data.recentPosts.length > 0
            ? `<div class="posts-list">${(data.recentPosts as Array<{ text: string; timestamp: number }>).map((p) => `<div class="post-card"><p>${escHtml(p.text)}</p></div>`).join('\n')}</div>`
            : '<p class="empty">No posts yet</p>'
        }
      </section>`
    : '';

  const badgesSection = sections.includes('badges')
    ? `<section class="section" id="badges">
        <h2>Badges</h2>
        ${
          data.badges.length > 0
            ? `<div class="badge-grid">${(data.badges as Array<{ name: string; icon?: string }>).map((b) => `<div class="badge-card">${b.icon ? `<span class="badge-icon">${escHtml(b.icon)}</span>` : ''}<span>${escHtml(b.name)}</span></div>`).join('\n')}</div>`
            : '<p class="empty">No badges yet</p>'
        }
      </section>`
    : '';

  const groupsSection = sections.includes('groups')
    ? `<section class="section" id="groups">
        <h2>Groups</h2>
        <p class="empty">Coming soon</p>
      </section>`
    : '';

  const eventsSection = sections.includes('events')
    ? `<section class="section" id="events">
        <h2>Events</h2>
        <p class="empty">Coming soon</p>
      </section>`
    : '';

  const collectiblesSection = sections.includes('collectibles')
    ? `<section class="section" id="collectibles">
        <h2>Collectibles</h2>
        <p class="empty">Coming soon</p>
      </section>`
    : '';

  return `
    <div class="creator-page">
      <header class="hero">
        ${avatarHtml}
        <h1 class="name">${escHtml(name)}</h1>
        ${tagline ? `<p class="tagline">${escHtml(tagline)}</p>` : ''}
        ${bio ? `<p class="bio">${escHtml(bio)}</p>` : ''}
        <div class="tags">
          ${(data.profile.tags ?? []).map((t) => `<span class="tag">${escHtml(t)}</span>`).join(' ')}
        </div>
        <div class="stats-bar">
          <div class="stat"><strong>${data.stats.standingCount}</strong><span>Standing</span></div>
          <div class="stat"><strong>${data.stats.postCount}</strong><span>Posts</span></div>
          <div class="stat"><strong>${data.stats.badgeCount}</strong><span>Badges</span></div>
          <div class="stat"><strong>${data.stats.groupCount}</strong><span>Groups</span></div>
        </div>
      </header>

      ${linksSection}
      ${supportSection}
      ${postsSection}
      ${badgesSection}
      ${groupsSection}
      ${eventsSection}
      ${collectiblesSection}

      <footer class="footer">
        <p>Powered by <a href="https://onsocial.id" target="_blank" rel="noopener">OnSocial</a></p>
      </footer>
    </div>

    <style>
      :root {
        --primary: ${primary};
        --bg: ${bg};
        --text: ${text};
        --accent: ${accent};
        --surface: rgba(255,255,255,0.04);
        --border: rgba(255,255,255,0.08);
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: var(--bg);
        color: var(--text);
        min-height: 100vh;
        padding: 0;
      }
      .creator-page { max-width: 640px; margin: 0 auto; padding: 2rem 1.5rem; }
      .hero { text-align: center; padding-bottom: 2rem; border-bottom: 1px solid var(--border); margin-bottom: 2rem; }
      .avatar {
        width: 112px; height: 112px; border-radius: 50%;
        object-fit: cover; margin: 0 auto 1rem; display: block;
        border: 3px solid var(--primary);
        box-shadow: 0 0 30px rgba(249,115,22,0.15);
      }
      .avatar-placeholder {
        background: var(--primary); color: var(--bg);
        font-size: 3rem; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        width: 112px; height: 112px; border-radius: 50%; margin: 0 auto 1rem;
      }
      .name { font-size: 2rem; font-weight: 800; margin-bottom: 0.25rem; }
      .tagline { color: var(--accent); font-size: 1rem; margin-bottom: 0.5rem; }
      .bio { font-size: 0.95rem; opacity: 0.7; margin-bottom: 1rem; line-height: 1.6; max-width: 420px; margin-left: auto; margin-right: auto; }
      .tags { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; margin-bottom: 1.5rem; }
      .tag { background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: 0.2rem 0.75rem; font-size: 0.8rem; }
      .stats-bar { display: flex; gap: 2rem; justify-content: center; }
      .stat { display: flex; flex-direction: column; align-items: center; }
      .stat strong { font-size: 1.2rem; font-weight: 700; }
      .stat span { font-size: 0.75rem; opacity: 0.5; text-transform: uppercase; letter-spacing: 0.05em; }

      .section { margin-bottom: 2rem; }
      .section h2 { font-size: 1.1rem; font-weight: 700; margin-bottom: 1rem; color: var(--accent); text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.85rem; }

      .link-grid { display: flex; flex-direction: column; gap: 0.5rem; }
      .link-card {
        display: block; padding: 0.75rem 1rem; background: var(--surface);
        border: 1px solid var(--border); border-radius: 12px;
        color: var(--text); text-decoration: none; font-weight: 500;
        transition: all 0.2s;
      }
      .link-card:hover { border-color: var(--primary); background: rgba(255,255,255,0.06); }

      .support-row { display: flex; gap: 0.75rem; justify-content: center; }
      .btn {
        padding: 0.65rem 1.5rem; border-radius: 999px; font-weight: 600;
        font-size: 0.9rem; border: none; cursor: pointer; transition: all 0.15s;
        display: inline-flex; align-items: center; gap: 0.4rem;
      }
      .btn:hover { transform: scale(1.04); }
      .btn-stand { background: transparent; border: 2px solid var(--primary); color: var(--primary); }
      .btn-tip { background: var(--primary); color: var(--bg); }
      .btn-icon { font-size: 1.1rem; }

      .posts-list { display: flex; flex-direction: column; gap: 0.75rem; }
      .post-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1rem; }
      .post-card p { font-size: 0.9rem; line-height: 1.5; }

      .badge-grid { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .badge-card {
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 12px; padding: 0.5rem 0.75rem;
        display: inline-flex; align-items: center; gap: 0.3rem;
        font-size: 0.85rem;
      }
      .badge-icon { font-size: 1.1rem; }

      .empty { font-size: 0.9rem; opacity: 0.4; font-style: italic; }

      .footer { text-align: center; padding-top: 2rem; border-top: 1px solid var(--border); margin-top: 2rem; }
      .footer p { font-size: 0.8rem; opacity: 0.4; }
      .footer a { color: var(--primary); text-decoration: none; }
      .footer a:hover { text-decoration: underline; }

      @media (max-width: 480px) {
        .creator-page { padding: 1.5rem 1rem; }
        .hero { padding-bottom: 1.5rem; margin-bottom: 1.5rem; }
        .avatar, .avatar-placeholder { width: 88px; height: 88px; font-size: 2.5rem; }
        .name { font-size: 1.5rem; }
        .stats-bar { gap: 1.25rem; }
      }
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
