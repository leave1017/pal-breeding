/* Search, filter, sort and row-cap for the hub listings — the table on
   /breeding/ and the icon grid on /pals/. Both use the same markup contract:

     <div data-table-filter data-src="/data/hub-x.html">
       …filter bar…
       <tbody data-items> or <div data-items data-grid>   ← 30 items, server-rendered
       <p data-empty> <button data-more>

   Every item carries its own data- attributes, so the script never needs to
   know which page it is on. The first 30 come down in the HTML; the remaining
   269 arrive as a pre-rendered fragment from data-src, which keeps one
   template in the generator instead of a second copy here.

   With JS off you get those 30 plus a link to the calculator — real content,
   not an empty shell waiting on a script. */
(function () {
  var CAP = 50;   // items shown before "Show all"

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  /* Two tiers, same as the calculator: the strict tests first, and a loose
     subsequence pass only when strict finds almost nothing. "anb" should still
     reach Anubis; "fire" should not drag in every name containing f, i, r, e. */
  function strictMatch(row, q) {
    return row.name.indexOf(q) !== -1
      || row.dex.indexOf(q) === 0
      || (q.charAt(0) === '#' && row.dex.indexOf(q.slice(1)) === 0)
      || row.terms.indexOf(q) !== -1;
  }

  function subsequence(name, q) {
    var i = 0;
    for (var j = 0; j < name.length && i < q.length; j++) {
      if (name.charAt(j) === q.charAt(i)) i++;
    }
    return i === q.length;
  }

  function rank(r, q) {
    if (r.name === q || r.dex === q) return 0;
    if (r.name.indexOf(q) === 0 || r.dex.indexOf(q) === 0) return 1;
    if (r.name.indexOf(q) !== -1) return 2;
    return 3;
  }

  function search(rows, q) {
    if (!q) return rows;
    var strict = rows.filter(function (r) { return strictMatch(r, q); })
      .sort(function (a, b) { return rank(a, q) - rank(b, q); });
    if (strict.length >= 3) return strict;
    var seen = {};
    strict.forEach(function (r) { seen[r.key] = true; });
    var loose = rows.filter(function (r) { return !seen[r.key] && subsequence(r.name, q); })
      .sort(function (a, b) { return a.name.length - b.name.length; });
    return strict.concat(loose);
  }

  function setup(root) {
    var container = root.querySelector('[data-items]');
    if (!container) return;

    /* The remaining 269 items load on the first interaction, not on load.
       Fetching them up front put all 299 back into the rendered DOM, which
       undoes the point of shipping 30: a reader who never touches the
       controls, and anything measuring the rendered page, would see the full
       list again. Any of search, a chip, a sort or "Show all" pulls them in,
       and the controls stay responsive because the fetch resolves long before
       a second keystroke lands. */
    var pending = null;

    var reveal = root.querySelector('[data-reveal]');
    var moreBtn = root.querySelector('[data-more]');
    var countEl = root.querySelector('[data-count]');
    var emptyEl = root.querySelector('[data-empty]');
    var input = root.querySelector('[data-search]');
    var sortSelect = root.querySelector('[data-sortby]');
    var table = container.closest ? container.closest('table') : null;

    var rows = [];
    var total = parseInt(root.getAttribute('data-total'), 10) || 0;
    var state = { q: '', elements: [], work: [], flags: [], sort: null, dir: 1, expanded: false };

    function readItems() {
      rows = [].slice.call(container.children).map(function (node, i) {
        return {
          node: node,
          key: i,
          name: (node.getAttribute('data-name') || '').toLowerCase(),
          dex: node.getAttribute('data-dex') || '',
          elements: (node.getAttribute('data-el') || '').split(' ').filter(Boolean),
          work: (node.getAttribute('data-work') || '').split(' ').filter(Boolean),
          flags: (node.getAttribute('data-flags') || '').split(' ').filter(Boolean),
          terms: (node.getAttribute('data-terms') || '').toLowerCase(),
        };
      });
    }

    function num(node, key) { return parseFloat(node.getAttribute('data-' + key)) || 0; }

    function hasAll(have, want) {
      return want.every(function (v) { return have.indexOf(v) !== -1; });
    }

    function apply() {
      var q = state.q.trim().toLowerCase();
      var out = search(rows, q).filter(function (r) {
        return hasAll(r.elements, state.elements)
          && hasAll(r.work, state.work)
          && hasAll(r.flags, state.flags);
      });

      if (state.sort) {
        var key = state.sort, dir = state.dir;
        out = out.slice().sort(function (a, b) {
          if (key === 'name') return a.name.localeCompare(b.name) * dir;
          return (num(a.node, key) - num(b.node, key)) * dir || a.name.localeCompare(b.name);
        });
      }

      var shown = {};
      out.forEach(function (r) { shown[r.key] = true; });
      rows.forEach(function (r) { r.node.hidden = !shown[r.key]; });
      if (state.sort || q) out.forEach(function (r) { container.appendChild(r.node); });

      // Until the fragment lands, rows.length is 30 while the page really has
      // `total` — so report the total and keep the cap on.
      var loaded = rows.length >= total;
      reveal.classList.toggle('is-capped', !state.expanded && (out.length > CAP || !loaded));
      if (moreBtn) {
        moreBtn.hidden = loaded && out.length <= CAP;
        moreBtn.textContent = state.expanded ? 'Show fewer' : 'Show all ' + (loaded ? out.length : total);
      }
      if (countEl) {
        countEl.textContent = !loaded || out.length === rows.length
          ? String(total)
          : out.length + ' of ' + total;
      }
      if (emptyEl) emptyEl.hidden = out.length > 0;
      if (table) table.hidden = out.length === 0;
      else container.hidden = out.length === 0;
    }

    function reset() {
      state = { q: '', elements: [], work: [], flags: [], sort: null, dir: 1, expanded: false };
      if (input) input.value = '';
      if (sortSelect) sortSelect.selectedIndex = 0;
      [].forEach.call(root.querySelectorAll('[aria-pressed]'), function (b) {
        b.setAttribute('aria-pressed', 'false');
      });
      [].forEach.call(root.querySelectorAll('th[data-sort]'), function (th) {
        th.setAttribute('aria-sort', 'none');
      });
      apply();
    }

    function ensureAll(then) {
      var src = root.getAttribute('data-src');
      if (!src || !window.fetch || root.hasAttribute('data-loaded')) {
        then();
        return;
      }
      root.setAttribute('data-loaded', '');
      pending = fetch(src)
        .then(function (r) { return r.ok ? r.text() : Promise.reject(r.status); })
        .then(function (html) {
          container.insertAdjacentHTML('beforeend', html);
          readItems();
        })
        .catch(function () { /* keep what the server sent */ });
      pending.then(then);
    }

    function toggle(list, value, btn) {
      var at = list.indexOf(value);
      if (at === -1) list.push(value); else list.splice(at, 1);
      btn.setAttribute('aria-pressed', at === -1 ? 'true' : 'false');
      state.expanded = false;
      ensureAll(apply);
    }

    if (input) {
      input.addEventListener('input', function () {
        state.q = input.value;
        state.expanded = false;
        ensureAll(apply);
      });
    }

    [['[data-element]', 'data-element', 'elements'],
     ['[data-work]', 'data-work', 'work'],
     ['[data-flag]', 'data-flag', 'flags']].forEach(function (spec) {
      [].forEach.call(root.querySelectorAll(spec[0]), function (btn) {
        btn.addEventListener('click', function () {
          toggle(state[spec[2]], btn.getAttribute(spec[1]), btn);
        });
      });
    });

    // Table: sortable column headers. Grid: a select, since a grid has no
    // headers to click.
    [].forEach.call(root.querySelectorAll('th[data-sort]'), function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-sort');
        if (state.sort === key) {
          state.dir = -state.dir;
        } else {
          state.sort = key;
          // Counts and power read best highest-first; names read best A–Z.
          state.dir = th.hasAttribute('data-desc') ? -1 : 1;
        }
        [].forEach.call(root.querySelectorAll('th[data-sort]'), function (other) {
          other.setAttribute('aria-sort',
            other === th ? (state.dir === 1 ? 'ascending' : 'descending') : 'none');
        });
        ensureAll(apply);
      });
    });

    if (sortSelect) {
      sortSelect.addEventListener('change', function () {
        var parts = sortSelect.value.split(':');
        state.sort = parts[0] || null;
        state.dir = parts[1] === 'desc' ? -1 : 1;
        ensureAll(apply);
      });
    }

    if (moreBtn) {
      moreBtn.addEventListener('click', function () {
        state.expanded = !state.expanded;
        ensureAll(function () {
          apply();
          if (!state.expanded) reveal.scrollIntoView({ block: 'start', behavior: 'smooth' });
        });
      });
    }

    [].forEach.call(root.querySelectorAll('[data-reset]'), function (btn) {
      btn.addEventListener('click', reset);
    });

    readItems();
    apply();
  }

  ready(function () {
    [].forEach.call(document.querySelectorAll('[data-table-filter]'), setup);
  });
})();
