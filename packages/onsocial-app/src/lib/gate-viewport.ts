/**
 * Pin the logged-out gate to the visible viewport.
 * `dvh` is the fallback before this runs. iOS keeps the large layout
 * viewport (and a backdrop layer) until a rotation, so the rail and the
 * pill frost are snapshotted against the first size. Publishing the
 * visual viewport on resize, orientation, and visual-viewport scroll
 * lets the flex column recompute instead of waiting for that rotation.
 */
export const gateViewportScript = `(function(){
  var root = document.documentElement;
  if (root.dataset.gateViewport === '1') return;
  root.dataset.gateViewport = '1';
  function sync(){
    var vv = window.visualViewport;
    var layout = window.innerHeight || 0;
    var height = vv && vv.height ? vv.height : layout;
    if (!height) return;
    var offset = vv ? vv.offsetTop || 0 : 0;
    /* The portfolio frame and the fixed dock share this edge. 100dvh can
       extend past the visual bottom on Android (URL bar, gesture bar, standalone),
       which left the face slot below the pill. */
    var visualBottom = offset + height;
    var lift = Math.max(0, Math.round(layout - visualBottom));
    root.style.setProperty('--gate-viewport-height', Math.round(height) + 'px');
    root.style.setProperty('--gate-viewport-offset', Math.round(offset) + 'px');
    root.style.setProperty('--portfolio-viewport-height', Math.round(visualBottom) + 'px');
    root.style.setProperty('--portfolio-dock-bottom', lift + 'px');
    var standalone = false;
    try {
      standalone = window.matchMedia('(display-mode: standalone)').matches
        || window.matchMedia('(display-mode: fullscreen)').matches
        || navigator.standalone === true;
    } catch (e) {}
    if (standalone) root.setAttribute('data-pwa-standalone', '');
    else root.removeAttribute('data-pwa-standalone');
  }
  sync();
  window.addEventListener('resize', sync);
  window.addEventListener('orientationchange', sync);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', sync);
    window.visualViewport.addEventListener('scroll', sync);
  }
})();`;
