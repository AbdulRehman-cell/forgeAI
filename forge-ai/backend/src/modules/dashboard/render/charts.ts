// Client-side dashboard runtime — clean rewrite.
// Reads the injected JSON payload, builds interactive filter controls, and
// re-draws every chart on filter change without a server round-trip.
// Uses addEventListener throughout (compatible with script-src-attr 'none' CSP).
// Fails soft: KPI tiles, summary, and tables render even without Chart.js.

export const CHARTS_JS = `
(function () {
  'use strict';

  // ── 1. Bootstrap ──────────────────────────────────────────────────────────

  var payloadEl = document.getElementById('dashboard-data');
  if (!payloadEl) return;

  var data;
  try {
    data = JSON.parse(payloadEl.textContent || '{}');
  } catch (e) {
    console.error('[ForgeAI] dashboard payload parse error', e);
    return;
  }

  // ── 2. Color system ───────────────────────────────────────────────────────

  var PALETTE = [
    '#22c55e', '#38bdf8', '#f59e0b', '#a855f7',
    '#f43f5e', '#14b8a6', '#eab308', '#ec4899',
    '#6366f1', '#84cc16', '#f97316', '#06b6d4'
  ];

  // Detect light vs dark theme from CSS custom property.
  // exec theme sets --bg to #f6f8fc; dark theme sets it to #0a0d12.
  var rootStyle     = getComputedStyle(document.documentElement);
  var bgColor       = (rootStyle.getPropertyValue('--bg') || '').trim();
  var isLightTheme  = bgColor.charAt(0) === '#' && parseInt(bgColor.slice(1, 3), 16) > 200;
  var chartTextColor  = isLightTheme ? '#374151' : '#8b949e';
  var chartGridColor  = isLightTheme ? 'rgba(0,0,0,.08)' : 'rgba(38,47,66,.5)';
  var chartBorderColor = isLightTheme ? 'rgba(0,0,0,.1)' : 'rgba(38,47,66,.6)';
  var doughnutBorderColor = isLightTheme ? '#ffffff' : '#131820';
  var ACCENT = isLightTheme ? '#2563eb' : '#22c55e';

  if (window.Chart) {
    Chart.defaults.color = chartTextColor;
    Chart.defaults.borderColor = chartBorderColor;
    Chart.defaults.font.family = 'Inter, ui-sans-serif, system-ui, sans-serif';
    Chart.defaults.animation = false;
  }

  // Force chart re-render before printing so canvases are rasterized correctly.
  window.addEventListener('beforeprint', function () {
    Object.keys(chartInstances).forEach(function (id) {
      var c = chartInstances[id];
      if (c && typeof c.resize === 'function') {
        try { c.resize(); c.update('none'); } catch (_) {}
      }
    });
  });

  // ── 3. Number formatting ──────────────────────────────────────────────────

  function fmt(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    var abs = Math.abs(n);
    if (abs >= 1e9) return (n / 1e9).toFixed(2).replace(/\\.?0+$/, '') + 'B';
    if (abs >= 1e6) return (n / 1e6).toFixed(2).replace(/\\.?0+$/, '') + 'M';
    if (abs >= 1e3) return (n / 1e3).toFixed(1).replace(/\\.?0+$/, '') + 'K';
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  // ── 4. KPI counter animation ──────────────────────────────────────────────

  function animateCounter(el, targetText) {
    // Only animate plain numbers / compact notation, not % ratios or n/a.
    var match = targetText.match(/^([^\\d]*)([\\d,\\.]+)([BMK]?)(.*)$/);
    if (!match) { el.textContent = targetText; return; }
    var prefix = match[1], raw = parseFloat(match[2].replace(/,/g, '')), suffix = match[3] + match[4];
    if (!isFinite(raw) || raw === 0) { el.textContent = targetText; return; }
    var start = 0, duration = 900, startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      var progress = Math.min((ts - startTime) / duration, 1);
      var ease = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
      var current = raw * ease;
      var formatted;
      if (suffix.match(/[BMK]/)) {
        formatted = current.toFixed(raw < 10 ? 2 : 1).replace(/\\.?0+$/, '');
      } else {
        formatted = current.toLocaleString(undefined, { maximumFractionDigits: raw < 10 ? 2 : 0 });
      }
      el.textContent = prefix + formatted + suffix;
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = targetText;
    }
    requestAnimationFrame(step);
  }

  // ── 5. Filter state ───────────────────────────────────────────────────────

  var filterState = {};
  (data.filterDimensions || []).forEach(function (dim) {
    if (dim.kind === 'category') {
      filterState[dim.column] = { deselected: new Set() };
    } else if (dim.kind === 'date') {
      filterState[dim.column] = { from: dim.dateRange.min.slice(0, 10), to: dim.dateRange.max.slice(0, 10) };
    }
  });

  function allowedValues(col) {
    var dim = (data.filterDimensions || []).find(function (d) { return d.column === col; });
    var all = new Set(dim && dim.values ? dim.values : []);
    var deselected = (filterState[col] || {}).deselected || new Set();
    deselected.forEach(function (v) { all.delete(v); });
    return all;
  }

  function firstActiveCategoryDim(slices) {
    var keys = Object.keys(slices);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], st = filterState[k];
      if (st && st.deselected && st.deselected.size > 0) return k;
    }
    return null;
  }

  function firstActiveDateDim(slices) {
    var keys = Object.keys(slices);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], st = filterState[k];
      var dim = (data.filterDimensions || []).find(function (d) { return d.column === k && d.kind === 'date'; });
      if (dim && st && (st.from !== dim.dateRange.min.slice(0, 10) || st.to !== dim.dateRange.max.slice(0, 10))) return k;
    }
    return null;
  }

  // ── 6. Metric value with filters applied ──────────────────────────────────

  function currentValue(metric) {
    if (!metric.value || !metric.value.slices) return metric.value;
    var slices = metric.value.slices;
    var kind   = metric.value.kind;

    if (kind === 'total' || kind === 'distinct_count') {
      var catDim = firstActiveCategoryDim(slices);
      if (catDim) {
        var per = slices[catDim];
        var allowed = allowedValues(catDim);
        var val = 0;
        Object.keys(per).forEach(function (v) { if (allowed.has(v)) val += per[v] || 0; });
        return Object.assign({}, metric.value, { value: val });
      }
      var dateDim = firstActiveDateDim(slices);
      if (dateDim) {
        var per2 = slices[dateDim];
        var per2Keys = Object.keys(per2).filter(function (k) { return typeof per2[k] === 'number'; });
        var from = filterState[dateDim].from;
        var to   = filterState[dateDim].to;
        if (per2Keys.length > 0) {
          // Pre-computed date slices — sum buckets within range
          var val2 = 0;
          per2Keys.forEach(function (mk) {
            var ok = (!from || mk >= from.slice(0, 7)) && (!to || mk <= to.slice(0, 7));
            if (ok) val2 += per2[mk] || 0;
          });
          return Object.assign({}, metric.value, { value: val2 });
        }
        // Fallback: sum a matching timeseries series within the date range
        var tsFallback = null;
        (data.metrics || []).forEach(function (tm) {
          if (!tsFallback && tm !== metric && tm.value && tm.value.kind === 'timeseries' &&
              tm.spec && metric.spec && tm.spec.valueColumn === metric.spec.valueColumn &&
              tm.value.series && tm.value.series.length > 0) {
            tsFallback = tm.value.series;
          }
          // Also try multi_series: find a series whose label matches the KPI column
          if (!tsFallback && tm !== metric && tm.value && tm.value.kind === 'multi_series' &&
              metric.spec && metric.spec.valueColumn &&
              tm.value.series && tm.value.series.length > 0) {
            var msMatch = tm.value.series.find(function (s) { return s.label === metric.spec.valueColumn; });
            if (msMatch && msMatch.points && msMatch.points.length > 0) tsFallback = msMatch.points;
          }
        });
        if (tsFallback) {
          var val3 = 0;
          tsFallback.forEach(function (pt) {
            var bkt = pt.bucket.slice(0, 7);
            var ok = (!from || bkt >= from.slice(0, 7)) && (!to || bkt <= to.slice(0, 7));
            if (ok) val3 += pt.value || 0;
          });
          return Object.assign({}, metric.value, { value: val3 });
        }
      }
      return metric.value;
    }

    if (kind === 'average') {
      var catDim2 = firstActiveCategoryDim(slices);
      if (catDim2 && slices[catDim2] && slices[catDim2].sums && slices[catDim2].counts) {
        var allowed2 = allowedValues(catDim2);
        var sum = 0, cnt = 0;
        Object.keys(slices[catDim2].sums).forEach(function (v) {
          if (allowed2.has(v)) {
            sum += slices[catDim2].sums[v] || 0;
            cnt += slices[catDim2].counts[v] || 0;
          }
        });
        return Object.assign({}, metric.value, { value: cnt > 0 ? sum / cnt : 0, rowCount: cnt });
      }
      return metric.value;
    }

    if (kind === 'timeseries') {
      var catDim3 = firstActiveCategoryDim(slices);
      var series = metric.value.series;
      if (catDim3) {
        var per3 = slices[catDim3];
        var allowed3 = allowedValues(catDim3);
        var byBucket = {};
        Object.keys(per3).forEach(function (v) {
          if (!allowed3.has(v)) return;
          (per3[v] || []).forEach(function (p) {
            byBucket[p.bucket] = (byBucket[p.bucket] || 0) + p.value;
          });
        });
        series = Object.keys(byBucket).sort().map(function (b) {
          return { bucket: b, value: byBucket[b], rowCount: 0 };
        });
      }
      var dateDim2 = firstActiveDateDim(slices);
      if (dateDim2 && filterState[dateDim2]) {
        var from2 = filterState[dateDim2].from;
        var to2   = filterState[dateDim2].to;
        series = series.filter(function (p) {
          var bkt2 = p.bucket.slice(0, 7);
          return (!from2 || bkt2 >= from2.slice(0, 7)) && (!to2 || bkt2 <= to2.slice(0, 7));
        });
      }
      return Object.assign({}, metric.value, { series: series });
    }

    if (kind === 'top_n' || kind === 'donut') {
      var catDim4 = firstActiveCategoryDim(slices);
      if (catDim4) {
        var per4 = slices[catDim4];
        var allowed4 = allowedValues(catDim4);
        var combined = {};
        Object.keys(per4).forEach(function (v) {
          if (!allowed4.has(v)) return;
          Object.keys(per4[v] || {}).forEach(function (label) {
            combined[label] = (combined[label] || 0) + (per4[v][label] || 0);
          });
        });
        var n = metric.n || 5;
        var allEntries = Object.keys(combined)
          .sort(function (a, b) { return combined[b] - combined[a]; })
          .map(function (l) { return { label: l, value: combined[l], rowCount: 0, pctOfTotal: 0 }; });
        var top  = allEntries.slice(0, n);
        var rest = allEntries.slice(n).reduce(function (s, e) { return s + e.value; }, 0);
        var total = allEntries.reduce(function (s, e) { return s + e.value; }, 0);
        top.forEach(function (e) { e.pctOfTotal = total > 0 ? e.value / total : 0; });
        return Object.assign({}, metric.value, { entries: top, other: rest > 0 ? rest : null });
      }
      return metric.value;
    }

    return metric.value;
  }

  // ── 7. Filter UI (select dropdowns) ──────────────────────────────────────

  var filterBar = document.getElementById('filter-bar');
  if (filterBar && (data.filterDimensions || []).length) {
    // Header row: "Filters NNN orders  [Reset all]"
    var fbHead = document.createElement('div');
    fbHead.className = 'filter-bar-header';

    var fbTitle = document.createElement('div');
    fbTitle.className = 'filter-bar-title';
    fbTitle.innerHTML = '<span class="filter-funnel">&#9698;</span> Filters';
    var fbBadge = document.createElement('span');
    fbBadge.className = 'filter-bar-badge';
    var totalRec = (data.metrics || []).reduce(function (mx, m) {
      return (m.value && m.value.rowCount && m.value.rowCount > mx) ? m.value.rowCount : mx;
    }, 0);
    fbBadge.textContent = totalRec.toLocaleString() + ' records';
    fbTitle.appendChild(fbBadge);

    var fbReset = document.createElement('button');
    fbReset.className = 'filter-reset-btn';
    fbReset.textContent = 'Reset all';
    fbReset.addEventListener('click', function () {
      (data.filterDimensions || []).forEach(function (d) {
        if (d.kind === 'category') {
          filterState[d.column].deselected.clear();
          var sel = filterBar.querySelector('[data-filter-col="' + d.column + '"]');
          if (sel) sel.value = '__all__';
        } else if (d.kind === 'date') {
          filterState[d.column].from = d.dateRange.min.slice(0, 10);
          filterState[d.column].to   = d.dateRange.max.slice(0, 10);
          var fromEl = filterBar.querySelector('[data-filter-from="' + d.column + '"]');
          var toEl   = filterBar.querySelector('[data-filter-to="'   + d.column + '"]');
          if (fromEl) fromEl.value = d.dateRange.min.slice(0, 10);
          if (toEl)   toEl.value   = d.dateRange.max.slice(0, 10);
          filterBar.querySelectorAll('.period-preset-btn').forEach(function (b) { b.classList.remove('active'); });
        }
      });
      updateFilterStatus();
      renderAll();
    });

    fbHead.appendChild(fbTitle);
    fbHead.appendChild(fbReset);
    filterBar.appendChild(fbHead);

    // Body row: one filter per dimension
    var fbBody = document.createElement('div');
    fbBody.className = 'filter-bar-body';

    (data.filterDimensions || []).forEach(function (dim) {
      var wrap  = document.createElement('div');
      wrap.className = 'filter';

      var title = document.createElement('div');
      title.className = 'filter-title';
      title.textContent = dim.column.replace(/_/g, ' ');
      wrap.appendChild(title);

      if (dim.kind === 'category') {
        var sel = document.createElement('select');
        sel.className = 'filter-select';
        sel.dataset.filterCol = dim.column;

        var allOpt = document.createElement('option');
        allOpt.value = '__all__';
        allOpt.textContent = 'All ' + dim.column.replace(/_/g, ' ').toLowerCase();
        sel.appendChild(allOpt);

        (dim.values || []).forEach(function (v) {
          var opt = document.createElement('option');
          opt.value = v;
          opt.textContent = v;
          sel.appendChild(opt);
        });

        sel.addEventListener('change', function () {
          var val = sel.value;
          var set = filterState[dim.column].deselected;
          if (val === '__all__') {
            set.clear();
          } else {
            set.clear();
            (dim.values || []).forEach(function (v) { if (v !== val) set.add(v); });
          }
          updateFilterStatus();
          renderAll();
        });
        wrap.appendChild(sel);

      } else if (dim.kind === 'date') {
        var range = document.createElement('div');
        range.className = 'filter-range';

        var fromInput = document.createElement('input');
        fromInput.type  = 'date';
        fromInput.value = dim.dateRange.min.slice(0, 10);
        fromInput.dataset.filterFrom = dim.column;
        fromInput.addEventListener('change', function () {
          filterState[dim.column].from = fromInput.value;
          updateFilterStatus();
          renderAll();
        });

        var arrow = document.createElement('span');
        arrow.textContent = '→';
        arrow.className   = 'range-arrow';

        var toInput = document.createElement('input');
        toInput.type  = 'date';
        toInput.value = dim.dateRange.max.slice(0, 10);
        toInput.dataset.filterTo = dim.column;
        toInput.addEventListener('change', function () {
          filterState[dim.column].to = toInput.value;
          updateFilterStatus();
          renderAll();
        });

        range.appendChild(fromInput);
        range.appendChild(arrow);
        range.appendChild(toInput);
        wrap.appendChild(range);

        // Quick period preset chips
        var presets = document.createElement('div');
        presets.className = 'period-presets';
        var _maxDate = dim.dateRange.max.slice(0, 10);
        var _minDate = dim.dateRange.min.slice(0, 10);
        var _dimCol  = dim.column;
        function calcPresetFrom(months) {
          if (months === 0) return _minDate;
          var pd = new Date(_maxDate + 'T00:00:00Z');
          pd.setUTCMonth(pd.getUTCMonth() - months);
          return pd.toISOString().slice(0, 10);
        }
        [['3M', 3], ['6M', 6], ['1Y', 12], ['All', 0]].forEach(function (pr) {
          var pbtn = document.createElement('button');
          pbtn.className = 'period-preset-btn';
          pbtn.textContent = pr[0];
          var _from = calcPresetFrom(pr[1]);
          pbtn.addEventListener('click', function () {
            filterState[_dimCol].from = _from;
            filterState[_dimCol].to   = _maxDate;
            fromInput.value = _from;
            toInput.value   = _maxDate;
            presets.querySelectorAll('.period-preset-btn').forEach(function (b) { b.classList.remove('active'); });
            pbtn.classList.add('active');
            updateFilterStatus();
            renderAll();
          });
          presets.appendChild(pbtn);
        });
        wrap.appendChild(presets);
      }

      fbBody.appendChild(wrap);
    });

    filterBar.appendChild(fbBody);

    // Status text
    var fbStatus = document.createElement('div');
    fbStatus.className = 'filter-status';
    filterBar.appendChild(fbStatus);

    function updateFilterStatus() {
      var active = (data.filterDimensions || []).filter(function (d) {
        if (d.kind === 'category') return filterState[d.column].deselected.size > 0;
        if (d.kind === 'date') {
          return filterState[d.column].from !== d.dateRange.min.slice(0, 10) ||
                 filterState[d.column].to   !== d.dateRange.max.slice(0, 10);
        }
        return false;
      });
      fbStatus.textContent = active.length
        ? active.length + ' filter' + (active.length > 1 ? 's' : '') + ' active — ' + active.map(function (d) { return d.column.replace(/_/g, ' '); }).join(', ')
        : 'No filters applied — showing all data.';
    }
    updateFilterStatus();
  }

  function syncChipUiFor(column) {
    var sel = filterBar && filterBar.querySelector('[data-filter-col="' + column + '"]');
    if (!sel) return;
    var deselected = (filterState[column] || {}).deselected || new Set();
    if (deselected.size === 0) {
      sel.value = '__all__';
    } else {
      // If exactly one value is selected, show it in the dropdown
      var dims = (data.filterDimensions || []).find(function (d) { return d.column === column; });
      var vals = dims && dims.values ? dims.values : [];
      var active = vals.filter(function (v) { return !deselected.has(v); });
      sel.value = active.length === 1 ? active[0] : '__all__';
    }
  }

  // ── 8. Chart registry ─────────────────────────────────────────────────────

  var chartInstances = {};

  function destroyChart(id) {
    if (chartInstances[id]) {
      try { chartInstances[id].destroy(); } catch (_) {}
      chartInstances[id] = null;
    }
  }

  // ── 9. Shared chart option builders ───────────────────────────────────────

  function tooltipBase() {
    return {
      backgroundColor: isLightTheme ? 'rgba(15,23,42,0.85)' : 'rgba(15,23,42,0.95)',
      titleColor:  '#f0f4f8',
      bodyColor:   '#f0f4f8',
      padding:     10,
      cornerRadius: 8,
      borderColor: 'rgba(148,163,184,.2)',
      borderWidth: 1
    };
  }

  function lineScales() {
    return {
      x: {
        grid:  { display: false },
        ticks: { maxTicksLimit: 8, color: chartTextColor }
      },
      y: {
        ticks: {
          color: chartTextColor,
          callback: function (v) { return fmt(v); }
        },
        grid: { color: chartGridColor }
      }
    };
  }

  function makeLineDataset(label, pts, colorHex, filled, canvasEl) {
    var bg = 'transparent';
    if (filled && canvasEl) {
      try {
        var h = canvasEl.offsetHeight || 280;
        var grad = canvasEl.getContext('2d').createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, colorHex + '40');
        grad.addColorStop(0.7, colorHex + '12');
        grad.addColorStop(1, colorHex + '00');
        bg = grad;
      } catch (_) { bg = colorHex + '20'; }
    }
    return {
      label:            label,
      data:             pts,
      borderColor:      colorHex,
      backgroundColor:  bg,
      fill:             !!filled,
      tension:          0.4,
      pointRadius:      pts.length > 60 ? 0 : 4,
      pointHoverRadius: 6,
      pointBackgroundColor: '#ffffff',
      pointBorderColor:     colorHex,
      pointBorderWidth:     2,
      borderWidth:      2.5
    };
  }

  // Crosshair plugin — draws a vertical dashed line at hovered index
  var crosshairPlugin = {
    id: 'fa-crosshair',
    afterDraw: function (chart) {
      if (chart.tooltip._active && chart.tooltip._active.length) {
        var ctx = chart.ctx;
        var x   = chart.tooltip._active[0].element.x;
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = isLightTheme ? 'rgba(100,116,139,.35)' : 'rgba(148,163,184,.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, chart.chartArea.top);
        ctx.lineTo(x, chart.chartArea.bottom);
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  // Bar gradient plugin — replaces per-bar rainbow with a single gradient fill
  var barGradPlugin = {
    id: 'fa-bar-grad',
    beforeDatasetsDraw: function (chart) {
      var area = chart.chartArea;
      if (!area) return;
      var ctx0 = chart.ctx;
      var isHoriz = chart.options && chart.options.indexAxis === 'y';
      chart.data.datasets.forEach(function (ds) {
        var grad = isHoriz
          ? ctx0.createLinearGradient(area.left, 0, area.right, 0)
          : ctx0.createLinearGradient(0, area.bottom, 0, area.top);
        if (isLightTheme) {
          grad.addColorStop(0, '#1e40af');
          grad.addColorStop(1, '#60a5fa');
        } else {
          grad.addColorStop(0, '#16a34a');
          grad.addColorStop(1, '#4ade80');
        }
        ds.backgroundColor = (ds.data || []).map(function () { return grad; });
      });
    }
  };

  // Data labels plugin — value text after horizontal bars / above vertical bars.
  // Datasets may set _pctTotal to show "val (N%)" labels.
  var barLabelsPlugin = {
    id: 'fa-bar-labels',
    afterDatasetsDraw: function (chart) {
      var ctx1 = chart.ctx;
      var isHoriz = chart.options && chart.options.indexAxis === 'y';
      chart.data.datasets.forEach(function (ds, di) {
        var meta = chart.getDatasetMeta(di);
        if (meta.hidden) return;
        meta.data.forEach(function (bar, idx) {
          var val = ds.data[idx];
          if (val == null) return;
          var labelText = fmt(val);
          if (ds._pctTotal && ds._pctTotal > 0) {
            var pct = Math.round(val / ds._pctTotal * 100);
            labelText = fmt(val) + ' (' + pct + '%)';
          }
          ctx1.save();
          ctx1.fillStyle = isLightTheme ? '#374151' : '#8b949e';
          ctx1.font = '600 11px Inter, ui-sans-serif, sans-serif';
          ctx1.textBaseline = 'middle';
          if (isHoriz) {
            ctx1.textAlign = 'left';
            ctx1.fillText(labelText, bar.x + 5, bar.y);
          } else {
            ctx1.textAlign = 'center';
            ctx1.fillText(labelText, bar.x, bar.y - 8);
          }
          ctx1.restore();
        });
      });
    }
  };

  // Max/min annotation plugin — marks the peak and trough of a line chart
  var maxMinPlugin = {
    id: 'fa-maxmin',
    afterDatasetsDraw: function (chart) {
      var ds = chart.data.datasets[0];
      if (!ds || !ds.data || ds.data.length < 4) return;
      var meta0 = chart.getDatasetMeta(0);
      if (!meta0 || meta0.hidden) return;
      var vals = ds.data;
      var maxIdx = vals.reduce(function (mi, v, i) { return v > vals[mi] ? i : mi; }, 0);
      var minIdx = vals.reduce(function (mi, v, i) { return v < vals[mi] ? i : mi; }, 0);
      if (maxIdx === minIdx) return;
      var ctx2 = chart.ctx;
      var ca2 = chart.chartArea;
      [[maxIdx, '#16a34a', -16, '▲'], [minIdx, '#ef4444', 16, '▼']].forEach(function (ann) {
        var pt = meta0.data[ann[0]];
        if (!pt) return;
        var lx = Math.max(ca2.left + 26, Math.min(ca2.right - 26, pt.x));
        var ly = pt.y + ann[2];
        var txt = ann[3] + ' ' + fmt(vals[ann[0]]);
        ctx2.save();
        ctx2.font = '600 10px Inter, ui-sans-serif, sans-serif';
        var tw = ctx2.measureText(txt).width;
        ctx2.fillStyle = isLightTheme ? 'rgba(255,255,255,0.92)' : 'rgba(13,17,23,0.92)';
        ctx2.beginPath();
        if (ctx2.roundRect) {
          ctx2.roundRect(lx - tw / 2 - 5, ly - 8, tw + 10, 16, 4);
        } else {
          ctx2.rect(lx - tw / 2 - 5, ly - 8, tw + 10, 16);
        }
        ctx2.fill();
        ctx2.fillStyle = ann[1];
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'middle';
        ctx2.fillText(txt, lx, ly);
        ctx2.restore();
      });
    }
  };

  // ── 10. Render all / render one ───────────────────────────────────────────

  function renderAll() {
    (data.metrics || []).forEach(function (m) {
      try { renderMetric(m); } catch (e) {
        console.warn('[ForgeAI] render failed', m && m.id, e);
      }
    });
  }

  function renderMetric(m) {
    if (!m || !m.value) return;
    var kind       = m.value.kind;
    var displayVal = currentValue(m);

    // ── KPI tile update ──
    var kpiEl    = document.querySelector('[data-kpi-value="' + m.id + '"]');
    var subEl    = document.querySelector('[data-kpi-sub="'   + m.id + '"]');
    var deltaEl  = document.querySelector('[data-kpi-delta="' + m.id + '"]');
    if (kpiEl && (kind === 'total' || kind === 'average' || kind === 'distinct_count' || kind === 'ratio')) {
      var rawVal = displayVal.value;
      if (kind === 'ratio') rawVal = (displayVal.ratio || 0) * (displayVal.asPercent ? 100 : 1);
      var suffix = (kind === 'ratio' && displayVal.asPercent) ? '%' : '';
      var formatted = fmt(rawVal) + suffix;
      animateCounter(kpiEl, formatted);
      if (subEl) {
        if (kind === 'distinct_count') subEl.textContent = fmt(displayVal.rowCount) + ' total rows';
        else if (kind === 'ratio')     subEl.textContent = fmt(displayVal.numerator) + ' / ' + fmt(displayVal.denominator);
        else                           subEl.textContent = fmt(displayVal.rowCount) + ' rows';
      }
      // Compute month-over-month delta from date slices (or timeseries fallback)
      if (deltaEl) {
        var delta = null;
        if (m.value && m.value.slices) {
          var dateCols2 = (data.filterDimensions || [])
            .filter(function (d) { return d.kind === 'date'; })
            .map(function (d) { return d.column; });
          for (var di = 0; di < dateCols2.length && !delta; di++) {
            var sliceObj2 = m.value.slices[dateCols2[di]];
            if (!sliceObj2 || typeof sliceObj2 !== 'object') continue;
            var mkeys = Object.keys(sliceObj2).filter(function (k) { return typeof sliceObj2[k] === 'number'; }).sort();
            if (mkeys.length >= 2) {
              var dLast = Number(sliceObj2[mkeys[mkeys.length - 1]]) || 0;
              var dPrev = Number(sliceObj2[mkeys[mkeys.length - 2]]) || 0;
              if (dPrev !== 0) delta = { pct: (dLast - dPrev) / dPrev * 100, last: dLast, prev: dPrev };
            }
          }
        }
        // Timeseries / multi_series fallback
        if (!delta) {
          (data.metrics || []).forEach(function (tm) {
            if (delta) return;
            var ser = null;
            if (tm !== m && tm.value && tm.value.kind === 'timeseries' &&
                tm.spec && m.spec && tm.spec.valueColumn === m.spec.valueColumn &&
                tm.value.series && tm.value.series.length >= 2) {
              ser = tm.value.series;
            }
            // multi_series: find series whose label matches the KPI column
            if (!ser && tm !== m && tm.value && tm.value.kind === 'multi_series' &&
                m.spec && m.spec.valueColumn && tm.value.series && tm.value.series.length > 0) {
              var msMatch2 = tm.value.series.find(function (s) { return s.label === m.spec.valueColumn; });
              if (msMatch2 && msMatch2.points && msMatch2.points.length >= 2) ser = msMatch2.points;
            }
            if (ser && ser.length >= 2) {
              var tLast = ser[ser.length - 1].value || 0;
              var tPrev = ser[ser.length - 2].value || 0;
              if (tPrev !== 0) delta = { pct: (tLast - tPrev) / tPrev * 100, last: tLast, prev: tPrev };
            }
          });
        }
        if (delta) {
          var dDir = delta.pct > 0.05 ? 'up' : delta.pct < -0.05 ? 'down' : 'flat';
          var dArrow = dDir === 'up' ? '▲' : dDir === 'down' ? '▼' : '·';
          deltaEl.className = 'kpi-delta ' + dDir;
          deltaEl.textContent = dArrow + ' ' + Math.abs(delta.pct).toFixed(1) + '%';
          var dSubEl = document.querySelector('[data-kpi-sub="' + m.id + '"]');
          if (dSubEl && dSubEl.textContent && !dSubEl.textContent.includes('vs prior')) {
            dSubEl.textContent = dSubEl.textContent + ' · vs prior period';
          }
        } else {
          deltaEl.className = 'kpi-delta';
          deltaEl.textContent = '';
        }
      }
    }

    // ── Canvas chart ──
    var canvasId = 'chart-' + m.id;
    var el = document.getElementById(canvasId);
    if (!el || !window.Chart) return;
    destroyChart(canvasId);

    // ── Timeseries (single line) ──
    if (kind === 'timeseries') {
      chartInstances[canvasId] = new Chart(el.getContext('2d'), {
        type: 'line',
        data: {
          labels:   displayVal.series.map(function (p) { return p.bucket; }),
          datasets: [makeLineDataset(m.label, displayVal.series.map(function (p) { return p.value; }), ACCENT, true, el)]
        },
        plugins: [crosshairPlugin, maxMinPlugin],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: 'index' },
          plugins: {
            legend: { display: false },
            tooltip: Object.assign(tooltipBase(), {
              callbacks: {
                label:  function (c) { return (c.dataset.label || '') + ': ' + fmt(c.parsed.y); },
                footer: function (items) {
                  if (items.length < 2) return '';
                  return 'Total: ' + fmt(items.reduce(function (s, i) { return s + (i.parsed.y || 0); }, 0));
                }
              }
            })
          },
          scales: lineScales()
        }
      });
      return;
    }

    // ── Multi-series line ──
    if (kind === 'multi_series') {
      // Apply date filter to each series' points
      var msDim = firstActiveDateDim(displayVal.slices || {});
      if (!msDim) {
        // Try filter dims directly since multi_series may not have slices
        (data.filterDimensions || []).forEach(function (fd) {
          if (!msDim && fd.kind === 'date' && filterState[fd.column]) {
            var fst = filterState[fd.column];
            if (fst.from !== fd.dateRange.min.slice(0, 10) || fst.to !== fd.dateRange.max.slice(0, 10)) msDim = fd.column;
          }
        });
      }
      var msDisplayVal = displayVal;
      if (msDim) {
        var msFrom = filterState[msDim].from;
        var msTo   = filterState[msDim].to;
        msDisplayVal = Object.assign({}, displayVal, {
          series: (displayVal.series || []).map(function (s) {
            return Object.assign({}, s, {
              points: (s.points || []).filter(function (p) {
                var bkt = p.bucket.slice(0, 7);
                return (!msFrom || bkt >= msFrom.slice(0, 7)) && (!msTo || bkt <= msTo.slice(0, 7));
              })
            });
          })
        });
      }
      var first = msDisplayVal.series[0] || {};
      chartInstances[canvasId] = new Chart(el.getContext('2d'), {
        type: 'line',
        data: {
          labels:   (first.points || []).map(function (p) { return p.bucket; }),
          datasets: msDisplayVal.series.map(function (s, i) {
            return makeLineDataset(s.label, s.points.map(function (p) { return p.value; }), PALETTE[i % PALETTE.length], true, el);
          })
        },
        plugins: [crosshairPlugin],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: 'index' },
          plugins: {
            legend: { display: true, position: 'top', labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true, color: chartTextColor } },
            tooltip: Object.assign(tooltipBase(), {
              callbacks: {
                label:  function (c) { return (c.dataset.label || '') + ': ' + fmt(c.parsed.y); },
                footer: function (items) {
                  if (items.length < 2) return '';
                  return 'Total: ' + fmt(items.reduce(function (s, i) { return s + (i.parsed.y || 0); }, 0));
                }
              }
            })
          },
          scales: lineScales()
        }
      });
      return;
    }

    // ── Bar (top-N) or Doughnut ──
    if (kind === 'top_n' || kind === 'donut') {
      var entries = (displayVal.entries || []).slice();
      if (displayVal.other != null && displayVal.other > 0) {
        entries.push({ label: 'Other', value: displayVal.other });
      }

      // Cross-filter: clicking a segment isolates that category value.
      var crossCol = null;
      if (m.groupColumn) {
        var hasDim = (data.filterDimensions || []).some(function (d) {
          return d.kind === 'category' && d.column === m.groupColumn;
        });
        if (hasDim) crossCol = m.groupColumn;
      }

      var clickHandler = null;
      if (crossCol) {
        var _col = crossCol;
        var _entries = entries;
        clickHandler = function (evt, active) {
          if (!active.length) return;
          var label = _entries[active[0].index] && _entries[active[0].index].label;
          if (!label || label === 'Other') return;
          var dim = (data.filterDimensions || []).find(function (d) { return d.column === _col; });
          var dimVals = dim && dim.values ? dim.values : [];
          var set = filterState[_col].deselected;
          var alreadyIsolated = set.size === dimVals.length - 1 && !set.has(label);
          if (alreadyIsolated) {
            set.clear();
          } else {
            set.clear();
            dimVals.forEach(function (v) { if (v !== label) set.add(v); });
          }
          syncChipUiFor(_col);
          renderAll();
        };
      }

      if (kind === 'top_n') {
        chartInstances[canvasId] = new Chart(el.getContext('2d'), {
          type: 'bar',
          plugins: [barGradPlugin, barLabelsPlugin],
          data: {
            labels:   entries.map(function (e) { return e.label; }),
            datasets: [{
              label:           m.label,
              data:            entries.map(function (e) { return e.value; }),
              backgroundColor: ACCENT,
              borderWidth:     0,
              borderRadius:    4,
              _pctTotal:       entries.reduce(function (s, e) { return s + e.value; }, 0)
            }]
          },
          options: {
            responsive:          true,
            maintainAspectRatio: false,
            indexAxis:           'y',
            onClick:             clickHandler,
            layout: { padding: { right: 56 } },
            plugins: {
              legend:  { display: false },
              tooltip: Object.assign(tooltipBase(), {
                callbacks: { label: function (c) { return fmt(c.parsed.x); } }
              })
            },
            scales: {
              x: {
                display: false,
                ticks: { callback: function (v) { return fmt(v); }, color: chartTextColor },
                grid:  { display: false }
              },
              y: { grid: { display: false }, ticks: { color: chartTextColor } }
            }
          }
        });

      } else {
        // Doughnut with custom HTML legend + center text
        var donutTotal = entries.reduce(function (a, e) { return a + e.value; }, 0);
        var mLabelForCenter = m.label;
        var donutCenterPlugin = {
          id: 'fa-donut-center-' + canvasId,
          beforeDraw: function (chart) {
            var ctx5 = chart.ctx;
            var a = chart.chartArea;
            if (!a) return;
            var cx5 = (a.left + a.right) / 2;
            var cy5 = (a.top + a.bottom) / 2;
            ctx5.save();
            ctx5.textAlign = 'center';
            ctx5.textBaseline = 'middle';
            ctx5.fillStyle = isLightTheme ? '#0f1e3a' : '#f0f4f8';
            var tv = donutTotal;
            var tvStr = tv >= 1e9 ? (tv / 1e9).toFixed(1) + 'B'
              : tv >= 1e6 ? (tv / 1e6).toFixed(2).replace(/\\.?0+$/, '') + 'M'
              : tv >= 1e3 ? (tv / 1e3).toFixed(1).replace(/\\.?0+$/, '') + 'K'
              : tv.toLocaleString();
            ctx5.font = '700 15px "Space Grotesk", ui-sans-serif, sans-serif';
            ctx5.fillText(tvStr, cx5, cy5 - 8);
            ctx5.font = '500 9px Inter, ui-sans-serif, sans-serif';
            ctx5.fillStyle = isLightTheme ? '#64748b' : '#8b949e';
            ctx5.fillText(mLabelForCenter.toUpperCase().slice(0, 14), cx5, cy5 + 9);
            ctx5.restore();
          }
        };
        chartInstances[canvasId] = new Chart(el.getContext('2d'), {
          type: 'doughnut',
          plugins: [donutCenterPlugin],
          data: {
            labels:   entries.map(function (e) { return e.label; }),
            datasets: [{
              data:            entries.map(function (e) { return e.value; }),
              backgroundColor: entries.map(function (_e, i) { return PALETTE[i % PALETTE.length]; }),
              borderColor:     doughnutBorderColor,
              borderWidth:     3
            }]
          },
          options: {
            responsive:          true,
            maintainAspectRatio: false,
            cutout:              '62%',
            onClick:             clickHandler,
            plugins: {
              legend: { display: false },
              tooltip: Object.assign(tooltipBase(), {
                callbacks: {
                  label: function (c) {
                    var v   = c.parsed;
                    var pct = donutTotal > 0 ? Math.round(v / donutTotal * 100) : 0;
                    return c.label + ': ' + fmt(v) + ' (' + pct + '%)';
                  }
                }
              })
            }
          }
        });
        // Inject custom HTML legend next to the canvas
        var wrap2 = el.parentElement;
        if (wrap2) {
          wrap2.classList.add('donut-wrap');
          var oldLeg = wrap2.querySelector('.donut-legend');
          if (oldLeg) wrap2.removeChild(oldLeg);
          var leg = document.createElement('div');
          leg.className = 'donut-legend';
          entries.forEach(function (e, ei) {
            var dColor = PALETTE[ei % PALETTE.length];
            var dPct = donutTotal > 0 ? (e.value / donutTotal * 100).toFixed(1) : '0.0';
            var dBarW = donutTotal > 0 ? Math.round(e.value / donutTotal * 100) : 0;
            var li = document.createElement('div');
            li.className = 'donut-legend-item';
            li.innerHTML =
              '<div class="donut-legend-row">' +
                '<span class="donut-legend-dot" style="background:' + dColor + '"></span>' +
                '<span class="donut-legend-name">' + (e.label || '') + '</span>' +
                '<span class="donut-legend-pct">' + dPct + '%</span>' +
              '</div>' +
              '<div class="donut-legend-val">' + fmt(e.value) + '</div>' +
              '<div class="donut-legend-bar-bg"><div class="donut-legend-bar-fill" style="width:' + dBarW + '%;background:' + dColor + '"></div></div>';
            if (crossCol) {
              li.style.cursor = 'pointer';
              (function (lbl) {
                li.addEventListener('click', function () {
                  var dim3 = (data.filterDimensions || []).find(function (d) { return d.column === crossCol; });
                  var vals3 = dim3 && dim3.values ? dim3.values : [];
                  var set3 = filterState[crossCol].deselected;
                  var iso3 = set3.size === vals3.length - 1 && !set3.has(lbl);
                  if (iso3) { set3.clear(); } else { set3.clear(); vals3.forEach(function (v) { if (v !== lbl) set3.add(v); }); }
                  syncChipUiFor(crossCol);
                  renderAll();
                });
              })(e.label);
            }
            leg.appendChild(li);
          });
          wrap2.appendChild(leg);
        }
      }
      return;
    }

    // ── Grouped / stacked bar ──
    if (kind === 'grouped_bar') {
      chartInstances[canvasId] = new Chart(el.getContext('2d'), {
        type: 'bar',
        data: {
          labels:   displayVal.groups.map(function (g) { return g.label; }),
          datasets: displayVal.splitLabels.map(function (s, i) {
            return {
              label:           s,
              data:            displayVal.groups.map(function (g) {
                var match = g.splits.find(function (sp) { return sp.label === s; });
                return match ? match.value : 0;
              }),
              backgroundColor: PALETTE[i % PALETTE.length],
              borderWidth:     0,
              borderRadius:    3
            };
          })
        },
        plugins: [barLabelsPlugin],
        options: {
          responsive:          true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels:   { boxWidth: 12, boxHeight: 12, usePointStyle: true, color: chartTextColor }
            },
            tooltip: Object.assign(tooltipBase(), {
              callbacks: { label: function (c) { return c.dataset.label + ': ' + fmt(c.parsed.y); } }
            })
          },
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { color: chartTextColor } },
            y: {
              stacked: true,
              ticks:   { callback: function (v) { return fmt(v); }, color: chartTextColor },
              grid:    { color: chartGridColor }
            }
          }
        }
      });
      return;
    }

    // ── Gauge (half-doughnut) ──
    if (kind === 'gauge') {
      var gaugeVal    = displayVal.value    || 0;
      var gaugeTarget = displayVal.target   || 1;
      var gaugePct    = gaugeTarget > 0 ? Math.min(gaugeVal / gaugeTarget, 1) : 0;
      var gaugeColor  = gaugePct >= 0.8 ? PALETTE[0] : gaugePct >= 0.5 ? PALETTE[2] : PALETTE[4];
      chartInstances[canvasId] = new Chart(el.getContext('2d'), {
        type: 'doughnut',
        data: {
          datasets: [{
            data:            [gaugePct, 1 - gaugePct],
            backgroundColor: [gaugeColor, chartBorderColor],
            borderWidth:     0,
            circumference:   180,
            rotation:        -90
          }]
        },
        options: {
          responsive:          true,
          maintainAspectRatio: false,
          cutout:              '75%',
          plugins: {
            legend:  { display: false },
            tooltip: { enabled: false }
          }
        }
      });
      return;
    }
  }

  // ── 11. Tab switching ─────────────────────────────────────────────────────

  var tabBtns   = document.querySelectorAll('[data-tab-target]');
  var tabPanels = document.querySelectorAll('[data-tab-panel]');

  tabBtns.forEach(function (t) {
    t.addEventListener('click', function () {
      tabBtns.forEach(function (x) { x.classList.remove('active'); });
      tabPanels.forEach(function (p) { p.style.display = 'none'; });
      t.classList.add('active');
      var target = document.querySelector('[data-tab-panel="' + t.dataset.tabTarget + '"]');
      if (target) target.style.display = '';
      // Chart.js sizes incorrectly while hidden — re-render after reveal.
      setTimeout(renderAll, 60);
    });
  });

  // ── 12. PDF export ────────────────────────────────────────────────────────

  var pdfBtn = document.getElementById('fa-pdf-btn');
  if (pdfBtn) {
    pdfBtn.addEventListener('click', function () { window.print(); });
  }

  // ── 13. Toast helper ─────────────────────────────────────────────────────

  function showToast(msg) {
    var area = document.getElementById('fa-toast-area');
    if (!area) return;
    var el = document.createElement('div');
    el.className = 'fa-toast';
    el.textContent = msg;
    area.appendChild(el);
    requestAnimationFrame(function () {
      el.classList.add('fa-toast-show');
      setTimeout(function () {
        el.classList.remove('fa-toast-show');
        setTimeout(function () { if (area.contains(el)) area.removeChild(el); }, 350);
      }, 2200);
    });
  }

  // ── 14. Interactive data tables (search + sort + CSV) ────────────────────

  function initTableControls() {
    document.querySelectorAll('.data-table').forEach(function (card) {
      var table     = card.querySelector('table');
      var searchEl  = card.querySelector('.tbl-search');
      var countEl   = card.querySelector('.tbl-count');
      var exportBtn = card.querySelector('.tbl-export-btn');
      if (!table) return;

      var allRows = Array.from(table.querySelectorAll('tbody tr'));

      function refreshCount() {
        if (!countEl) return;
        var vis = allRows.filter(function (r) { return r.style.display !== 'none'; }).length;
        countEl.textContent = vis === allRows.length
          ? allRows.length + ' rows'
          : vis + ' / ' + allRows.length + ' rows';
      }
      refreshCount();

      // Live search
      if (searchEl) {
        searchEl.addEventListener('input', function () {
          var q = searchEl.value.toLowerCase();
          allRows.forEach(function (r) {
            r.style.display = (!q || r.textContent.toLowerCase().includes(q)) ? '' : 'none';
          });
          refreshCount();
        });
      }

      // Row click highlight (toggle)
      allRows.forEach(function (row) {
        row.style.cursor = 'pointer';
        row.addEventListener('click', function () {
          var wasHl = row.classList.contains('row-hl');
          allRows.forEach(function (r) { r.classList.remove('row-hl'); });
          if (!wasHl) row.classList.add('row-hl');
        });
      });

      // Conditional numeric coloring — color cells > +1.5 σ or < -1.5 σ from mean
      var allThs = Array.from(table.querySelectorAll('thead th'));
      allThs.forEach(function (th, ci) {
        var cells = allRows.map(function (r) { return r.cells[ci]; }).filter(Boolean);
        var nums = cells.map(function (c) { return parseFloat(c.textContent.trim().replace(/[^0-9.\-]/g, '')); }).filter(function (n) { return !isNaN(n) && isFinite(n); });
        if (nums.length < 4) return;
        var mean = nums.reduce(function (a, n) { return a + n; }, 0) / nums.length;
        var std  = Math.sqrt(nums.reduce(function (a, n) { return a + (n - mean) * (n - mean); }, 0) / nums.length);
        if (std < 0.001) return;
        cells.forEach(function (cell) {
          var n = parseFloat(cell.textContent.trim().replace(/[^0-9.\-]/g, ''));
          if (isNaN(n)) return;
          var z = (n - mean) / std;
          if (z > 1.5) cell.classList.add('cell-high');
          else if (z < -1.5) cell.classList.add('cell-low');
        });
      });

      // Column sort — click any <th class="sortable">
      Array.from(table.querySelectorAll('thead th.sortable')).forEach(function (th, idx) {
        var ascending = false;
        th.addEventListener('click', function () {
          var tbody = table.querySelector('tbody');
          var rows  = Array.from(tbody.querySelectorAll('tr'));
          ascending = !ascending;
          rows.sort(function (a, b) {
            var at = ((a.cells[idx] || {}).textContent || '').trim();
            var bt = ((b.cells[idx] || {}).textContent || '').trim();
            var an = parseFloat(at.replace(/[^0-9.\-]/g, ''));
            var bn = parseFloat(bt.replace(/[^0-9.\-]/g, ''));
            if (!isNaN(an) && !isNaN(bn)) return ascending ? an - bn : bn - an;
            return ascending ? at.localeCompare(bt) : bt.localeCompare(at);
          });
          rows.forEach(function (r) { tbody.appendChild(r); });
          Array.from(table.querySelectorAll('thead th')).forEach(function (t) {
            t.dataset.sortDir = '';
          });
          th.dataset.sortDir = ascending ? 'asc' : 'desc';
          refreshCount();
        });
      });

      // CSV export
      if (exportBtn) {
        exportBtn.addEventListener('click', function () {
          var ths = Array.from(table.querySelectorAll('thead th')).map(function (t) {
            return '"' + t.textContent.trim().replace(/[⇅↑↓]/g, '').trim().replace(/"/g, '""') + '"';
          });
          var rows = Array.from(table.querySelectorAll('tbody tr'))
            .filter(function (r) { return r.style.display !== 'none'; })
            .map(function (row) {
              return Array.from(row.cells).map(function (cell) {
                return '"' + cell.textContent.trim().replace(/"/g, '""') + '"';
              }).join(',');
            });
          var csv  = [ths.join(',')].concat(rows).join('\\n');
          var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          var url  = URL.createObjectURL(blob);
          var a    = document.createElement('a');
          a.href     = url;
          a.download = 'table-data.csv';
          document.body.appendChild(a);
          a.click();
          setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
          showToast('CSV downloaded');
        });
      }
    });
  }

  // ── 15. Chart fullscreen ─────────────────────────────────────────────────

  function initChartFullscreen() {
    var backdrop = document.getElementById('fa-backdrop');

    function closeAll() {
      document.querySelectorAll('.card.fa-fullscreen').forEach(function (c) {
        c.classList.remove('fa-fullscreen');
        var cid = 'chart-' + c.dataset.chartId;
        if (chartInstances[cid]) {
          setTimeout(function () { try { chartInstances[cid].resize(); } catch (_) {} }, 120);
        }
      });
      if (backdrop) backdrop.classList.remove('fa-backdrop-show');
    }

    if (backdrop) backdrop.addEventListener('click', closeAll);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });

    document.querySelectorAll('.expand-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var card  = btn.closest('.card');
        if (!card) return;
        var wasOpen = card.classList.contains('fa-fullscreen');
        closeAll();
        if (!wasOpen) {
          card.classList.add('fa-fullscreen');
          if (backdrop) backdrop.classList.add('fa-backdrop-show');
          var cid = 'chart-' + card.dataset.chartId;
          if (chartInstances[cid]) {
            setTimeout(function () { try { chartInstances[cid].resize(); } catch (_) {} }, 120);
          }
        }
      });
    });
  }

  // ── 16. KPI copy-to-clipboard ────────────────────────────────────────────

  function initKpiCopy() {
    document.querySelectorAll('.kpi-card').forEach(function (tile) {
      tile.setAttribute('title', 'Click to copy value');
      tile.addEventListener('click', function () {
        var el = tile.querySelector('.kpi-val');
        if (!el) return;
        var text = el.textContent.trim();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text)
            .then(function () { showToast('Copied: ' + text); })
            .catch(function ()  { showToast(text); });
        } else {
          showToast(text);
        }
      });
    });
  }

  // ── 17. KPI sparklines (mini trend behind each KPI tile) ─────────────────

  function drawSparkline(canvas, values, accentHex) {
    var W = canvas.offsetWidth;
    var H = canvas.offsetHeight || 52;
    if (!W || values.length < 2) return;
    canvas.width  = W;
    canvas.height = H;

    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    var sColor = accentHex || ACCENT;
    // Parse hex → rgb for rgba string
    function hexToRgba(hex, alpha) {
      var h = hex.replace('#', '');
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      var r = parseInt(h.slice(0, 2), 16);
      var g = parseInt(h.slice(2, 4), 16);
      var b = parseInt(h.slice(4, 6), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    var min   = Math.min.apply(null, values);
    var max   = Math.max.apply(null, values);
    var range = (max - min) || 1;
    var n     = values.length;
    var pad   = 2;

    // Line
    ctx.beginPath();
    ctx.strokeStyle = hexToRgba(sColor, 0.55);
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    values.forEach(function (v, i) {
      var x = pad + (i / (n - 1)) * (W - pad * 2);
      var y = H - pad - ((v - min) / range) * (H - pad * 2);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Gradient fill beneath the line
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, hexToRgba(sColor, 0.2));
    grad.addColorStop(1, hexToRgba(sColor, 0.01));
    ctx.lineTo(W - pad, H);
    ctx.lineTo(pad, H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // End-point dot
    var lastX = pad + ((n - 1) / (n - 1)) * (W - pad * 2);
    var lastY = H - pad - ((values[n - 1] - min) / range) * (H - pad * 2);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = sColor;
    ctx.fill();
  }

  function initSparklines() {
    var dateCols = (data.filterDimensions || [])
      .filter(function (d) { return d.kind === 'date'; })
      .map(function (d) { return d.column; });

    (data.metrics || []).forEach(function (m) {
      if (!m.value || !m.value.slices) return;
      var canvas = document.getElementById('sparkline-' + m.id);
      if (!canvas) return;

      // Get accent color from KPI card's CSS custom property
      var card = canvas.closest('.kpi-card');
      var accentColor = (card && card.style.getPropertyValue('--kpi-accent').trim()) || ACCENT;

      // Find a date slice for this metric
      var dim = null;
      for (var i = 0; i < dateCols.length; i++) {
        var sliceCheck = m.value.slices[dateCols[i]];
        if (sliceCheck && Object.keys(sliceCheck).length > 0) { dim = dateCols[i]; break; }
      }

      // Fallback: use matching timeseries series data for sparkline
      if (!dim) {
        var tsSpark = null;
        (data.metrics || []).forEach(function (tm) {
          if (!tsSpark && tm !== m && tm.value && tm.value.kind === 'timeseries' &&
              tm.spec && m.spec && tm.spec.valueColumn === m.spec.valueColumn &&
              tm.value.series && tm.value.series.length >= 3) {
            tsSpark = tm.value.series.map(function (p) { return p.value || 0; });
          }
        });
        if (tsSpark) drawSparkline(canvas, tsSpark, accentColor);
        return;
      }

      var sliceObj = m.value.slices[dim];
      var keys = Object.keys(sliceObj).sort();
      if (keys.length < 2) return;

      var values = keys.map(function (k) { return Number(sliceObj[k]) || 0; });
      drawSparkline(canvas, values, accentColor);
    });
  }

  // ── 18. Boot everything ───────────────────────────────────────────────────

  renderAll();
  initTableControls();
  initChartFullscreen();
  initKpiCopy();
  initSparklines();

})();
`
