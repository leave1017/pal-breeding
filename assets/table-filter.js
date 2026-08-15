/* Search, filter, sort and row-cap for the two hub tables (/breeding/ and
   /pals/). Everything it works on is already in the HTML — this script only
   hides and reorders rows that the server rendered. That matters: all 299
   links stay in the document, so the hubs keep feeding the Pal pages even
   though the visitor sees a short list.

   Progressive enhancement: with JS off the full table renders uncapped and
   unfiltered, which is also what a crawler that skips scripts sees. */
(function () {
  var CAP = 50;   // rows shown before "Show all"

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  /* Same two-tier idea as the calculator: try the strict tests first, and only
     fall back to a loose subsequence match when strict finds almost nothing.
     Typing "anb" should still find Anubis; typing "fire" should not drag in
     every name that happens to contain f, i, r and e in order. */
  function strictMatch(row, q) {
    if (row.name.indexOf(q) !== -1) return true;
    if (row.dex.indexOf(q) === 0) return true;
    if (q.charAt(0) === '#' && row.dex.indexOf(q.slice(1)) === 0) return true;
    if (row.terms.indexOf(q) !== -1) return true;
    return false;
  }

  function subsequence(name, q) {
    var i = 0;
    for (var j = 0; j < name.length && i < q.length; j++) {
      if (name.charAt(j) === q.charAt(i)) i++;
    }
    return i === q.length;
  }

  /* Within the strict tier, an exact name beats a prefix beats a mid-word hit,
     so typing "anb" surfaces Anubis rather than whatever the table happened to
     have at the top. */
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
    var found = strict.reduce(function (set, r) { set[r.key] = true; return set; }, {});
    var loose = rows.filter(function (r) { return !found[r.key] && subsequence(r.name, q); })
      .sort(function (a, b) { return a.name.length - b.name.length; });
    return strict.concat(loose);
  }

  function setup(root) {
    var table = root.querySelector('table');
    var tbody = table.querySelector('tbody');
    var reveal = root.querySelector('[data-reveal]');
    var moreBtn = root.querySelector('[data-more]');
    var countEl = root.querySelector('[data-count]');
    var emptyEl = root.querySelector('[data-empty]');
    var input = root.querySelector('[data-search]');

    var rows = [].slice.call(tbody.rows).map(function (tr, i) {
      return {
        tr: tr,
        key: i,
        name: (tr.getAttribute('data-name') || '').toLowerCase(),
        dex: tr.getAttribute('data-dex') || '',
        elements: (tr.getAttribute('data-el') || '').split(' ').filter(Boolean),
        work: (tr.getAttribute('data-work') || '').split(' ').filter(Boolean),
        flags: (tr.getAttribute('data-flags') || '').split(' ').filter(Boolean),
        terms: (tr.getAttribute('data-terms') || '').toLowerCase(),
        sort: tr,
      };
    });

    var state = { q: '', elements: [], work: [], flags: [], sort: null, dir: 1, expanded: false };

    function num(tr, key) { return parseFloat(tr.getAttribute('data-' + key)) || 0; }

    function apply() {
      var out = search(rows, state.q.trim().toLowerCase());

      if (state.elements.length) {
        out = out.filter(function (r) {
          return state.elements.every(function (e) { return r.elements.indexOf(e) !== -1; });
        });
      }
      if (state.work.length) {
        out = out.filter(function (r) {
          return state.work.every(function (w) { return r.work.indexOf(w) !== -1; });
        });
      }
      if (state.flags.length) {
        out = out.filter(function (r) {
          return state.flags.every(function (f) { return r.flags.indexOf(f) !== -1; });
        });
      }

      if (state.sort) {
        var key = state.sort, dir = state.dir;
        out = out.slice().sort(function (a, b) {
          if (key === 'name') return a.name.localeCompare(b.name) * dir;
          return (num(a.tr, key) - num(b.tr, key)) * dir || a.name.localeCompare(b.name);
        });
      }

      var shown = {};
      out.forEach(function (r) { shown[r.key] = true; });
      rows.forEach(function (r) { r.tr.hidden = !shown[r.key]; });
      // Reordering only needs to touch the visible rows; the hidden ones keep
      // their document position, which is all a crawler cares about.
      if (state.sort || state.q.trim()) {
        out.forEach(function (r) { tbody.appendChild(r.tr); });
      }

      var capped = !state.expanded && out.length > CAP;
      reveal.classList.toggle('is-capped', capped);
      if (moreBtn) {
        moreBtn.hidden = out.length <= CAP;
        moreBtn.textContent = state.expanded ? 'Show fewer' : 'Show all ' + out.length;
      }
      if (countEl) countEl.textContent = out.length === rows.length
        ? String(rows.length)
        : out.length + ' of ' + rows.length;
      if (emptyEl) emptyEl.hidden = out.length > 0;
      table.hidden = out.length === 0;
    }

    if (input) {
      input.addEventListener('input', function () { state.q = input.value; state.expanded = false; apply(); });
    }

    [].forEach.call(root.querySelectorAll('[data-element]'), function (btn) {
      btn.addEventListener('click', function () { toggle(state.elements, btn.getAttribute('data-element'), btn); });
    });
    [].forEach.call(root.querySelectorAll('[data-work]'), function (btn) {
      btn.addEventListener('click', function () { toggle(state.work, btn.getAttribute('data-work'), btn); });
    });
    [].forEach.call(root.querySelectorAll('[data-flag]'), function (btn) {
      btn.addEventListener('click', function () { toggle(state.flags, btn.getAttribute('data-flag'), btn); });
    });

    function toggle(list, value, btn) {
      var at = list.indexOf(value);
      if (at === -1) list.push(value); else list.splice(at, 1);
      btn.setAttribute('aria-pressed', at === -1 ? 'true' : 'false');
      state.expanded = false;
      apply();
    }

    [].forEach.call(table.querySelectorAll('th[data-sort]'), function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-sort');
        if (state.sort === key) {
          state.dir = -state.dir;
        } else {
          state.sort = key;
          // Counts and power read best highest-first; names read best A–Z.
          state.dir = th.hasAttribute('data-desc') ? -1 : 1;
        }
        [].forEach.call(table.querySelectorAll('th[data-sort]'), function (other) {
          other.setAttribute('aria-sort', other === th ? (state.dir === 1 ? 'ascending' : 'descending') : 'none');
        });
        apply();
      });
    });

    if (moreBtn) {
      moreBtn.addEventListener('click', function () {
        state.expanded = !state.expanded;
        apply();
        if (!state.expanded) reveal.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    }

    // There are two reset controls — one in the bar, one in the empty state.
    [].forEach.call(root.querySelectorAll('[data-reset]'), function (reset) {
      reset.addEventListener('click', function () {
        state = { q: '', elements: [], work: [], flags: [], sort: null, dir: 1, expanded: false };
        if (input) input.value = '';
        [].forEach.call(root.querySelectorAll('[aria-pressed]'), function (b) { b.setAttribute('aria-pressed', 'false'); });
        [].forEach.call(table.querySelectorAll('th[data-sort]'), function (th) { th.setAttribute('aria-sort', 'none'); });
        apply();
      });
    });

    apply();
  }

  ready(function () {
    [].forEach.call(document.querySelectorAll('[data-table-filter]'), setup);
  });
})();
