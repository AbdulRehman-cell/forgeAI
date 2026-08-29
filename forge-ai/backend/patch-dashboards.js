#!/usr/bin/env node
// One-shot script: replaces the CHARTS_JS portion of every generated
// dashboard.js in the repos directory with the current clean runtime.
// Run: node patch-dashboards.js
// Safe to run multiple times — idempotent.

'use strict';

const fs   = require('fs');
const path = require('path');

const REPOS_DIR = process.env.REPOS_DIR || path.join(__dirname, 'repos');

// ─── New runtime (minified-friendly, no syntax errors) ──────────────────────
// This is the actual JavaScript content that belongs AFTER the Chart.js UMD bundle.
const NEW_RUNTIME = `
(function () {
  'use strict';

  var payloadEl = document.getElementById('dashboard-data');
  if (!payloadEl) return;
  var data;
  try { data = JSON.parse(payloadEl.textContent || '{}'); } catch (e) { return; }

  var PALETTE = ['#22c55e','#38bdf8','#f59e0b','#a855f7','#f43f5e','#14b8a6','#eab308','#ec4899','#6366f1','#84cc16','#f97316','#06b6d4'];
  var rootStyle = getComputedStyle(document.documentElement);
  var bgColor = (rootStyle.getPropertyValue('--bg') || '').trim();
  var isLight = bgColor.charAt(0) === '#' && parseInt(bgColor.slice(1,3), 16) > 200;
  var chartTextColor   = isLight ? '#374151' : '#8b949e';
  var chartGridColor   = isLight ? 'rgba(0,0,0,.08)' : 'rgba(38,47,66,.5)';
  var chartBorderColor = isLight ? 'rgba(0,0,0,.1)' : 'rgba(38,47,66,.6)';
  var doughnutBorderColor = isLight ? '#ffffff' : '#131820';
  var ACCENT = isLight ? '#2563eb' : '#22c55e';

  if (window.Chart) {
    Chart.defaults.color = chartTextColor;
    Chart.defaults.borderColor = chartBorderColor;
    Chart.defaults.font.family = 'Inter, ui-sans-serif, system-ui, sans-serif';
    Chart.defaults.animation = false;
  }

  window.addEventListener('beforeprint', function () {
    Object.keys(chartInstances).forEach(function (id) {
      var c = chartInstances[id];
      if (c && typeof c.resize === 'function') { try { c.resize(); c.update('none'); } catch (_) {} }
    });
  });

  function fmt(n) {
    if (n === null || n === undefined || !isFinite(n)) return '\\u2014';
    var abs = Math.abs(n);
    if (abs >= 1e9) return (n / 1e9).toFixed(2).replace(/\\.?0+$/, '') + 'B';
    if (abs >= 1e6) return (n / 1e6).toFixed(2).replace(/\\.?0+$/, '') + 'M';
    if (abs >= 1e3) return (n / 1e3).toFixed(1).replace(/\\.?0+$/, '') + 'K';
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function animateCounter(el, targetText) {
    var match = targetText.match(/^([^\\d]*)([\\d,.]+)([BMK]?)(.*)$/);
    if (!match) { el.textContent = targetText; return; }
    var prefix = match[1], raw = parseFloat(match[2].replace(/,/g, '')), suffix = match[3] + match[4];
    if (!isFinite(raw) || raw === 0) { el.textContent = targetText; return; }
    var duration = 900, startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      var progress = Math.min((ts - startTime) / duration, 1);
      var ease = 1 - Math.pow(1 - progress, 3);
      var cur = raw * ease;
      var formatted = match[3] ? cur.toFixed(raw < 10 ? 2 : 1).replace(/\\.?0+$/, '') : cur.toLocaleString(undefined, { maximumFractionDigits: raw < 10 ? 2 : 0 });
      el.textContent = prefix + formatted + suffix;
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = targetText;
    }
    requestAnimationFrame(step);
  }

  var filterState = {};
  (data.filterDimensions || []).forEach(function (dim) {
    if (dim.kind === 'category') filterState[dim.column] = { deselected: new Set() };
    else if (dim.kind === 'date') filterState[dim.column] = { from: dim.dateRange.min, to: dim.dateRange.max };
  });

  function allowedValues(col) {
    var dim = (data.filterDimensions || []).find(function (d) { return d.column === col; });
    var all = new Set(dim && dim.values ? dim.values : []);
    ((filterState[col] || {}).deselected || new Set()).forEach(function (v) { all.delete(v); });
    return all;
  }
  function firstActiveCategoryDim(slices) {
    var keys = Object.keys(slices);
    for (var i = 0; i < keys.length; i++) { var k = keys[i], st = filterState[k]; if (st && st.deselected && st.deselected.size > 0) return k; }
    return null;
  }
  function firstActiveDateDim(slices) {
    var keys = Object.keys(slices);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], st = filterState[k];
      var dim = (data.filterDimensions || []).find(function (d) { return d.column === k && d.kind === 'date'; });
      if (dim && st && (st.from !== dim.dateRange.min || st.to !== dim.dateRange.max)) return k;
    }
    return null;
  }

  function currentValue(metric) {
    if (!metric.value || !metric.value.slices) return metric.value;
    var slices = metric.value.slices, kind = metric.value.kind;

    if (kind === 'total' || kind === 'distinct_count') {
      var catDim = firstActiveCategoryDim(slices);
      if (catDim) { var per = slices[catDim], allowed = allowedValues(catDim), val = 0; Object.keys(per).forEach(function (v) { if (allowed.has(v)) val += per[v] || 0; }); return Object.assign({}, metric.value, { value: val }); }
      var dateDim = firstActiveDateDim(slices);
      if (dateDim) { var per2 = slices[dateDim], from = filterState[dateDim].from, to = filterState[dateDim].to, val2 = 0; Object.keys(per2).forEach(function (m) { if ((!from || m+'-01' >= from.slice(0,7)+'-01') && (!to || m+'-01' <= to.slice(0,7)+'-01')) val2 += per2[m] || 0; }); return Object.assign({}, metric.value, { value: val2 }); }
      return metric.value;
    }
    if (kind === 'average') {
      var catDim2 = firstActiveCategoryDim(slices);
      if (catDim2 && slices[catDim2] && slices[catDim2].sums && slices[catDim2].counts) { var allowed2 = allowedValues(catDim2), sum = 0, cnt = 0; Object.keys(slices[catDim2].sums).forEach(function (v) { if (allowed2.has(v)) { sum += slices[catDim2].sums[v] || 0; cnt += slices[catDim2].counts[v] || 0; } }); return Object.assign({}, metric.value, { value: cnt > 0 ? sum / cnt : 0, rowCount: cnt }); }
      return metric.value;
    }
    if (kind === 'timeseries') {
      var catDim3 = firstActiveCategoryDim(slices), series = metric.value.series;
      if (catDim3) { var per3 = slices[catDim3], allowed3 = allowedValues(catDim3), byBucket = {}; Object.keys(per3).forEach(function (v) { if (allowed3.has(v)) (per3[v] || []).forEach(function (p) { byBucket[p.bucket] = (byBucket[p.bucket] || 0) + p.value; }); }); series = Object.keys(byBucket).sort().map(function (b) { return { bucket: b, value: byBucket[b], rowCount: 0 }; }); }
      var dateDim2 = firstActiveDateDim(slices);
      if (dateDim2 && filterState[dateDim2]) { var from2 = filterState[dateDim2].from, to2 = filterState[dateDim2].to; series = series.filter(function (p) { return (!from2 || p.bucket >= from2) && (!to2 || p.bucket <= to2); }); }
      return Object.assign({}, metric.value, { series: series });
    }
    if (kind === 'top_n' || kind === 'donut') {
      var catDim4 = firstActiveCategoryDim(slices);
      if (catDim4) { var per4 = slices[catDim4], allowed4 = allowedValues(catDim4), combined = {}; Object.keys(per4).forEach(function (v) { if (allowed4.has(v)) Object.keys(per4[v] || {}).forEach(function (lbl) { combined[lbl] = (combined[lbl] || 0) + (per4[v][lbl] || 0); }); }); var n = metric.n || 5, allE = Object.keys(combined).sort(function (a, b) { return combined[b] - combined[a]; }).map(function (l) { return { label: l, value: combined[l], rowCount: 0, pctOfTotal: 0 }; }), top = allE.slice(0, n), rest = allE.slice(n).reduce(function (s, e) { return s + e.value; }, 0), total = allE.reduce(function (s, e) { return s + e.value; }, 0); top.forEach(function (e) { e.pctOfTotal = total > 0 ? e.value / total : 0; }); return Object.assign({}, metric.value, { entries: top, other: rest > 0 ? rest : null }); }
      return metric.value;
    }
    return metric.value;
  }

  var filterBar = document.getElementById('filter-bar');
  if (filterBar && (data.filterDimensions || []).length) {
    (data.filterDimensions || []).forEach(function (dim) {
      var wrap = document.createElement('div'); wrap.className = 'filter';
      var title = document.createElement('div'); title.className = 'filter-title'; title.textContent = dim.column; wrap.appendChild(title);
      if (dim.kind === 'category') {
        var chips = document.createElement('div'); chips.className = 'filter-chips';
        (dim.values || []).forEach(function (v) {
          var chip = document.createElement('button'); chip.className = 'chip active'; chip.textContent = v; chip.dataset.value = v;
          chip.addEventListener('click', function () { var set = filterState[dim.column].deselected; if (set.has(v)) { set.delete(v); chip.classList.add('active'); } else { set.add(v); chip.classList.remove('active'); } renderAll(); });
          chips.appendChild(chip);
        });
        var reset = document.createElement('button'); reset.className = 'chip reset'; reset.textContent = 'reset';
        reset.addEventListener('click', function () { filterState[dim.column].deselected.clear(); chips.querySelectorAll('.chip').forEach(function (c) { if (c !== reset) c.classList.add('active'); }); renderAll(); });
        chips.appendChild(reset); wrap.appendChild(chips);
      } else if (dim.kind === 'date') {
        var range = document.createElement('div'); range.className = 'filter-range';
        var fromI = document.createElement('input'); fromI.type = 'date'; fromI.value = dim.dateRange.min.slice(0,10); fromI.addEventListener('change', function () { filterState[dim.column].from = fromI.value; renderAll(); });
        var arrow = document.createElement('span'); arrow.textContent = '\\u2192'; arrow.className = 'range-arrow';
        var toI = document.createElement('input'); toI.type = 'date'; toI.value = dim.dateRange.max.slice(0,10); toI.addEventListener('change', function () { filterState[dim.column].to = toI.value; renderAll(); });
        range.appendChild(fromI); range.appendChild(arrow); range.appendChild(toI); wrap.appendChild(range);
      }
      filterBar.appendChild(wrap);
    });
  }

  function syncChipUiFor(column) {
    document.querySelectorAll('.filter-bar .filter').forEach(function (wrap) {
      var tEl = wrap.querySelector('.filter-title'); if (!tEl || tEl.textContent !== column) return;
      var deselected = (filterState[column] || {}).deselected || new Set();
      wrap.querySelectorAll('.chip').forEach(function (chip) { if (chip.classList.contains('reset')) return; if (deselected.has(chip.dataset.value)) chip.classList.remove('active'); else chip.classList.add('active'); });
    });
  }

  var chartInstances = {};
  function destroyChart(id) { if (chartInstances[id]) { try { chartInstances[id].destroy(); } catch (_) {} chartInstances[id] = null; } }

  function tooltipBase() { return { backgroundColor: isLight ? 'rgba(15,23,42,0.85)' : 'rgba(15,23,42,0.95)', titleColor: '#f0f4f8', bodyColor: '#f0f4f8', padding: 10, cornerRadius: 8, borderColor: 'rgba(148,163,184,.2)', borderWidth: 1 }; }
  function lineScales() { return { x: { grid: { display: false }, ticks: { maxTicksLimit: 8, color: chartTextColor } }, y: { ticks: { color: chartTextColor, callback: function (v) { return fmt(v); } }, grid: { color: chartGridColor } } }; }
  function mkDataset(label, vals, color, filled) { return { label: label, data: vals, borderColor: color, backgroundColor: filled ? color + '25' : color + '00', fill: !!filled, tension: 0.35, pointRadius: vals.length > 60 ? 0 : 2, pointHoverRadius: 4, borderWidth: 2 }; }

  function renderAll() { (data.metrics || []).forEach(function (m) { try { renderMetric(m); } catch (e) { console.warn('[ForgeAI] render', m && m.id, e); } }); }

  function renderMetric(m) {
    if (!m || !m.value) return;
    var kind = m.value.kind, dv = currentValue(m);
    var kpiEl = document.querySelector('[data-kpi-value="' + m.id + '"]');
    var subEl = document.querySelector('[data-kpi-sub="' + m.id + '"]');
    if (kpiEl && (kind === 'total' || kind === 'average' || kind === 'distinct_count' || kind === 'ratio')) {
      var rv = dv.value;
      if (kind === 'ratio') rv = (dv.ratio || 0) * (dv.asPercent ? 100 : 1);
      animateCounter(kpiEl, fmt(rv) + ((kind === 'ratio' && dv.asPercent) ? '%' : ''));
      if (subEl) { if (kind === 'distinct_count') subEl.textContent = fmt(dv.rowCount) + ' total rows'; else if (kind === 'ratio') subEl.textContent = fmt(dv.numerator) + ' / ' + fmt(dv.denominator); else subEl.textContent = fmt(dv.rowCount) + ' rows'; }
    }
    var cid = 'chart-' + m.id, el = document.getElementById(cid);
    if (!el || !window.Chart) return;
    destroyChart(cid);

    if (kind === 'timeseries') {
      chartInstances[cid] = new Chart(el.getContext('2d'), { type: 'line', data: { labels: dv.series.map(function (p) { return p.bucket; }), datasets: [mkDataset(m.label, dv.series.map(function (p) { return p.value; }), ACCENT, true)] }, options: { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' }, plugins: { legend: { display: false }, tooltip: Object.assign(tooltipBase(), { callbacks: { label: function (c) { return (c.dataset.label || '') + ': ' + fmt(c.parsed.y); }, footer: function (items) { if (items.length < 2) return ''; return 'Total: ' + fmt(items.reduce(function (s, i) { return s + (i.parsed.y || 0); }, 0)); } } }) }, scales: lineScales() } });
      return;
    }
    if (kind === 'multi_series') {
      var first = dv.series[0] || {};
      chartInstances[cid] = new Chart(el.getContext('2d'), { type: 'line', data: { labels: (first.points || []).map(function (p) { return p.bucket; }), datasets: dv.series.map(function (s, i) { return mkDataset(s.label, s.points.map(function (p) { return p.value; }), PALETTE[i % PALETTE.length], false); }) }, options: { responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' }, plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true } }, tooltip: Object.assign(tooltipBase(), { callbacks: { label: function (c) { return (c.dataset.label || '') + ': ' + fmt(c.parsed.y); }, footer: function (items) { if (items.length < 2) return ''; return 'Total: ' + fmt(items.reduce(function (s, i) { return s + (i.parsed.y || 0); }, 0)); } } }) }, scales: lineScales() } });
      return;
    }
    if (kind === 'top_n' || kind === 'donut') {
      var entries = (dv.entries || []).slice();
      if (dv.other != null && dv.other > 0) entries.push({ label: 'Other', value: dv.other });
      var crossCol = null;
      if (m.groupColumn) { if ((data.filterDimensions || []).some(function (d) { return d.kind === 'category' && d.column === m.groupColumn; })) crossCol = m.groupColumn; }
      var clickHandler = null;
      if (crossCol) { (function () { var _col = crossCol, _entries = entries; clickHandler = function (evt, active) { if (!active.length) return; var lbl = _entries[active[0].index] && _entries[active[0].index].label; if (!lbl || lbl === 'Other') return; var dim = (data.filterDimensions || []).find(function (d) { return d.column === _col; }); var dv2 = dim && dim.values ? dim.values : []; var set = filterState[_col].deselected, iso = set.size === dv2.length - 1 && !set.has(lbl); if (iso) set.clear(); else { set.clear(); dv2.forEach(function (v) { if (v !== lbl) set.add(v); }); } syncChipUiFor(_col); renderAll(); }; })(); }
      if (kind === 'top_n') {
        chartInstances[cid] = new Chart(el.getContext('2d'), { type: 'bar', data: { labels: entries.map(function (e) { return e.label; }), datasets: [{ label: m.label, data: entries.map(function (e) { return e.value; }), backgroundColor: entries.map(function (_e, i) { return PALETTE[i % PALETTE.length]; }), borderWidth: 0, borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', onClick: clickHandler, plugins: { legend: { display: false }, tooltip: Object.assign(tooltipBase(), { callbacks: { label: function (c) { return fmt(c.parsed.x); } } }) }, scales: { x: { ticks: { callback: function (v) { return fmt(v); }, color: chartTextColor }, grid: { color: chartGridColor } }, y: { grid: { display: false }, ticks: { color: chartTextColor } } } } });
      } else {
        var donutTotal = entries.reduce(function (a, e) { return a + e.value; }, 0);
        chartInstances[cid] = new Chart(el.getContext('2d'), { type: 'doughnut', data: { labels: entries.map(function (e) { return e.label; }), datasets: [{ data: entries.map(function (e) { return e.value; }), backgroundColor: entries.map(function (_e, i) { return PALETTE[i % PALETTE.length]; }), borderColor: doughnutBorderColor, borderWidth: 3 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '62%', onClick: clickHandler, plugins: { legend: { position: 'right', labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true, padding: 14, color: chartTextColor } }, tooltip: Object.assign(tooltipBase(), { callbacks: { label: function (c) { var v = c.parsed, pct = donutTotal > 0 ? Math.round(v / donutTotal * 100) : 0; return c.label + ': ' + fmt(v) + ' (' + pct + '%)'; } } }) } } });
      }
      return;
    }
    if (kind === 'grouped_bar') {
      chartInstances[cid] = new Chart(el.getContext('2d'), { type: 'bar', data: { labels: dv.groups.map(function (g) { return g.label; }), datasets: dv.splitLabels.map(function (s, i) { return { label: s, data: dv.groups.map(function (g) { var match = g.splits.find(function (sp) { return sp.label === s; }); return match ? match.value : 0; }), backgroundColor: PALETTE[i % PALETTE.length], borderWidth: 0, borderRadius: 3 }; }) }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true, color: chartTextColor } }, tooltip: Object.assign(tooltipBase(), { callbacks: { label: function (c) { return c.dataset.label + ': ' + fmt(c.parsed.y); } } }) }, scales: { x: { stacked: true, grid: { display: false }, ticks: { color: chartTextColor } }, y: { stacked: true, ticks: { callback: function (v) { return fmt(v); }, color: chartTextColor }, grid: { color: chartGridColor } } } } });
      return;
    }
    if (kind === 'gauge') {
      var gPct = (dv.target || 1) > 0 ? Math.min((dv.value || 0) / (dv.target || 1), 1) : 0;
      var gColor = gPct >= 0.8 ? PALETTE[0] : gPct >= 0.5 ? PALETTE[2] : PALETTE[4];
      chartInstances[cid] = new Chart(el.getContext('2d'), { type: 'doughnut', data: { datasets: [{ data: [gPct, 1 - gPct], backgroundColor: [gColor, chartBorderColor], borderWidth: 0, circumference: 180, rotation: -90 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false }, tooltip: { enabled: false } } } });
      return;
    }
  }

  document.querySelectorAll('[data-tab-target]').forEach(function (t) {
    t.addEventListener('click', function () {
      document.querySelectorAll('[data-tab-target]').forEach(function (x) { x.classList.remove('active'); });
      document.querySelectorAll('[data-tab-panel]').forEach(function (p) { p.style.display = 'none'; });
      t.classList.add('active');
      var target = document.querySelector('[data-tab-panel="' + t.dataset.tabTarget + '"]');
      if (target) target.style.display = '';
      setTimeout(renderAll, 60);
    });
  });

  var pdfBtn = document.getElementById('fa-pdf-btn');
  if (pdfBtn) pdfBtn.addEventListener('click', function () { window.print(); });

  renderAll();
})();
`.trimStart();

