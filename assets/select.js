/* Replaces the native <select> popup with one we can actually style.
   A native option list is drawn by the operating system — no CSS reaches it —
   so the only way to make the open menu match the site is to stop using it.

   The real <select> stays in the DOM, hidden and out of the tab order. It
   remains the source of truth: choosing an option sets its value and fires a
   normal change event, so every existing listener keeps working, and with JS
   off the page falls back to the plain control. */
(function () {
  var CHEVRON = '<svg class="fsel__arrow" viewBox="0 0 12 8" fill="none" stroke="currentColor" '
    + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M1 1.5 6 6.5l5-5"/></svg>';

  var openOne = null;

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function enhance(select) {
    if (select.__fsel || select.multiple || select.hasAttribute('data-plain')) return;
    select.__fsel = true;

    var wrap = document.createElement('div');
    wrap.className = 'fsel';
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add('fsel__native');
    select.setAttribute('tabindex', '-1');
    select.setAttribute('aria-hidden', 'true');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fsel__btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    var label = select.getAttribute('aria-label') || select.getAttribute('title');
    if (label) btn.setAttribute('aria-label', label);
    wrap.appendChild(btn);

    var list = document.createElement('div');
    list.className = 'fsel__list';
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    if (label) list.setAttribute('aria-label', label);
    wrap.appendChild(list);

    var options = [];

    function build() {
      list.textContent = '';
      options = [].map.call(select.options, function (opt, i) {
        var item = document.createElement('div');
        item.className = 'fsel__opt';
        item.setAttribute('role', 'option');
        item.setAttribute('data-index', i);
        item.textContent = opt.textContent;
        item.setAttribute('aria-selected', i === select.selectedIndex ? 'true' : 'false');
        if (opt.disabled) item.setAttribute('aria-disabled', 'true');
        list.appendChild(item);
        return item;
      });
    }

    function sync() {
      var opt = select.options[select.selectedIndex];
      btn.innerHTML = '';
      btn.appendChild(document.createTextNode(opt ? opt.textContent : ''));
      btn.insertAdjacentHTML('beforeend', CHEVRON);
      options.forEach(function (item, i) {
        item.setAttribute('aria-selected', i === select.selectedIndex ? 'true' : 'false');
      });
    }

    function open() {
      if (openOne && openOne !== close) openOne();
      openOne = close;
      list.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      var current = options[select.selectedIndex];
      if (current) {
        current.classList.add('is-active');
        // Bring the checked row into view when the list is long enough to scroll.
        if (list.scrollHeight > list.clientHeight) {
          list.scrollTop = current.offsetTop - list.clientHeight / 2 + current.offsetHeight / 2;
        }
      }
    }

    function close(focusBtn) {
      list.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      options.forEach(function (o) { o.classList.remove('is-active'); });
      if (openOne === close) openOne = null;
      if (focusBtn === true) btn.focus();
    }

    function choose(i) {
      if (i < 0 || i >= select.options.length || select.options[i].disabled) return;
      select.selectedIndex = i;
      sync();
      close(true);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function active() {
      var at = list.querySelector('.is-active');
      return at ? +at.getAttribute('data-index') : select.selectedIndex;
    }

    function setActive(i) {
      var max = options.length - 1;
      i = i < 0 ? 0 : (i > max ? max : i);
      options.forEach(function (o) { o.classList.remove('is-active'); });
      options[i].classList.add('is-active');
      var top = options[i].offsetTop, h = options[i].offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (top + h > list.scrollTop + list.clientHeight) list.scrollTop = top + h - list.clientHeight;
    }

    btn.addEventListener('click', function () {
      if (list.hidden) open(); else close();
    });

    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (list.hidden) open();
        setActive(e.key === 'ArrowUp' ? active() - 1 : active() + (list.hidden ? 0 : 1));
      }
    });

    list.addEventListener('click', function (e) {
      var item = e.target.closest('.fsel__opt');
      if (item) choose(+item.getAttribute('data-index'));
    });

    list.addEventListener('mousemove', function (e) {
      var item = e.target.closest('.fsel__opt');
      if (item) setActive(+item.getAttribute('data-index'));
    });

    wrap.addEventListener('keydown', function (e) {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active() + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active() - 1); }
      else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
      else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active()); }
      else if (e.key === 'Escape' || e.key === 'Tab') { close(e.key === 'Escape'); }
      else if (e.key.length === 1) {
        // Type-ahead, the one native behaviour worth keeping.
        var ch = e.key.toLowerCase();
        for (var i = 1; i <= options.length; i++) {
          var at = (active() + i) % options.length;
          if (options[at].textContent.trim().toLowerCase().charAt(0) === ch) { setActive(at); break; }
        }
      }
    });

    document.addEventListener('click', function (e) {
      if (!list.hidden && !wrap.contains(e.target)) close();
    });

    // Code elsewhere may set .value or .selectedIndex directly, which fires no
    // event; those call sites use this hook to refresh the label.
    select._fselSync = function () { build(); sync(); };
    select.addEventListener('change', sync);

    build();
    sync();
  }

  function enhanceAll(root) {
    var scope = root || document;
    [].forEach.call(scope.querySelectorAll('select'), enhance);
  }

  window.PalSelect = { enhance: enhanceAll };
  ready(function () { enhanceAll(); });
})();
