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
    if (btn) {
      btn.addEventListener('click', function () {
        var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        try { localStorage.setItem('theme', next); } catch (e) {}
        document.dispatchEvent(new CustomEvent('pal:theme', { detail: next }));
      });
    }
    bindNav();
  }

  /* The nav collapses behind a button below 820px. CSS does the hiding; this
     only tracks open/closed, so with the stylesheet applied and scripting off
     the links stay where they are rather than disappearing. */
  function bindNav() {
    var toggle = document.getElementById('navToggle');
    var links = document.getElementById('navLinks');
    if (!toggle || !links) return;

    /* A tap anywhere else should close the menu, but on the homepage "anywhere
       else" is mostly the calculator iframe, and a click inside an iframe never
       reaches this document — the drawer would sit there open over the tool.
       A scrim catches those taps, and doubles as the usual signal that the menu
       is holding the page. */
    var scrim = document.createElement('div');
    scrim.className = 'nav__scrim';
    scrim.hidden = true;
    document.body.appendChild(scrim);
    scrim.addEventListener('click', function () { setOpen(false); });

    function setOpen(open) {
      if (open) links.setAttribute('data-open', ''); else links.removeAttribute('data-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      scrim.hidden = !open;
    }

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    // Following a link or pressing Escape closes it too.
    document.addEventListener('click', function (e) {
      if (links.hasAttribute('data-open') && !links.contains(e.target) && e.target !== scrim) {
        setOpen(false);
      }
    });
    links.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && links.hasAttribute('data-open')) {
        setOpen(false);
        toggle.focus();
      }
    });
    // Left open on a phone and then rotated to landscape, the drawer would
    // otherwise stay stuck open over a layout that no longer has a button.
    window.addEventListener('resize', function () {
      if (window.innerWidth > 820) setOpen(false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