// ─── Find and patch dashboard.js files ──────────────────────────────────────

function walkDirs(dir, depth) {
  if (depth > 4) return [];
  let found = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return []; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      found = found.concat(walkDirs(full, depth + 1));
    } else if (e.name === 'dashboard.js') {
      found.push(full);
    }
  }
  return found;
}

const files = walkDirs(REPOS_DIR, 0);
if (!files.length) {
  console.log(`No dashboard.js files found under ${REPOS_DIR}`);
  process.exit(0);
}

let patched = 0, skipped = 0, errors = 0;

for (const filePath of files) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    // Find the start of the IIFE — everything before it is the Chart.js UMD bundle.
    // The IIFE always starts immediately after the UMD bundle with a newline.
    const ifiiStart = content.indexOf('\n(function ()');
    if (ifiiStart === -1) {
      // No UMD prefix — the file might be IIFE-only (no chart.js bundle).
      // Replace the whole file with just the runtime.
      const encoding = { encoding: 'utf8' };
      fs.writeFileSync(filePath, NEW_RUNTIME, encoding);
      console.log(`  [patched-noUMD] ${filePath}`);
      patched++;
      continue;
    }
    const umdPart = content.slice(0, ifiiStart);
    const newContent = umdPart + '\n' + NEW_RUNTIME;
    fs.writeFileSync(filePath, newContent, { encoding: 'utf8' });
    console.log(`  [patched] ${filePath}`);
    patched++;
  } catch (err) {
    console.error(`  [error]   ${filePath}: ${err.message}`);
    errors++;
  }
}

console.log(`\nDone — ${patched} patched, ${skipped} skipped, ${errors} errors`);
