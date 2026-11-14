// Token Radar dashboard: renders window.RADAR (written by main.ts) with no network.
//
// The board is sortable (click a column head, or use the Sort control) and
// filterable (search text, category, watchlist vs early finds). Clicking a row
// opens that protocol's detail view: its facts, its model breakdown and its
// seven farm steps. The page also shows the live-token comparables and the
// category ratios the model used, so the ranking can be checked.
//
// Deep links for screenshots and sharing: #detail=<slug> opens a protocol,
// #cat=<category> filters to a category, #q=<text> searches, #scope=<all|
// watchlist|early> picks the scope.

(function () {
  'use strict';

  var R = window.RADAR;
  if (!R || !Array.isArray(R.rows)) {
    document.getElementById('lede').textContent = 'No radar data was loaded. The page needs data.js beside it.';
    return;
  }

  var watchlist = {};
  (R.watchlist || []).forEach(function (s) { watchlist[s] = true; });

  var state = { q: '', cat: '', scope: 'all', sort: 'value', dir: -1, selected: null };

  /** Escape text for HTML. */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** $2.75B, $51.3M, $823K, $512. */
  function money(n) {
    if (n == null || !isFinite(n)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(n >= 1e10 ? 1 : 2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(n);
  }

  /** -8.2%, +12.4%, or — when unreported. */
  function pct(n) {
    if (n == null || !isFinite(n)) return '—';
    var s = (n > 0 ? '+' : '') + n.toFixed(1) + '%';
    return '<span class="' + (n > 0 ? 'pos' : n < 0 ? 'neg' : '') + '">' + s + '</span>';
  }

  /** 677d, 2.0y, or — when unknown. */
  function ageText(days) {
    if (days == null) return '—';
    if (days < 365) return days + 'd';
    return (days / 365).toFixed(1) + 'y';
  }

  function chainText(chains) {
    if (!chains || chains.length === 0) return '—';
    return esc(chains[0]) + (chains.length > 1 ? ' +' + (chains.length - 1) : '');
  }

  function bySlug(slug) {
    for (var i = 0; i < R.rows.length; i++) if (R.rows[i].slug === slug) return R.rows[i];
    return null;
  }

  function sortValue(row, key) {
    switch (key) {
      case 'rank': return row.rank;
      case 'name': return row.name.toLowerCase();
      case 'category': return (row.category || '').toLowerCase();
      case 'chains': return row.chains.length;
      case 'tvl': return row.tvl_usd;
      case 'growth': return row.change_7d == null ? -Infinity : row.change_7d;
      case 'age': return row.age_days == null ? -Infinity : row.age_days;
      case 'value': return row.implied_value_usd;
      default: return row.rank;
    }
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = R.rows.filter(function (row) {
      if (state.scope === 'watchlist' && !watchlist[row.slug]) return false;
      if (state.scope === 'early' && watchlist[row.slug]) return false;
      if (state.cat && row.category !== state.cat) return false;
      if (q) {
        var hay = (row.name + ' ' + row.slug + ' ' + (row.category || '') + ' ' + row.chains.join(' ')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    var key = state.sort === 'value' ? 'value' : state.sort;
    var dir = state.sort === 'name' || state.sort === 'category' ? 1 : state.dir;
    rows.sort(function (a, b) {
      var va = sortValue(a, key), vb = sortValue(b, key);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return a.rank - b.rank;
    });
    return rows;
  }

  function renderBoard() {
    var rows = filteredRows();
    var tb = document.getElementById('rows');
    document.getElementById('count').textContent = rows.length + ' of ' + R.rows.length + ' rows';
    if (rows.length === 0) {
      tb.innerHTML = '<tr><td colspan="8" class="empty">Nothing matches those filters.</td></tr>';
      return;
    }
    var html = '';
    rows.forEach(function (row) {
      var tag = watchlist[row.slug] ? '<span class="pill">Watchlist</span>' : '<span class="pill early">Early</span>';
      html += '<tr data-slug="' + esc(row.slug) + '"' + (state.selected === row.slug ? ' class="selected"' : '') + '>'
        + '<td class="num rank">' + row.rank + '</td>'
        + '<td><span class="name">' + esc(row.name) + '</span><br><span class="slug">' + esc(row.slug) + '</span></td>'
        + '<td>' + esc(row.category || '—') + ' ' + tag + '</td>'
        + '<td class="num">' + chainText(row.chains) + '</td>'
        + '<td class="num">' + money(row.tvl_usd) + '</td>'
        + '<td class="num">' + pct(row.change_7d) + '</td>'
        + '<td class="num">' + ageText(row.age_days) + '</td>'
        + '<td class="num value">' + money(row.implied_value_usd) + '</td>'
        + '</tr>';
    });
    tb.innerHTML = html;
  }

  /** Split a farm step into its action and its "Cost: … Time: …" tail. */
  function stepParts(step) {
    var at = step.indexOf(' Cost: ');
    if (at === -1) return { text: step, tail: '' };
    return { text: step.slice(0, at), tail: step.slice(at + 1) };
  }

  function renderDetail() {
    var box = document.getElementById('detail');
    var row = state.selected ? bySlug(state.selected) : null;
    if (!row) { box.hidden = true; box.innerHTML = ''; return; }
    var tag = watchlist[row.slug] ? 'Watchlist' : 'Early find';
    var base = Math.round(row.tvl_usd * row.category_ratio);
    var steps = row.farm_steps.map(function (s) {
      var p = stepParts(s);
      return '<li>' + esc(p.text) + (p.tail ? ' <b>' + esc(p.tail) + '</b>' : '') + '</li>';
    }).join('');
    box.innerHTML =
      '<h2>#' + row.rank + ' ' + esc(row.name) + ' <span class="pill' + (watchlist[row.slug] ? '' : ' early') + '">' + tag + '</span></h2>'
      + '<p class="sub">' + esc(row.category || 'No category') + ' · ' + esc(row.chains.join(', ') || 'no chain listed')
      + ' · listed ' + esc(row.listed_at || 'unknown') + ' · ' + ageText(row.age_days) + ' old · records no token</p>'
      + '<div class="facts">'
      + '<div class="fact"><div class="k">Implied value</div><div class="v">' + money(row.implied_value_usd) + '</div></div>'
      + '<div class="fact"><div class="k">TVL</div><div class="v">' + money(row.tvl_usd) + '</div></div>'
      + '<div class="fact"><div class="k">7-day change</div><div class="v">' + pct(row.change_7d) + '</div></div>'
      + '<div class="fact"><div class="k">Category ratio</div><div class="v">' + row.category_ratio.toFixed(3) + '</div></div>'
      + '<div class="fact"><div class="k">Chains</div><div class="v">' + row.chains.length + '</div></div>'
      + '</div>'
      + '<p class="model-line">Model: TVL <code>' + money(row.tvl_usd) + '</code> × ratio <code>' + row.category_ratio.toFixed(3)
      + '</code> = base <code>' + money(base) + '</code> × growth <code>' + row.growth_multiplier.toFixed(3)
      + '</code> × maturity <code>' + row.maturity_multiplier.toFixed(3)
      + '</code> × breadth <code>' + row.breadth_multiplier.toFixed(3)
      + '</code> = <code>' + money(row.implied_value_usd) + '</code>.</p>'
      + '<h3>Farm plan</h3><ol class="steps">' + steps + '</ol>';
    box.hidden = false;
  }

  function renderLive() {
    var tb = document.getElementById('live-rows');
    tb.innerHTML = R.live.map(function (p) {
      var ratio = p.tvl_usd > 0 && p.mcap_usd != null ? (p.mcap_usd / p.tvl_usd).toFixed(3) : '—';
      return '<tr><td><span class="name">' + esc(p.name) + '</span><br><span class="slug">' + esc(p.slug) + '</span></td>'
        + '<td>' + esc(p.category || '—') + '</td>'
        + '<td class="num">' + money(p.tvl_usd) + '</td>'
        + '<td class="num">' + money(p.mcap_usd) + '</td>'
        + '<td class="num">' + ratio + '</td></tr>';
    }).join('');
  }

  function renderRatios() {
    var tb = document.getElementById('ratio-rows');
    var list = (R.ratios || []).slice().sort(function (a, b) { return b.ratio - a.ratio; });
    tb.innerHTML = list.map(function (r) {
      return '<tr><td>' + esc(r.category) + '</td><td class="num">' + r.live + '</td><td class="num">' + r.ratio.toFixed(3) + '</td></tr>';
    }).join('');
  }

  function renderHead() {
    var top = R.rows[0];
    document.getElementById('lede').textContent =
      R.board_size + ' pre-token protocols ranked by what their token would be worth if it launched at the going rate for '
      + 'their category: ' + R.watchlist_size + ' from the watchlist and ' + R.early_size + ' early finds below the $'
      + (R.floor_usd / 1e6) + 'M floor. The top row is ' + (top ? top.name : '—') + ' at ' + money(top ? top.implied_value_usd : 0) + '.';
    document.getElementById('meta').innerHTML =
      'Snapshot <b>' + esc(R.as_of) + '</b> · ' + esc(R.source.replace(/^DefiLlama /, '')) + ' · model <b>' + esc(R.model_version) + '</b>';
    document.getElementById('foot-note').textContent =
      'Data: DefiLlama protocols endpoint, fetched ' + R.as_of + '. Implied values are this entry’s own claim from the snapshot’s '
      + 'figures; they do not predict whether or when a token is issued. A protocol “records no token” when the snapshot carries no '
      + 'market cap, CoinGecko id or symbol for it — that is not proof it has none.';
  }

  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    var params = new URLSearchParams(h);
    if (params.get('detail')) state.selected = params.get('detail');
    if (params.get('cat')) state.cat = params.get('cat');
    if (params.get('q')) state.q = params.get('q');
    if (params.get('scope')) state.scope = params.get('scope');
    if (params.get('sort')) state.sort = params.get('sort');
  }

  function syncHash() {
    var p = new URLSearchParams();
    if (state.selected) p.set('detail', state.selected);
    if (state.cat) p.set('cat', state.cat);
    if (state.q) p.set('q', state.q);
    if (state.scope !== 'all') p.set('scope', state.scope);
    if (state.sort !== 'value') p.set('sort', state.sort);
    var s = p.toString();
    history.replaceState(null, '', s ? '#' + s : window.location.pathname);
  }

  function render() {
    renderBoard();
    renderDetail();
    syncHash();
  }

  // Wire up the controls.
  var catSel = document.getElementById('cat');
  var cats = [];
  R.rows.forEach(function (r) { if (r.category && cats.indexOf(r.category) === -1) cats.push(r.category); });
  cats.sort();
  catSel.innerHTML = '<option value="">All categories</option>' + cats.map(function (c) {
    return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
  }).join('');

  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
  catSel.addEventListener('change', function (e) { state.cat = e.target.value; render(); });
  document.getElementById('scope').addEventListener('change', function (e) { state.scope = e.target.value; render(); });
  document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });

  document.querySelectorAll('#board thead th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-sort');
      if (state.sort === key) { state.dir = -state.dir; }
      else {
        state.sort = key;
        state.dir = (key === 'name' || key === 'category') ? 1 : -1;
      }
      document.getElementById('sort').value = ['value', 'tvl', 'growth', 'age', 'name'].indexOf(state.sort) === -1 ? 'value' : state.sort;
      render();
    });
  });

  document.getElementById('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (!tr) return;
    var slug = tr.getAttribute('data-slug');
    state.selected = state.selected === slug ? null : slug;
    render();
    if (state.selected) document.getElementById('detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  readHash();
  document.getElementById('q').value = state.q;
  catSel.value = state.cat;
  document.getElementById('scope').value = state.scope;
  document.getElementById('sort').value = state.sort;
  renderHead();
  renderLive();
  renderRatios();
  render();
})();
