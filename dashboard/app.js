// Token Launch Radar — renders window.RADAR (data.js) into the board, filters,
// sortable table, per-protocol detail with the full implied-value maths, and the
// live-token view. No network: everything shown comes from data.js.
(function () {
  'use strict';
  var DATA = window.RADAR || null;
  var $ = function (id) { return document.getElementById(id); };
  var rowsEl = $('rows'), liveRowsEl = $('live-rows'), detailEl = $('detail');

  // ---- formatting ---------------------------------------------------------
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtUsdFull(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(d)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '×' + (Math.round(n * 1000) / 1000);
  }
  function fmtMultNum(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return String(Math.round(n * 1000) / 1000);
  }
  function peerWord(n) { return n === 1 ? '1 peer' : n + ' peers'; }
  function esc(s) { return String(s == null ? '' : s); }
  // Escape for the chart's SVG markup, which is built as a string (building it
  // with the DOM API would need the SVG namespace written out as a URL, and
  // this page carries no URLs at all).
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Confidence: the radar-3.0 data carries row.confidence (mirrored at
  // row.model.confidence). If a row ever lacks it, recompute the same formula
  // from the row's own evidence — peer count, known age, known 7-day change —
  // so the column and the detail panel never go blank on older data.
  // Returns { v: 0..1, est: true } when the value was recomputed here.
  function confidenceOf(r) {
    if (typeof r.confidence === 'number' && isFinite(r.confidence)) return { v: r.confidence, est: false };
    if (r.model && typeof r.model.confidence === 'number' && isFinite(r.model.confidence)) return { v: r.model.confidence, est: false };
    var peers = typeof r.peers_used === 'number' ? r.peers_used
      : (r.model && typeof r.model.peers_used === 'number' ? r.model.peers_used : 0);
    var age = (r.age_days === null || r.age_days === undefined) ? 0.4 : 1;
    var chg = (r.change_7d === null || r.change_7d === undefined) ? 0.4 : 1;
    return { v: 0.5 * Math.min(peers / 15, 1) + 0.25 * age + 0.25 * chg, est: true };
  }
  function fmtConf(v) {
    if (v === null || v === undefined || !isFinite(v)) return 'n/a';
    return Math.round(v * 100) + '%';
  }

  // A row is on the watchlist when its TVL clears the snapshot floor: the
  // watchlist is exactly the pre-token protocols at or above floor_usd, and
  // the early radar rows all sit below it. If data.js ever names the list
  // explicitly, that wins over the floor test.
  var WL = Array.isArray(DATA.watchlist) ? new Set(DATA.watchlist) : null;
  function isWatchlist(r) { return WL ? WL.has(r.slug) : (DATA && r.tvl_usd >= DATA.floor_usd); }
  function sourceLabel(r) {
    if (r.multiple_source === 'category') return 'category peers';
    if (r.multiple_source === 'family') return 'protocol family';
    return 'all live tokens';
  }

  // ---- state ---------------------------------------------------------------
  var params = new URLSearchParams(window.location.search);
  var state = {
    q: params.get('q') || '',
    category: params.get('category') || 'all',
    chain: params.get('chain') || 'all',
    watchlist: params.get('watchlist') === '1',
    sort: 'rank', dir: 1,
    tab: params.get('tab') === 'live' ? 'live' : 'board',
    selected: params.get('slug') || null
  };
  var SORTS = {
    rank: function (r) { return r.rank; },
    implied: function (r) { return r.implied_value_usd; },
    tvl: function (r) { return r.tvl_usd; },
    multiple: function (r) { return r.multiple; },
    confidence: function (r) { return confidenceOf(r).v; },
    change: function (r) { return r.change_7d === null ? -Infinity : r.change_7d; },
    age: function (r) { return r.age_days === null ? Infinity : r.age_days; },
    name: function (r) { return (r.name || '').toLowerCase(); }
  };
  var DEFAULT_DIR = { rank: 1, implied: -1, tvl: -1, multiple: -1, confidence: -1, change: -1, age: -1, name: 1 };

  function setSort(key) {
    if (state.sort === key) state.dir = -state.dir;
    else { state.sort = key; state.dir = DEFAULT_DIR[key] || -1; }
    render();
  }

  // ---- filtering + sorting ---------------------------------------------------
  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchlist && !isWatchlist(r)) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (!q) return true;
      return ((r.name || '') + ' ' + r.slug).toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) {
      var f = SORTS[state.sort] || SORTS.rank, av = f(a), bv = f(b);
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.rank - b.rank;
    });
  }

  // ---- board -----------------------------------------------------------------
  function deltaCell(n) {
    var td = document.createElement('td');
    td.className = 'num ' + (n === null ? 'na' : n >= 0 ? 'pos' : 'neg');
    td.textContent = fmtPct(n);
    return td;
  }
  // Confidence cell: a small inline bar plus the percentage. Recomputed
  // (fallback) values are marked as estimated in the hover text.
  function confCell(r) {
    var td = document.createElement('td');
    td.className = 'num conf';
    var c = confidenceOf(r);
    var bar = document.createElement('span'); bar.className = 'conf-bar';
    var fill = document.createElement('i');
    fill.style.width = Math.round(c.v * 100) + '%';
    bar.appendChild(fill); td.appendChild(bar);
    var t = document.createElement('span'); t.textContent = fmtConf(c.v); td.appendChild(t);
    if (c.est) td.title = 'Estimated from peer count, age and 7-day data';
    return td;
  }
  function renderBoard() {
    var list = visibleRows();
    rowsEl.textContent = '';
    list.forEach(function (r) {
      var tr = document.createElement('tr');
      if (state.selected === r.slug) tr.className = 'sel';
      tr.tabIndex = 0;
      tr.setAttribute('data-slug', r.slug);
      var rank = document.createElement('td'); rank.className = 'rank'; rank.textContent = r.rank;
      var proto = document.createElement('td'); proto.className = 'proto';
      var b = document.createElement('b'); b.textContent = r.name;
      var s = document.createElement('span'); s.textContent = r.slug;
      proto.appendChild(b); proto.appendChild(s);
      if (isWatchlist(r)) {
        var badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = 'Watchlist';
        proto.appendChild(badge);
      }
      var cat = document.createElement('td'); cat.textContent = r.category || 'Uncategorised';
      var ch = document.createElement('td'); ch.className = 'chains'; ch.textContent = (r.chains || []).join(', ') || '—';
      var tvl = document.createElement('td'); tvl.className = 'num'; tvl.textContent = fmtUsd(r.tvl_usd);
      var mult = document.createElement('td'); mult.className = 'num'; mult.textContent = fmtMult(r.multiple);
      var age = document.createElement('td'); age.className = 'num'; age.textContent = fmtAge(r.age_days);
      var imp = document.createElement('td'); imp.className = 'implied'; imp.textContent = fmtUsd(r.implied_value_usd);
      tr.appendChild(rank); tr.appendChild(proto); tr.appendChild(cat); tr.appendChild(ch);
      tr.appendChild(tvl); tr.appendChild(mult); tr.appendChild(deltaCell(r.change_7d)); tr.appendChild(age); tr.appendChild(confCell(r)); tr.appendChild(imp);
      tr.addEventListener('click', function () { openDetail(r.slug); });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); }
      });
      rowsEl.appendChild(tr);
    });
    $('empty').hidden = list.length > 0;
    $('count').innerHTML = '';
    var strong = document.createElement('b'); strong.textContent = String(list.length);
    $('count').appendChild(strong);
    $('count').appendChild(document.createTextNode(' of ' + DATA.board_size + ' protocols'));
    document.querySelectorAll('thead th button').forEach(function (btn) {
      var arrow = btn.querySelector('.arrow');
      if (arrow) arrow.textContent = state.sort === btn.getAttribute('data-sort') ? (state.dir < 0 ? '▼' : '▲') : '';
    });
  }

  // ---- top-10 chart ------------------------------------------------------------
  // Inline SVG, no external resources. Log scale (base 10): the top row is
  // roughly 200x the 10th, so linear bars would make rows 2-10 invisible.
  // Each bar's length is its log-distance from the 10th row, with a small
  // floor so the shortest bar is still visible; the note under the heading
  // says so, with the real rank-1-to-rank-10 ratio for this snapshot.
  function renderChart() {
    var host = $('chart');
    if (!host) return;
    var top = DATA.rows.slice().sort(function (a, b) {
      return b.implied_value_usd - a.implied_value_usd;
    }).slice(0, 10);
    if (!top.length) { host.textContent = 'No rows to chart.'; return; }
    var logs = top.map(function (r) { return Math.log10(Math.max(r.implied_value_usd, 1)); });
    var lo = logs[logs.length - 1], span = (logs[0] - lo) || 1;
    var rowH = 28, h = 8 + top.length * rowH + 6;
    var s = '<svg viewBox="0 0 680 ' + h + '" width="100%" role="img" aria-label="Top 10 protocols by implied value, log scale">';
    top.forEach(function (r, i) {
      var y = 8 + i * rowH;
      var w = Math.round(6 + 354 * (logs[i] - lo) / span);
      var name = (r.name || '').length > 22 ? (r.name || '').slice(0, 21) + '…' : (r.name || '');
      s += '<text class="c-rank" x="6" y="' + (y + 17) + '">' + (i + 1) + '</text>';
      s += '<text class="c-name" x="30" y="' + (y + 17) + '">' + escHtml(name) + '</text>';
      s += '<rect class="c-bar' + (i === 0 ? ' c-top' : '') + '" x="240" y="' + (y + 5) + '" width="' + w + '" height="16" rx="3"/>';
      s += '<text class="c-val" x="' + (240 + w + 8) + '" y="' + (y + 17) + '">' + fmtUsd(r.implied_value_usd) + '</text>';
    });
    host.innerHTML = s + '</svg>';
    var ratio = top[0].implied_value_usd / Math.max(top[top.length - 1].implied_value_usd, 1);
    $('chart-note').textContent = 'Log scale (base 10): rank #1 is about ' + Math.round(ratio) +
      '× rank #' + top.length + ', so equal steps along a bar are equal multiples, not equal dollars. Values are implied values, not prices.';
  }

  // ---- category summary --------------------------------------------------------
  // Prefer the model's own category_stats; if the data predates it, compute
  // the same columns from the rows. Fallback "priced peers" is the largest
  // per-row peer count in the category — the category's peer pool is at
  // least that big — since per-row counts overlap and must not be summed.
  function categoryStats() {
    if (Array.isArray(DATA.category_stats) && DATA.category_stats.length) {
      return DATA.category_stats.slice().sort(function (a, b) {
        return b.total_implied_usd - a.total_implied_usd;
      });
    }
    var by = {};
    DATA.rows.forEach(function (r) {
      var c = r.category || 'Uncategorised';
      var g = by[c] || (by[c] = { category: c, rows: 0, total_implied_usd: 0, mults: [], peers: 0 });
      g.rows++;
      g.total_implied_usd += r.implied_value_usd || 0;
      if (typeof r.multiple === 'number' && isFinite(r.multiple)) g.mults.push(r.multiple);
      var pu = typeof r.peers_used === 'number' ? r.peers_used : 0;
      if (pu > g.peers) g.peers = pu;
    });
    return Object.keys(by).map(function (k) {
      var g = by[k];
      g.mults.sort(function (a, b) { return a - b; });
      var m = g.mults, med = null;
      if (m.length) med = m.length % 2 ? m[(m.length - 1) / 2] : (m[m.length / 2 - 1] + m[m.length / 2]) / 2;
      return { category: g.category, rows: g.rows, total_implied_usd: g.total_implied_usd, median_multiple: med, peers: g.peers };
    }).sort(function (a, b) { return b.total_implied_usd - a.total_implied_usd; });
  }
  function renderCategories() {
    var body = $('cat-rows');
    if (!body) return;
    body.textContent = '';
    categoryStats().forEach(function (g) {
      var tr = document.createElement('tr');
      [[g.category, ''], [String(g.rows), 'num'], [fmtUsd(g.total_implied_usd), 'num'],
       [fmtMult(g.median_multiple), 'num'], [String(g.peers), 'num']].forEach(function (c) {
        var td = document.createElement('td');
        if (c[1]) td.className = c[1];
        td.textContent = c[0];
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  // ---- methodology ---------------------------------------------------------------
  // The formula text lives in the page; the worked example is computed live
  // from the rank-1 row's real numbers, never hard-coded.
  function renderMethodology() {
    var summary = $('method-summary');
    if (summary) summary.textContent = 'Methodology — ' + (DATA.model_version || 'radar') + ' formula';
    var ex = $('method-example');
    if (!ex) return;
    var r = DATA.rows.filter(function (x) { return x.rank === 1; })[0]
      || DATA.rows.slice().sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd; })[0];
    if (!r) { ex.textContent = ''; return; }
    ex.textContent = 'Worked example — ' + r.name + ' (rank 1): ' + fmtUsdFull(r.tvl_usd) +
      ' × ' + fmtMultNum(r.multiple) + ' × ' + fmtMultNum(r.growth_multiplier) +
      ' × ' + fmtMultNum(r.maturity_multiplier) + ' × ' + fmtMultNum(r.chain_multiplier) +
      ' = ' + fmtUsdFull(r.implied_value_usd) + '.';
  }

  // ---- live view ---------------------------------------------------------------
  function renderLive() {
    var live = (DATA.live || []).slice().sort(function (a, b) {
      return (b.mcap_usd || 0) - (a.mcap_usd || 0);
    });
    liveRowsEl.textContent = '';
    live.forEach(function (r) {
      var tr = document.createElement('tr');
      var proto = document.createElement('td'); proto.className = 'proto';
      var b = document.createElement('b'); b.textContent = r.name;
      var s = document.createElement('span'); s.textContent = r.slug;
      proto.appendChild(b); proto.appendChild(s);
      var cat = document.createElement('td'); cat.textContent = r.category || 'Uncategorised';
      var ch = document.createElement('td'); ch.className = 'chains'; ch.textContent = (r.chains || []).join(', ') || '—';
      var tvl = document.createElement('td'); tvl.className = 'num'; tvl.textContent = fmtUsd(r.tvl_usd);
      var mc = document.createElement('td'); mc.className = 'num'; mc.textContent = fmtUsd(r.mcap_usd);
      tr.appendChild(proto); tr.appendChild(cat); tr.appendChild(ch);
      tr.appendChild(tvl); tr.appendChild(deltaCell(r.change_7d)); tr.appendChild(mc);
      liveRowsEl.appendChild(tr);
    });
    $('count').textContent = live.length + ' live-token protocols (market caps, not implied values)';
  }

  // ---- detail --------------------------------------------------------------------
  function fact(dt, dd, cls) {
    var div = document.createElement('div');
    var t = document.createElement('dt'); t.textContent = dt;
    var d = document.createElement('dd'); d.textContent = dd; if (cls) d.className = cls;
    div.appendChild(t); div.appendChild(d); return div;
  }
  function mathStep(label, value) {
    var li = document.createElement('li');
    var s = document.createElement('span'); s.textContent = label;
    var b = document.createElement('b'); b.textContent = value;
    li.appendChild(s); li.appendChild(b); return li;
  }
  function openDetail(slug) {
    var r = (DATA.rows || []).filter(function (x) { return x.slug === slug; })[0];
    if (!r) return;
    state.selected = slug;
    $('detail-kicker').textContent = 'Rank ' + r.rank + ' of ' + DATA.board_size + '  ·  ' + (isWatchlist(r) ? 'Watchlist' : 'Early radar');
    $('detail-name').textContent = r.name;
    $('detail-sub').textContent = (r.category || 'Uncategorised') + '  ·  ' + (r.chains || []).join(', ');
    var facts = $('detail-facts'); facts.textContent = '';
    facts.appendChild(fact('TVL', fmtUsdFull(r.tvl_usd)));
    facts.appendChild(fact('7-day change', fmtPct(r.change_7d), r.change_7d === null ? 'na' : r.change_7d >= 0 ? 'pos' : 'neg'));
    facts.appendChild(fact('Age', r.age_days === null ? 'unknown' : r.age_days + ' days'));
    facts.appendChild(fact('Chains', String((r.chains || []).length)));
    facts.appendChild(fact('Implied value', fmtUsdFull(r.implied_value_usd)));
    var conf = confidenceOf(r);
    facts.appendChild(fact('Confidence', fmtConf(conf.v) + (conf.est ? ' (estimated)' : '')));
    var maths = $('detail-maths'); maths.textContent = '';
    maths.appendChild(mathStep('TVL', fmtUsdFull(r.tvl_usd)));
    maths.appendChild(mathStep('Multiple — from ' + sourceLabel(r) + ' (' + peerWord(r.peers_used) + ')', fmtMult(r.multiple)));
    maths.appendChild(mathStep('Growth — 7d change ' + fmtPct(r.change_7d), fmtMult(r.growth_multiplier)));
    maths.appendChild(mathStep('Maturity — ' + fmtAge(r.age_days) + ' with no token', fmtMult(r.maturity_multiplier)));
    maths.appendChild(mathStep('Chain breadth — ' + (r.chains || []).length + ' chain(s)', fmtMult(r.chain_multiplier)));
    $('detail-total').textContent = fmtUsdFull(r.tvl_usd) + ' × ' + fmtMultNum(r.multiple) + ' × ' + fmtMultNum(r.growth_multiplier) + ' × ' + fmtMultNum(r.maturity_multiplier) + ' × ' + fmtMultNum(r.chain_multiplier) + ' = ' + fmtUsdFull(r.implied_value_usd);
    var peers = $('detail-peer-rows'); peers.textContent = '';
    (r.comparables || []).forEach(function (p) {
      var tr = document.createElement('tr');
      [p.name, fmtUsd(p.mcap_usd), fmtUsd(p.tvl_usd), fmtMult(p.multiple)].forEach(function (v, i) {
        var td = document.createElement('td'); if (i > 0) td.className = 'num'; td.textContent = v; tr.appendChild(td);
      });
      peers.appendChild(tr);
    });
    $('detail-peer-note').textContent = (r.comparables || []).length
      ? 'Multiple = market cap ÷ TVL for each peer. The board multiple above (' + fmtMult(r.multiple) + ') is the median across these ' + sourceLabel(r) + ' — ' + peerWord(r.peers_used) + ' priced in the snapshot; the table shows the ' + ((r.comparables || []).length === 1 ? 'largest' : (r.comparables || []).length + ' largest') + ' by market cap.'
      : 'No same-category token-bearing peer exists in this snapshot, so the multiple falls back to the wider set.';
    var steps = $('detail-steps'); steps.textContent = '';
    (r.farm_steps || []).forEach(function (s) {
      var li = document.createElement('li'); li.textContent = s; steps.appendChild(li);
    });
    detailEl.hidden = false;
    document.body.style.overflow = 'hidden';
    renderBoard();
  }
  function closeDetail() {
    detailEl.hidden = true;
    document.body.style.overflow = '';
    state.selected = null;
    renderBoard();
  }

  // ---- tabs, controls, render ------------------------------------------------------
  function renderTabs() {
    $('tab-board').setAttribute('aria-selected', state.tab === 'board' ? 'true' : 'false');
    $('tab-live').setAttribute('aria-selected', state.tab === 'live' ? 'true' : 'false');
    $('board-view').hidden = state.tab !== 'board';
    $('live-view').hidden = state.tab !== 'live';
  }
  function render() {
    renderTabs();
    if (state.tab === 'board') renderBoard(); else renderLive();
  }
  function fillOptions(select, values) {
    values.forEach(function (v) {
      var o = document.createElement('option'); o.value = v; o.textContent = v; select.appendChild(o);
    });
  }
  function init() {
    if (!DATA) {
      $('count').textContent = 'Data not loaded — data.js is missing.';
      return;
    }
    $('stat-scanned').textContent = String(DATA.scanned || DATA.total_protocols || 758);
    $('stat-watchlist').textContent = String(DATA.watchlist_size || 40);
    $('stat-board').textContent = String(DATA.board_size || DATA.rows.length);
    $('stat-asof').textContent = esc(DATA.as_of || '—');
    $('source-line').textContent = 'Data: DefiLlama protocol snapshot (' + esc(DATA.source || '') + '), as of ' + esc(DATA.as_of || '') + '.';
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorised'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains || []); }, []))).sort();
    fillOptions($('category'), cats);
    fillOptions($('chain'), chains);
    $('q').value = state.q;
    $('category').value = cats.includes(state.category) ? state.category : 'all';
    if (state.category !== 'all' && !$('category').value) $('category').value = 'all';
    $('chain').value = chains.includes(state.chain) ? state.chain : 'all';
    $('watchlist').checked = state.watchlist;
    $('sort').value = 'rank';
    // ?sort=<key> deep-links a board sort (multiple, confidence, …); an
    // unknown key falls back to rank.
    var ps = params.get('sort');
    if (ps && SORTS[ps]) { state.sort = ps; state.dir = DEFAULT_DIR[ps] || -1; $('sort').value = ps; }
    $('q').addEventListener('input', function () { state.q = $('q').value; render(); });
    $('category').addEventListener('change', function () { state.category = $('category').value; render(); });
    $('chain').addEventListener('change', function () { state.chain = $('chain').value; render(); });
    $('watchlist').addEventListener('change', function () { state.watchlist = $('watchlist').checked; render(); });
    $('sort').addEventListener('change', function () { state.sort = $('sort').value; state.dir = DEFAULT_DIR[state.sort] || -1; render(); });
    $('clear').addEventListener('click', function () {
      state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlist = false;
      $('q').value = ''; $('category').value = 'all'; $('chain').value = 'all'; $('watchlist').checked = false;
      render();
    });
    document.querySelectorAll('thead th button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setSort(btn.getAttribute('data-sort'));
        $('sort').value = ['rank', 'implied', 'tvl', 'multiple', 'confidence', 'change', 'age'].includes(state.sort) ? state.sort : 'rank';
      });
    });
    $('tab-board').addEventListener('click', function () { state.tab = 'board'; render(); });
    $('tab-live').addEventListener('click', function () { state.tab = 'live'; render(); });
    $('detail-close').addEventListener('click', closeDetail);
    detailEl.addEventListener('click', function (e) { if (e.target === detailEl) closeDetail(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !detailEl.hidden) closeDetail(); });
    renderChart();
    renderCategories();
    renderMethodology();
    render();
    if (state.selected) {
      openDetail(state.selected);
      // ?panel-scroll=<px> scrolls the open detail panel, so a screenshot can
      // show the farm steps below the maths (e.g. ?slug=x&panel-scroll=380).
      var scroll = parseInt(params.get('panel-scroll') || '', 10);
      if (Number.isFinite(scroll) && scroll > 0) detailEl.scrollTop = scroll;
    }
  }
  init();
})();
