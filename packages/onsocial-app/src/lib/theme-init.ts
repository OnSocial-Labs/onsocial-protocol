/** Shared key for persisted OS theme (light / dark). */
export const THEME_STORAGE_KEY = 'onsocial.theme';

/** Blocking pre-hydration script — keep in sync with ThemeToggle. */
export const themeInitScript = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}else{document.documentElement.setAttribute('data-theme',window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');}}catch(e){document.documentElement.setAttribute('data-theme','dark');}`;
