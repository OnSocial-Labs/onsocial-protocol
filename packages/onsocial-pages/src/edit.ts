// ---------------------------------------------------------------------------
// Inline edit mode — injected when the page owner visits their own page.
//
// Features:
//   - Floating edit bar at bottom
//   - Click-to-edit on name, bio, tagline
//   - Customize panel (template, theme, sections)
//   - Auto-save to gateway API (gasless)
//   - Save status feedback
// ---------------------------------------------------------------------------

import type { PageConfig, PageSection } from './types.js';

const TEMPLATES = [
  { id: 'minimal', name: 'Minimal', desc: 'Clean card — links, bio, buttons' },
  {
    id: 'creator',
    name: 'Creator',
    desc: 'Rich sections — posts, badges, support',
  },
  {
    id: 'business',
    name: 'Business',
    desc: 'Professional — contact, team, hours',
  },
];

const ALL_SECTIONS: { id: PageSection; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'links', label: 'Links' },
  { id: 'support', label: 'Support' },
  { id: 'posts', label: 'Posts' },
  { id: 'badges', label: 'Badges' },
  { id: 'groups', label: 'Groups' },
  { id: 'events', label: 'Events' },
  { id: 'collectibles', label: 'Collectibles' },
];

/**
 * Returns the client-side HTML/CSS/JS for the inline editor.
 * Injected only when the authenticated user owns the page.
 */
