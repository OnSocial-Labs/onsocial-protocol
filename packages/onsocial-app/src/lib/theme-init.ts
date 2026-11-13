/** Shared key for persisted OS theme (light / dark). */
export const THEME_STORAGE_KEY = 'onsocial.theme';

/** A `theme-color` meta cannot read a CSS variable. */
export const THEME_BAR_LIGHT = '#ffffff';
export const THEME_BAR_DARK = '#0c0d10';

export const THEME_CANVAS_LIGHT = '#ffffff';
export const THEME_CANVAS_DARK = '#000000';

/**
 * Blocking first paint. A stored choice wins and locks the bar.
 * Installed standalone with no stored choice stays dark so the splash and
 * the first frame are both black. A browser tab still follows the system.
 */
export const themeInitScript = `(function(){
  if(document.documentElement.getAttribute('data-theme-boot')==='1') return;
  document.documentElement.setAttribute('data-theme-boot','1');
  var KEY=${JSON.stringify(THEME_STORAGE_KEY)};
  var BAR={light:${JSON.stringify(THEME_BAR_LIGHT)},dark:${JSON.stringify(THEME_BAR_DARK)}};
  var CANVAS={light:${JSON.stringify(THEME_CANVAS_LIGHT)},dark:${JSON.stringify(THEME_CANVAS_DARK)}};
  function locked(){
    try{
      var stored=localStorage.getItem(KEY);
      return stored==='light'||stored==='dark';
    }catch(e){return false;}
  }
  function paint(theme, lockBar){
    if(theme!=='light'&&theme!=='dark') theme='dark';
    var root=document.documentElement;
    if(root.getAttribute('data-theme')!==theme) root.setAttribute('data-theme', theme);
    root.style.colorScheme=theme;
    var style=document.getElementById('onsocial-theme-canvas');
    if(!style){
      style=document.createElement('style');
      style.id='onsocial-theme-canvas';
      (document.head||root).appendChild(style);
    }
    style.textContent='html,body{background-color:'+CANVAS[theme]+'}';
    if(!lockBar) return;
    var nodes=document.querySelectorAll('meta[name="theme-color"]');
    if(!nodes.length){
      var meta=document.createElement('meta');
      meta.setAttribute('name','theme-color');
      meta.setAttribute('content', BAR[theme]);
      (document.head||root).appendChild(meta);
      return;
    }
    for(var i=0;i<nodes.length;i++) nodes[i].setAttribute('content', BAR[theme]);
  }
  function fromMedia(){
    try{
      if(window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
    }catch(e){}
    return 'dark';
  }
  function installed(){
    try{
      if(window.matchMedia('(display-mode: standalone)').matches) return true;
    }catch(e){}
    try{
      if(navigator.standalone===true) return true;
    }catch(e){}
    return false;
  }
  function barLocked(){
    return locked() || installed();
  }
  function resolve(){
    try{
      var stored=localStorage.getItem(KEY);
      if(stored==='light'||stored==='dark') return stored;
    }catch(e){}
    if(installed()) return 'dark';
    return fromMedia();
  }
  function syncBar(){
    if(!barLocked()) return;
    var theme=document.documentElement.getAttribute('data-theme')==='light'?'light':'dark';
    var want=BAR[theme];
    var nodes=document.querySelectorAll('meta[name="theme-color"]');
    for(var i=0;i<nodes.length;i++){
      if(nodes[i].getAttribute('content')!==want) nodes[i].setAttribute('content', want);
    }
  }
  try{
    paint(resolve(), barLocked());
    var root=document.documentElement;
    new MutationObserver(function(){
      paint(root.getAttribute('data-theme')==='light'?'light':'dark', barLocked());
      syncBar();
    }).observe(root,{attributes:true,attributeFilter:['data-theme']});
    if(document.head){
      new MutationObserver(syncBar).observe(document.head,{
        childList:true,
        subtree:true
      });
    }
    try{
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function(event){
        if(locked() || installed()) return;
        paint(event.matches?'light':'dark', false);
      });
    }catch(e){}
  }catch(e){
    try{ paint('dark', false); }catch(err){}
  }
})();`;
