/**
 * Smart 1 Marketing — Marketing Efficiency Audit™ embed loader
 *
 * Drop this on any page:
 *   <div id="smart1-audit"></div>
 *   <script src="https://YOUR-APP.onrender.com/embed.js" data-target="#smart1-audit"></script>
 *
 * Optional attributes on the script tag:
 *   data-target   CSS selector for the container. Defaults to the script's parent element.
 *   data-title    iframe title for screen readers.
 *   data-scroll   "off" to stop the page from scrolling when the visitor changes step.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;

  var origin = new URL(script.src).origin;
  var target = script.getAttribute('data-target');
  var mount = target ? document.querySelector(target) : script.parentElement;
  if (!mount) {
    console.error('[smart1-audit] Container not found:', target);
    return;
  }

  var iframe = document.createElement('iframe');
  iframe.src = origin + '/?embed=1';
  iframe.title = script.getAttribute('data-title') || 'Marketing Efficiency Audit';
  iframe.loading = 'lazy';
  iframe.setAttribute('scrolling', 'no');
  iframe.style.cssText = 'width:100%;border:0;display:block;min-height:640px;transition:height .2s ease';
  mount.appendChild(iframe);

  var allowScroll = script.getAttribute('data-scroll') !== 'off';

  window.addEventListener('message', function (e) {
    if (e.origin !== origin || !e.data || typeof e.data !== 'object') return;

    if (e.data.type === 's1-audit-height' && typeof e.data.height === 'number') {
      iframe.style.height = Math.max(e.data.height, 400) + 'px';
    }

    if (e.data.type === 's1-audit-scroll' && allowScroll) {
      var top = iframe.getBoundingClientRect().top + window.pageYOffset - 24;
      if (window.pageYOffset > top) window.scrollTo({ top: top, behavior: 'smooth' });
    }
  });
})();