export function editModeScript(
  accountId: string,
  apiUrl: string,
  currentConfig: PageConfig
): string {
  const configJson = JSON.stringify(currentConfig)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
  const templatesJson = JSON.stringify(TEMPLATES);
  const sectionsJson = JSON.stringify(ALL_SECTIONS);

  return `
<!-- OnSocial Edit Mode -->
<div id="os-edit-bar">
  <div class="os-bar-inner">
    <div class="os-bar-left">
      <span class="os-bar-logo">✦</span>
      <span class="os-bar-label">Your Page</span>
      <span id="os-save-status"></span>
    </div>
    <div class="os-bar-right">
      <button id="os-btn-edit" class="os-bar-btn os-bar-btn-edit" onclick="osToggleEdit()">
        <span>✏️</span> Edit
      </button>
      <button id="os-btn-customize" class="os-bar-btn" onclick="osToggleCustomize()">
        <span>🎨</span> Customize
      </button>
      <button class="os-bar-btn os-bar-btn-muted" onclick="window.open('https://portal.onsocial.id/page','_blank')">
        <span>↗</span> Portal
      </button>
    </div>
  </div>
</div>

<!-- Customize Panel -->
<div id="os-customize" class="os-panel-hidden">
  <div class="os-panel">
    <div class="os-panel-header">
      <h3>Customize Your Page</h3>
      <button class="os-panel-close" onclick="osToggleCustomize()">✕</button>
    </div>
    <div class="os-panel-body">
      <div class="os-field">
        <label>Template</label>
        <div id="os-templates" class="os-template-grid"></div>
      </div>
      <div class="os-field">
        <label>Colors</label>
        <div class="os-color-row">
          <div class="os-color-field">
            <span>Primary</span>
            <input type="color" id="os-color-primary" onchange="osColorChange()" />
          </div>
          <div class="os-color-field">
            <span>Background</span>
            <input type="color" id="os-color-bg" onchange="osColorChange()" />
          </div>
          <div class="os-color-field">
            <span>Text</span>
            <input type="color" id="os-color-text" onchange="osColorChange()" />
          </div>
          <div class="os-color-field">
            <span>Accent</span>
            <input type="color" id="os-color-accent" onchange="osColorChange()" />
          </div>
        </div>
      </div>
      <div class="os-field">
        <label>Sections</label>
        <div id="os-sections" class="os-section-list"></div>
      </div>
      <div class="os-field">
        <label>Links</label>
        <div id="os-links-list" class="os-links-list"></div>
        <button class="os-add-link" onclick="osAddLink()">+ Add Link</button>
      </div>
    </div>
  </div>
</div>

<style>
  /* Edit bar */
  #os-edit-bar {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999;
    background: rgba(10,10,10,0.95); backdrop-filter: blur(20px);
    border-top: 1px solid rgba(255,255,255,0.08);
    padding: 0.6rem 1rem;
    font-family: Inter, -apple-system, sans-serif;
    animation: osSlideUp 0.3s ease-out;
  }
  @keyframes osSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
  .os-bar-inner { max-width: 800px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; }
  .os-bar-left { display: flex; align-items: center; gap: 0.6rem; }
  .os-bar-logo { font-size: 1.1rem; color: var(--primary, #6366f1); }
  .os-bar-label { font-size: 0.85rem; font-weight: 600; color: rgba(255,255,255,0.7); }
  #os-save-status {
    font-size: 0.75rem; color: rgba(255,255,255,0.4);
    transition: all 0.3s;
  }
  #os-save-status.saving { color: #f59e0b; }
  #os-save-status.saved { color: #22c55e; }
  #os-save-status.error { color: #ef4444; }
  .os-bar-right { display: flex; gap: 0.5rem; }
  .os-bar-btn {
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.8); border-radius: 8px; padding: 0.4rem 0.85rem;
    font-size: 0.8rem; font-weight: 500; cursor: pointer;
    display: inline-flex; align-items: center; gap: 0.3rem;
    transition: all 0.15s; font-family: inherit;
  }
  .os-bar-btn:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); }
  .os-bar-btn-edit.active { background: var(--primary, #6366f1); border-color: var(--primary, #6366f1); color: #fff; }
  .os-bar-btn-muted { opacity: 0.5; }
  .os-bar-btn-muted:hover { opacity: 0.8; }

  /* Contenteditable hover hint */
  [data-os-editable] { position: relative; transition: outline 0.15s; border-radius: 4px; }
  body.os-editing [data-os-editable]:hover {
    outline: 2px dashed rgba(99,102,241,0.4); outline-offset: 4px; cursor: text;
  }
  body.os-editing [data-os-editable]:focus {
    outline: 2px solid var(--primary, #6366f1); outline-offset: 4px;
  }
  body.os-editing [data-os-editable]:empty::before {
    content: attr(data-os-placeholder); opacity: 0.3; pointer-events: none;
  }

  /* Customize panel */
  #os-customize {
    position: fixed; bottom: 52px; right: 0; z-index: 9998;
    width: 380px; max-height: calc(100vh - 80px);
    transition: transform 0.3s ease, opacity 0.2s;
  }
  #os-customize.os-panel-hidden { transform: translateX(100%); opacity: 0; pointer-events: none; }
  #os-customize.os-panel-visible { transform: translateX(0); opacity: 1; }
  .os-panel {
    background: rgba(15,15,17,0.98); backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,0.08); border-radius: 16px 0 0 0;
    overflow-y: auto; max-height: calc(100vh - 80px);
    font-family: Inter, -apple-system, sans-serif;
  }
  .os-panel-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 1rem 1.2rem; border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .os-panel-header h3 { font-size: 0.95rem; font-weight: 700; color: #fff; margin: 0; }
  .os-panel-close {
    background: none; border: none; color: rgba(255,255,255,0.4);
    font-size: 1.1rem; cursor: pointer; padding: 0.2rem;
  }
  .os-panel-close:hover { color: #fff; }
  .os-panel-body { padding: 1rem 1.2rem; }
  .os-field { margin-bottom: 1.25rem; }
  .os-field > label {
    font-size: 0.7rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.06em; color: rgba(255,255,255,0.4); margin-bottom: 0.5rem; display: block;
  }

  /* Template cards */
  .os-template-grid { display: flex; flex-direction: column; gap: 0.5rem; }
  .os-tpl-card {
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px; padding: 0.65rem 0.85rem; cursor: pointer;
    transition: all 0.15s;
  }
  .os-tpl-card:hover { border-color: rgba(255,255,255,0.15); background: rgba(255,255,255,0.05); }
  .os-tpl-card.active { border-color: var(--primary, #6366f1); background: rgba(99,102,241,0.08); }
  .os-tpl-card .tpl-name { font-size: 0.85rem; font-weight: 600; color: #fff; }
  .os-tpl-card .tpl-desc { font-size: 0.75rem; color: rgba(255,255,255,0.4); margin-top: 0.15rem; }

  /* Color fields */
  .os-color-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .os-color-field {
    display: flex; align-items: center; gap: 0.5rem;
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px; padding: 0.4rem 0.6rem;
  }
  .os-color-field span { font-size: 0.75rem; color: rgba(255,255,255,0.5); flex: 1; }
  .os-color-field input[type=color] {
    width: 28px; height: 28px; border: none; border-radius: 6px;
    cursor: pointer; background: none; padding: 0;
  }

  /* Section toggles */
  .os-section-list { display: flex; flex-direction: column; gap: 0.35rem; }
  .os-section-item {
    display: flex; align-items: center; gap: 0.6rem;
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
    border-radius: 8px; padding: 0.5rem 0.7rem; cursor: grab;
  }
  .os-section-item label { flex: 1; font-size: 0.8rem; color: rgba(255,255,255,0.7); cursor: pointer; }
  .os-section-item input[type=checkbox] { accent-color: var(--primary, #6366f1); }
  .os-drag-handle { color: rgba(255,255,255,0.2); font-size: 0.8rem; cursor: grab; }

  /* Links editor */
  .os-links-list { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.5rem; }
  .os-link-item {
    display: flex; gap: 0.4rem; align-items: center;
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
    border-radius: 8px; padding: 0.35rem 0.5rem;
  }
  .os-link-item input {
    flex: 1; background: transparent; border: none; color: #fff;
    font-size: 0.8rem; font-family: inherit; outline: none;
    padding: 0.2rem;
  }
  .os-link-item input::placeholder { color: rgba(255,255,255,0.2); }
  .os-link-remove {
    background: none; border: none; color: rgba(255,255,255,0.25);
    cursor: pointer; font-size: 1rem; padding: 0 0.2rem;
  }
  .os-link-remove:hover { color: #ef4444; }
  .os-add-link {
    background: none; border: 1px dashed rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.4); border-radius: 8px; padding: 0.45rem;
    font-size: 0.8rem; cursor: pointer; width: 100%; font-family: inherit;
  }
  .os-add-link:hover { border-color: rgba(255,255,255,0.2); color: rgba(255,255,255,0.6); }

  /* Push page content up so edit bar doesn't overlap */
  body.os-owner { padding-bottom: 60px !important; }

  @media (max-width: 480px) {
    #os-customize { width: 100%; bottom: 52px; border-radius: 16px 16px 0 0; }
    .os-panel { border-radius: 16px 16px 0 0; }
  }
</style>

<script>
(function() {
  'use strict';

  const API_URL = ${JSON.stringify(apiUrl)};
  const ACCOUNT_ID = ${JSON.stringify(accountId)};
  let config = ${configJson};
  const TEMPLATES = ${templatesJson};
  const ALL_SECTIONS = ${sectionsJson};
  let editMode = false;
  let saveTimeout = null;
  let links = [];

  document.body.classList.add('os-owner');

  // ── Init ────────────────────────────────────────────────────────────

  function init() {
    // Mark editable fields
    const nameEl = document.querySelector('.name, h1');
    const bioEl = document.querySelector('.bio');
    const taglineEl = document.querySelector('.tagline');
    if (nameEl) { nameEl.setAttribute('data-os-editable', 'name'); nameEl.setAttribute('data-os-placeholder', 'Your name'); }
    if (bioEl) { bioEl.setAttribute('data-os-editable', 'bio'); bioEl.setAttribute('data-os-placeholder', 'Write something about yourself...'); }
    if (taglineEl) { taglineEl.setAttribute('data-os-editable', 'tagline'); taglineEl.setAttribute('data-os-placeholder', 'Your tagline'); }

    // If no tagline element exists, create one after name
    if (!taglineEl && nameEl) {
      const tl = document.createElement('p');
      tl.className = 'tagline';
      tl.setAttribute('data-os-editable', 'tagline');
      tl.setAttribute('data-os-placeholder', 'Add a tagline...');
      nameEl.insertAdjacentElement('afterend', tl);
    }

    // If no bio element exists, create one
    if (!bioEl) {
      const bi = document.createElement('p');
      bi.className = 'bio';
      bi.setAttribute('data-os-editable', 'bio');
      bi.setAttribute('data-os-placeholder', 'Write something about yourself...');
      const afterEl = document.querySelector('.tagline') || nameEl;
      if (afterEl) afterEl.insertAdjacentElement('afterend', bi);
    }

    // Init links from page
    const linkBtns = document.querySelectorAll('.link-btn, .link-card');
    links = Array.from(linkBtns).map(a => ({
      label: a.textContent.trim(),
      url: a.getAttribute('href') || ''
    }));

    renderTemplates();
    renderSections();
    renderColors();
    renderLinks();
  }

  // ── Edit mode toggle ─────────────────────────────────────────────────

  window.osToggleEdit = function() {
    editMode = !editMode;
    const btn = document.getElementById('os-btn-edit');
    btn.classList.toggle('active', editMode);
    document.body.classList.toggle('os-editing', editMode);

    document.querySelectorAll('[data-os-editable]').forEach(el => {
      el.contentEditable = editMode ? 'true' : 'false';
      if (editMode) {
        el.addEventListener('input', onFieldInput);
        el.addEventListener('blur', onFieldBlur);
        el.addEventListener('keydown', onFieldKeydown);
      } else {
        el.removeEventListener('input', onFieldInput);
        el.removeEventListener('blur', onFieldBlur);
        el.removeEventListener('keydown', onFieldKeydown);
      }
    });
  };

  function onFieldInput() { scheduleSave(); }
  function onFieldBlur() { scheduleSave(); }
  function onFieldKeydown(e) {
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  }

  // ── Customize panel ──────────────────────────────────────────────────

  window.osToggleCustomize = function() {
    const panel = document.getElementById('os-customize');
    const isVisible = panel.classList.contains('os-panel-visible');
    panel.classList.toggle('os-panel-hidden', !isVisible);
    panel.classList.toggle('os-panel-visible', isVisible);
    if (!isVisible) {
      panel.classList.remove('os-panel-hidden');
      panel.classList.add('os-panel-visible');
    }
  };

  // ── Template picker ──────────────────────────────────────────────────

  function renderTemplates() {
    const container = document.getElementById('os-templates');
    container.innerHTML = TEMPLATES.map(t =>
      '<div class="os-tpl-card' + (config.template === t.id ? ' active' : '') + '" onclick="osSelectTemplate(\\''+t.id+'\\')">'+
        '<div class="tpl-name">'+t.name+'</div>'+
        '<div class="tpl-desc">'+t.desc+'</div>'+
      '</div>'
    ).join('');
  }

  window.osSelectTemplate = function(id) {
    config.template = id;
    renderTemplates();
    saveConfig();
    // Reload to re-render with new template
    showStatus('Switching template...', 'saving');
    setTimeout(() => location.reload(), 600);
  };

  // ── Color pickers ────────────────────────────────────────────────────

  function renderColors() {
    const theme = config.theme || {};
    const el = (id) => document.getElementById(id);
    el('os-color-primary').value = theme.primary || '#6366f1';
    el('os-color-bg').value = theme.background || '#0f0f11';
    el('os-color-text').value = theme.text || '#e4e4e7';
    el('os-color-accent').value = theme.accent || theme.primary || '#6366f1';
  }

  window.osColorChange = function() {
    const primary = document.getElementById('os-color-primary').value;
    const bg = document.getElementById('os-color-bg').value;
    const text = document.getElementById('os-color-text').value;
    const accent = document.getElementById('os-color-accent').value;

    config.theme = { primary, background: bg, text, accent };

    // Live preview — update CSS variables
    document.documentElement.style.setProperty('--primary', primary);
    document.documentElement.style.setProperty('--bg', bg);
    document.documentElement.style.setProperty('--text', text);
    document.documentElement.style.setProperty('--accent', accent);
    document.body.style.background = bg;
    document.body.style.color = text;

    scheduleSaveConfig();
  };

  // ── Section toggles ──────────────────────────────────────────────────

  function renderSections() {
    const container = document.getElementById('os-sections');
    const active = config.sections || ['profile','links','support','posts','badges'];
    container.innerHTML = ALL_SECTIONS.map(s =>
      '<div class="os-section-item" draggable="true" data-section="'+s.id+'">'+
        '<span class="os-drag-handle">⠿</span>'+
        '<input type="checkbox" id="os-sec-'+s.id+'" '+(active.includes(s.id)?'checked':'')+' onchange="osSectionToggle(\\''+s.id+'\\',this.checked)" />'+
        '<label for="os-sec-'+s.id+'">'+s.label+'</label>'+
      '</div>'
    ).join('');
  }

  window.osSectionToggle = function(id, checked) {
    let sections = config.sections || ['profile','links','support','posts','badges'];
    sections = sections.filter(s => s !== id);
    if (checked) sections.push(id);
    config.sections = sections;
    scheduleSaveConfig();
  };

  // ── Links editor ─────────────────────────────────────────────────────

  function renderLinks() {
    const container = document.getElementById('os-links-list');
    container.innerHTML = links.map((l, i) =>
      '<div class="os-link-item">'+
        '<input type="text" value="'+escAttr(l.label)+'" placeholder="Label" onchange="osLinkChange('+i+',\\'label\\',this.value)" />'+
        '<input type="text" value="'+escAttr(l.url)+'" placeholder="https://..." onchange="osLinkChange('+i+',\\'url\\',this.value)" />'+
        '<button class="os-link-remove" onclick="osRemoveLink('+i+')">✕</button>'+
      '</div>'
    ).join('');
  }

  window.osAddLink = function() {
    links.push({ label: '', url: '' });
    renderLinks();
  };

  window.osRemoveLink = function(i) {
    links.splice(i, 1);
    renderLinks();
    scheduleSaveLinks();
  };

  window.osLinkChange = function(i, field, value) {
    links[i][field] = value;
    scheduleSaveLinks();
  };

  // ── Save logic ───────────────────────────────────────────────────────

  let configSaveTimeout = null;
  let linksSaveTimeout = null;

  function scheduleSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveFields, 800);
  }

  function scheduleSaveConfig() {
    clearTimeout(configSaveTimeout);
    configSaveTimeout = setTimeout(saveConfig, 600);
  }

  function scheduleSaveLinks() {
    clearTimeout(linksSaveTimeout);
    linksSaveTimeout = setTimeout(saveLinksData, 600);
  }

  async function saveFields() {
    const fields = {};
    document.querySelectorAll('[data-os-editable]').forEach(el => {
      const key = el.getAttribute('data-os-editable');
      const text = el.textContent.trim();
      if (key === 'name') fields['profile/name'] = text;
      else if (key === 'bio') fields['profile/bio'] = text;
      else if (key === 'tagline') {
        config.tagline = text;
        fields['page/main'] = JSON.stringify(config);
      }
    });

    for (const [path, value] of Object.entries(fields)) {
      await apiSave(path, value);
    }
  }

  async function saveConfig() {
    await apiSave('page/main', JSON.stringify(config));
  }

  async function saveLinksData() {
    const filtered = links.filter(l => l.label || l.url);
    await apiSave('profile/links', JSON.stringify(filtered));
  }

  async function apiSave(path, value) {
    showStatus('Saving...', 'saving');
    try {
      const resp = await fetch(API_URL + '/compose/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ path, value }),
      });
      if (resp.ok) {
        showStatus('Saved ✓', 'saved');
      } else {
        const err = await resp.text();
        showStatus('Save failed', 'error');
        console.error('Save error:', err);
      }
    } catch (e) {
      showStatus('Offline — retry', 'error');
      console.error('Save error:', e);
    }
  }

  function showStatus(msg, cls) {
    const el = document.getElementById('os-save-status');
    el.textContent = msg;
    el.className = cls || '';
    if (cls === 'saved') {
      setTimeout(() => { el.textContent = ''; el.className = ''; }, 2000);
    }
  }

  function escAttr(s) {
    return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Boot ─────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
</script>
`;
}
