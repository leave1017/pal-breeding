/* Shared theme handling for every page on the site.
   Loaded blocking from <head> so the stored theme is applied before first
   paint — a deferred script would show a light flash on a dark-mode visit.
   The homepage listens for the 'pal:theme' event to forward the change into
   the calculator iframe; it does not bind the button itself. */
(function () {
  var root = document.documentElement;
  var stored = null;
  try { stored = localStorage.getItem('theme'); } catch (e) {}
  if (stored) {
    root.setAttribute('data-theme', stored);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    root.setAttribute('data-theme', 'dark');
  }

  function bind() {
    var btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      document.dispatchEvent(new CustomEvent('pal:theme', { detail: next }));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
