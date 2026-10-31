// ─── Quran sections: the browser side ───────────────────────────────────────
// One script, added to every page of a site that shows Quran text. It brings
// ForgeAI's Quran sections to life on static pages and in React apps alike
// (React renders the empty containers; this fills them, and a
// MutationObserver catches the ones a route change brings in):
//   [data-quran-reader]     the reader: surah picker, translation toggle, text
//                           size, recitation per ayah or play-all, bookmark,
//                           copy, share, and the place you stopped reading
//   [data-quran-bookmarks]  the verses a visitor saved
//   [data-quran-search]     search across the Arabic and the translation
//   [data-quran-filter]     the surah list's name/number filter
//   [data-quran-continue]   "Continue reading Al-Kahf 18:23"
//   [data-quran-daily]      picks today's verse from the verified ones on the page
// Text comes only from the site's own verified pack (quran/…), never from the page.
// Bookmarks and reading position stay on the visitor's device, per site.

import { quranUi } from './ui'
import { applyQuranCredits } from './pack'

// Lucide icons (ISC licence), drawn at the size of the text around them
const svg = (body: string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
const ICONS = {
  play: svg('<polygon points="6 3 20 12 6 21 6 3"/>'),
  pause: svg('<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>'),
  mark: svg('<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>'),
  copy: svg('<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
  share: svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>'),
  prev: svg('<path d="m15 18-6-6 6-6"/>'),
  next: svg('<path d="m9 18 6-6-6-6"/>'),
  x: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  book: svg('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>'),
}

const SCRIPT = String.raw`(function(){
  if (window.__kitQuran) return; window.__kitQuran = 1;
  var UI = __UI__, ICON = __ICONS__, AR = 'quran-uthmani';
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fill(s, n){ return String(s).replace('{n}', n); }
  function arNum(n){ return String(n).replace(/[0-9]/g, function(d){ return '٠١٢٣٤٥٦٧٨٩'.charAt(+d); }); }
  function latin(s){ return String(s).replace(/[٠-٩]/g, function(d){ return d.charCodeAt(0) - 0x660; }).replace(/[۰-۹]/g, function(d){ return d.charCodeAt(0) - 0x6f0; }); }
  // Many sites share one host (…/sites/<site>/), so each keeps its own bookmarks
  var KEY = 'kitQuran:' + ((location.pathname.match(/\/sites\/([^\/]+)/) || [0, ''])[1]) + ':';
  function load(k, d){ try { var v = JSON.parse(localStorage.getItem(KEY + k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v){ try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) {} }

  // ── The site's verified pack ──
  function base(){
    var s = document.querySelector('script[type="module"][src*="/assets/"]');
    return (s ? new URL('../', s.src).href : new URL('./', location.href).href) + 'quran/';
  }
  var cache = {};
  function json(path){
    if (!cache[path]) cache[path] = fetch(base() + path).then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function(e){ delete cache[path]; throw e; });
    return cache[path];
  }
  function meta(){ return json('surahs.json'); }
  function pad(n){ return ('00' + n).slice(-3); }
  function trId(m){ for (var i = 0; i < m.editions.length; i++) if (m.editions[i].kind === 'translation') return m.editions[i].id; return ''; }
  function surah(m, n){
    var tr = trId(m);
    return Promise.all([json(AR + '/' + pad(n) + '.json'), tr ? json(tr + '/' + pad(n) + '.json') : null])
      .then(function(r){ return { ar: r[0].verses, tr: r[1] ? r[1].verses : null }; });
  }
  function name(m, n){ var s = m.surahs[n - 1]; return UI.lang === 'en' ? s.name : s.ar; }
  function label(m, s, a){ return name(m, s) + ' ' + s + ':' + a; }

  // ── Addresses: static pages are files; a React app's routes may live in the hash ──
  function hashRouted(){ return location.hash.charAt(1) === '/'; }
  function query(){ var h = location.hash, i = h.indexOf('?'); return new URLSearchParams(hashRouted() && i >= 0 ? h.slice(i) : location.search); }
  function pageUrl(page, q){ return hashRouted() && page.charAt(0) === '/' ? '#' + page + q : page + q; }
  function setQuery(q){
    try {
      if (hashRouted()) { var h = location.hash, i = h.indexOf('?'); history.replaceState(history.state, '', location.pathname + location.search + (i >= 0 ? h.slice(0, i) : h) + q); }
      else history.replaceState(history.state, '', location.pathname + q);
    } catch (e) {}
  }
  function verseUrl(s, a){
    var q = '?s=' + s + '&a=' + a;
    return hashRouted() ? location.href.split('#')[0] + location.hash.split('?')[0] + q : location.href.split(/[?#]/)[0] + q;
  }

  function toast(msg){
    var t = document.querySelector('.kit-q-toast');
    if (!t) { t = document.createElement('div'); t.className = 'kit-q-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('is-on');
    clearTimeout(t.__t); t.__t = setTimeout(function(){ t.classList.remove('is-on'); }, 1800);
  }
  function copyText(s){
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(s);
    return new Promise(function(ok){ var t = document.createElement('textarea'); t.value = s; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) {} t.remove(); ok(); });
  }
  // The opening four words, cut from the ayah itself (95 and 97 carry an extra shadda)
  function splitBasmala(ar, bas){
    var w = ar.split(' ');
    if (!bas || w.length < 5) return null;
    var head = w.slice(0, 4).join(' ');
    return head.replace(/ّ/g, '') === bas.replace(/ّ/g, '') ? [head, ar.slice(head.length + 1)] : null;
  }
  function verseHtml(ar, tr, a){
    return '<p class="kit-q-ar" lang="ar" dir="rtl">' + esc(ar) + ' <span class="kit-ayah-num">' + arNum(a) + '</span></p>' + (tr != null ? '<p class="kit-q-tr">' + esc(tr) + '</p>' : '');
  }

  // ── Reader ──
  function reader(el){
    var audio = el.hasAttribute('data-quran-audio');
    var m = null, text = null, sNow = 0, opened = false, player = null, cur = 0, all = false;
    var scale = load('scale', 0), showTr = load('tr', true);
    el.innerHTML = '<p class="kit-q-status">' + esc(UI.loading) + '</p>';
    function fail(){ el.innerHTML = '<p class="kit-q-status">' + esc(UI.failed) + '</p>'; }
    function info(){ return m.surahs[sNow - 1]; }
    meta().then(function(mm){
      m = mm;
      var q = query(), last = load('last', null), asked = +latin(q.get('s') || '');
      open(asked || (last && last.s) || 1, +latin(q.get('a') || '') || (!asked && last ? last.a : 0));
    }).catch(fail);

    function open(s, a){
      s = Math.min(114, Math.max(1, s | 0));
      stop();
      el.setAttribute('aria-busy', 'true');
      surah(m, s).then(function(t){
        sNow = s; text = t; render(); el.removeAttribute('aria-busy');
        var q = query(); q.set('s', s); if (a > 1) q.set('a', a); else q.delete('a'); setQuery('?' + q.toString());
        var v = a > 1 && el.querySelector('#kq-' + a);
        if (v) {
          v.classList.add('is-target');
          // Again once the Quran face has loaded and the page has settled — both move the ayah
          var at = function(){ if (!moved) v.scrollIntoView({ block: 'center' }); }, moved = false;
          at();
          if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ setTimeout(at, 50); });
          if (document.readyState !== 'complete') window.addEventListener('load', function(){ setTimeout(at, 50); }, { once: true });
          setTimeout(function(){ at(); moved = true; }, 900);
          ['wheel', 'touchstart', 'keydown'].forEach(function(t){ window.addEventListener(t, function(){ moved = true; }, { once: true, passive: true }); });
        }
        else if (opened) el.scrollIntoView({ block: 'start' });
        opened = true;
      }).catch(fail);
    }
    function btn(act, icon, text, pressed){
      return '<button type="button" class="kit-q-act" data-act="' + act + '" aria-label="' + esc(text) + '" title="' + esc(text) + '"' + (pressed == null ? '' : ' aria-pressed="' + pressed + '"') + '>' + icon + '</button>';
    }
    function render(){
      var s = info(), marks = load('marks', []), opts = '', list = '';
      for (var i = 0; i < 114; i++) { var x = m.surahs[i]; opts += '<option value="' + x.n + '"' + (x.n === sNow ? ' selected' : '') + '>' + x.n + '. ' + esc(UI.lang === 'en' ? x.name + ' — ' + x.ar : x.ar) + '</option>'; }
      for (var a = 1; a <= s.ayahs; a++) {
        var ar = text.ar[a - 1], top = '', k = sNow + ':' + a, on = marks.indexOf(k) >= 0;
        // Tanzil's text opens ayah 1 with the Basmala; it is set on its own line, every letter unchanged
        var split = a === 1 && sNow !== 1 && sNow !== 9 ? splitBasmala(ar, m.basmala) : null;
        if (split) { top = '<p class="kit-q-basmala" lang="ar" dir="rtl">' + esc(split[0]) + '</p>'; ar = split[1]; }
        list += top + '<article class="kit-q-verse' + (on ? ' is-marked' : '') + '" id="kq-' + a + '" data-a="' + a + '">' + verseHtml(ar, text.tr ? text.tr[a - 1] : null, a)
          + '<div class="kit-q-acts"><span class="kit-q-ref">' + sNow + ':' + a + '</span>'
          + (audio ? btn('play', ICON.play, UI.play) : '') + btn('mark', ICON.mark, UI.bookmark, on) + btn('copy', ICON.copy, UI.copy) + btn('share', ICON.share, UI.share)
          + '</div></article>';
      }
      el.innerHTML = '<div class="kit-q-bar"><select class="kit-q-pick" data-act="pick" aria-label="' + esc(UI.surah) + '">' + opts + '</select><div class="kit-q-tools">'
        + (text.tr ? '<button type="button" class="kit-q-tool" data-act="tr" aria-pressed="' + showTr + '">' + esc(UI.translation) + '</button>' : '')
        + '<button type="button" class="kit-q-tool" data-act="smaller" dir="ltr" aria-label="' + esc(UI.smaller) + '" title="' + esc(UI.smaller) + '">A−</button>'
        + '<button type="button" class="kit-q-tool" data-act="bigger" dir="ltr" aria-label="' + esc(UI.bigger) + '" title="' + esc(UI.bigger) + '">A+</button>'
        + (audio ? '<button type="button" class="btn btn-primary kit-q-all" data-act="all"></button>' : '')
        + '</div></div>'
        // A div, not <header>: site stylesheets lay every <header> out as the top bar
        + '<div class="kit-q-head"><p class="kit-q-name-ar" lang="ar" dir="rtl">' + esc(s.ar) + '</p>' + (UI.lang === 'en' ? '<h2>' + esc(s.name) + '</h2>' : '')
        + '<p class="kit-q-meta">' + (UI.lang === 'en' ? esc(s.meaning) + ' · ' : '') + esc(s.type === 'Medinan' ? UI.medinan : UI.meccan) + ' · ' + esc(fill(UI.ayahs, s.ayahs)) + '</p></div>'
        + '<div class="kit-q-verses">' + list + '</div>'
        + '<nav class="kit-q-nav">' + (sNow > 1 ? '<button type="button" class="btn btn-secondary" data-act="prev">' + ICON.prev + '<span>' + esc(UI.prev) + '</span></button>' : '<span></span>')
        + (sNow < 114 ? '<button type="button" class="btn btn-secondary" data-act="next"><span>' + esc(UI.next) + '</span>' + ICON.next + '</button>' : '') + '</nav>';
      look(); paint();
    }
    function look(){ el.style.setProperty('--kq-scale', String(1 + scale * 0.12)); el.classList.toggle('kit-q-no-tr', !showTr); }

    // Recitation: one file per ayah; play-all moves on to the next
    function play(a, seq){
      if (!player) {
        player = new Audio(); player.preload = 'auto';
        player.addEventListener('ended', function(){ if (all && cur < info().ayahs && el.isConnected) play(cur + 1, true); else { all = false; cur = 0; paint(); } });
        player.addEventListener('pause', paint); player.addEventListener('play', paint);
        player.addEventListener('error', function(){ all = false; paint(); });
        player.addEventListener('timeupdate', function(){ if (!el.isConnected) player.pause(); });
      }
      all = seq; cur = a;
      player.src = m.reciters[0].audio.replace('{n}', info().start + a);
      var p = player.play(); if (p && p.catch) p.catch(function(){ all = false; paint(); });
      paint();
      if (seq) { var v = el.querySelector('#kq-' + a); if (v) v.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    }
    function stop(){ if (player) player.pause(); all = false; cur = 0; paint(); }
    function paint(){
      var on = !!(player && !player.paused), vs = el.querySelectorAll('.kit-q-verse');
      for (var i = 0; i < vs.length; i++) {
        var mine = cur === i + 1, b = vs[i].querySelector('[data-act="play"]');
        vs[i].classList.toggle('is-playing', mine && on);
        if (b) { b.innerHTML = mine && on ? ICON.pause : ICON.play; b.setAttribute('aria-label', mine && on ? UI.pause : UI.play); }
      }
      var ab = el.querySelector('[data-act="all"]');
      if (ab) ab.innerHTML = on && all ? ICON.pause + '<span>' + esc(UI.pause) + '</span>' : ICON.play + '<span>' + esc(UI.playAll) + '</span>';
    }

    function verseText(a){ return text.ar[a - 1] + (text.tr ? '\n' + text.tr[a - 1] : '') + '\n— ' + label(m, sNow, a); }
    el.addEventListener('click', function(e){
      var b = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!b || !el.contains(b) || !m) return;
      var act = b.getAttribute('data-act'), v = b.closest('.kit-q-verse'), a = v ? +v.getAttribute('data-a') : 0;
      if (act === 'prev') open(sNow - 1, 0);
      else if (act === 'next') open(sNow + 1, 0);
      else if (act === 'tr') { showTr = !showTr; save('tr', showTr); b.setAttribute('aria-pressed', showTr); look(); }
      else if (act === 'smaller' || act === 'bigger') { scale = Math.max(-2, Math.min(5, scale + (act === 'bigger' ? 1 : -1))); save('scale', scale); look(); }
      else if (act === 'all') { if (all && player && !player.paused) stop(); else play(cur && cur < info().ayahs ? cur : 1, true); }
      else if (act === 'play') { if (cur === a && player && !player.paused) player.pause(); else play(a, false); }
      else if (act === 'mark') {
        var k = sNow + ':' + a, marks = load('marks', []), i = marks.indexOf(k);
        if (i >= 0) marks.splice(i, 1); else marks.unshift(k);
        save('marks', marks.slice(0, 500));
        b.setAttribute('aria-pressed', i < 0); v.classList.toggle('is-marked', i < 0);
        toast(i < 0 ? UI.bookmarked : UI.removed);
      }
      else if (act === 'copy') copyText(verseText(a)).then(function(){ toast(UI.copied); });
      else if (act === 'share') {
        var url = verseUrl(sNow, a);
        if (navigator.share) navigator.share({ title: label(m, sNow, a), text: verseText(a), url: url }).catch(function(){});
        else copyText(verseText(a) + '\n' + url).then(function(){ toast(UI.copied); });
      }
    });
    el.addEventListener('change', function(e){ if (e.target.getAttribute('data-act') === 'pick') open(+e.target.value, 0); });

    // Where the visitor stopped: the first ayah still on screen
    var tick = 0;
    function track(){
      if (!el.isConnected) { window.removeEventListener('scroll', onScroll); return; }
      if (!sNow) return;
      var vs = el.querySelectorAll('.kit-q-verse');
      for (var i = 0; i < vs.length; i++) if (vs[i].getBoundingClientRect().bottom > 120) { save('last', { s: sNow, a: i + 1 }); return; }
    }
    function onScroll(){ if (!tick) tick = setTimeout(function(){ tick = 0; track(); }, 400); }
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ── Surah list: filter and "continue reading" ──
  function norm(s){
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ًͯ-ٰٟۖ-ۭـ'’ʿʾ\s-]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/[یى]/g, 'ي').replace(/ک/g, 'ك').replace(/[ہةۃ]/g, 'ه')
      .replace(/ee/g, 'i').replace(/oo/g, 'u').replace(/([aiu])\1+/g, '$1');
  }
  function filter(input){
    var box = input.closest('[data-kit]') || document, items = box.querySelectorAll('[data-find]'), none = box.querySelector('[data-quran-none]');
    input.addEventListener('input', function(){
      var raw = latin(input.value.trim()), q = norm(raw), digits = /^\d+$/.test(raw), shown = 0;
      for (var i = 0; i < items.length; i++) {
        var ok = !q || (digits ? items[i].getAttribute('data-n') === String(+raw) : norm(items[i].getAttribute('data-find')).indexOf(q) >= 0);
        items[i].hidden = !ok; if (ok) shown++;
      }
      if (none) none.hidden = shown > 0;
    });
  }
  function cont(el){
    var last = load('last', null);
    if (!last || !last.s) return;
    meta().then(function(m){
      el.innerHTML = '<a class="kit-q-continue" href="' + esc(pageUrl(el.getAttribute('data-reader') || 'reader.html', '?s=' + last.s + '&a=' + last.a)) + '">' + ICON.book + '<span>' + esc(UI.continueReading) + '</span><strong>' + esc(label(m, last.s, last.a)) + '</strong></a>';
      el.hidden = false;
    }).catch(function(){});
  }

  // ── Verse of the day: every candidate is already on the page, verified ──
  function daily(el){
    var items = el.querySelectorAll('[data-day]');
    if (items.length < 2) return;
    var d = new Date(), day = Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 864e5);
    for (var i = 0; i < items.length; i++) items[i].hidden = i !== day % items.length;
  }

  // ── Bookmarks ──
  function bookmarks(el){
    var page = el.getAttribute('data-reader') || 'reader.html';
    function draw(){
      var marks = load('marks', []);
      if (!marks.length) { el.innerHTML = '<p class="kit-q-empty">' + esc(UI.noBookmarks) + '</p>'; return; }
      el.innerHTML = '<p class="kit-q-status">' + esc(UI.loading) + '</p>';
      meta().then(function(m){
        var need = {};
        marks.forEach(function(k){ need[k.split(':')[0]] = 1; });
        return Promise.all(Object.keys(need).map(function(s){ return surah(m, +s).then(function(t){ need[s] = t; }); })).then(function(){
          var h = '';
          marks.forEach(function(k){
            var p = k.split(':'), s = +p[0], a = +p[1], t = need[s];
            if (!t || !t.ar[a - 1]) return;
            var href = esc(pageUrl(page, '?s=' + s + '&a=' + a));
            h += '<li class="kit-q-mark" data-k="' + esc(k) + '">' + verseHtml(t.ar[a - 1], t.tr ? t.tr[a - 1] : null, a)
              + '<div class="kit-q-acts"><a class="kit-q-ref" href="' + href + '">' + esc(label(m, s, a)) + '</a><a class="kit-q-link" href="' + href + '">' + esc(UI.read) + '</a>'
              + '<button type="button" class="kit-q-act" data-act="unmark" aria-label="' + esc(UI.remove) + '" title="' + esc(UI.remove) + '">' + ICON.x + '</button></div></li>';
          });
          el.innerHTML = '<p class="kit-q-note">' + esc(UI.savedHere) + '</p><ol class="kit-q-list">' + h + '</ol>';
        });
      }).catch(function(){ el.innerHTML = '<p class="kit-q-status">' + esc(UI.failed) + '</p>'; });
    }
    el.addEventListener('click', function(e){
      var b = e.target.closest ? e.target.closest('[data-act="unmark"]') : null;
      if (!b) return;
      var k = b.closest('[data-k]').getAttribute('data-k');
      save('marks', load('marks', []).filter(function(x){ return x !== k; }));
      draw();
    });
    draw();
  }

  // ── Search: the whole Quran, loaded once, then searched on the device ──
  var everything = null;
  function loadAll(m, progress){
    if (everything) return everything;
    everything = new Promise(function(resolve, reject){
      var got = [], done = 0, next = 1, running = 0;
      function pump(){
        while (running < 8 && next <= 114) (function(n){
          running++;
          surah(m, n).then(function(t){ got[n] = t; done++; running--; progress(done); if (done === 114) resolve(got); else pump(); },
            function(e){ everything = null; reject(e); });
        })(next++);
      }
      pump();
    });
    return everything;
  }
  function plainAr(s){
    return String(s).replace(/[ً-ٰٟۖ-ۭـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/[یى]/g, 'ي').replace(/ک/g, 'ك').replace(/[ہةۃ]/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ء/g, '');
  }
  function mark(text, q){
    var i = text.toLowerCase().indexOf(q.toLowerCase());
    return i < 0 ? esc(text) : esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  }
  function search(form){
    var input = form.querySelector('input'), out = (form.closest('[data-kit]') || form.parentNode).querySelector('[data-quran-results]');
    var page = form.getAttribute('data-reader') || 'reader.html';
    if (!input || !out) return;
    form.addEventListener('submit', function(e){ e.preventDefault(); run(input.value); }, true);
    function run(raw){
      var q = raw.trim(), ref = /^(\d{1,3})(?:\s*[:.]\s*(\d{1,3}))?$/.exec(latin(q));
      if (!q) return;
      if (ref && +ref[1] >= 1 && +ref[1] <= 114) { location.href = pageUrl(page, '?s=' + +ref[1] + (ref[2] ? '&a=' + +ref[2] : '')); return; }
      out.innerHTML = '<p class="kit-q-status" role="status">' + esc(fill(UI.searching, 0)) + '</p>';
      meta().then(function(m){
        return loadAll(m, function(n){ var s = out.querySelector('.kit-q-status'); if (s) s.textContent = fill(UI.searching, n); }).then(function(data){
          var arabic = /[؀-ۿ]/.test(q), nq = plainAr(q), lq = q.toLowerCase(), hits = [], total = 0;
          for (var s = 1; s <= 114; s++) for (var a = 1; a <= data[s].ar.length; a++) {
            var t = data[s], tr = t.tr ? t.tr[a - 1] : '';
            var hit = arabic ? plainAr(t.ar[a - 1]).indexOf(nq) >= 0 || plainAr(tr).indexOf(nq) >= 0 : tr.toLowerCase().indexOf(lq) >= 0;
            if (hit) { total++; if (hits.length < 50) hits.push([s, a]); }
          }
          if (!total) { out.innerHTML = '<p class="kit-q-empty">' + esc(UI.noResults) + '</p>'; return; }
          var h = '<p class="kit-q-count">' + esc(fill(UI.results, total)) + (total > hits.length ? ' ' + esc(fill(UI.firstResults, hits.length)) : '') + '</p><ol class="kit-q-list">';
          hits.forEach(function(r){
            var t = data[r[0]], href = esc(pageUrl(page, '?s=' + r[0] + '&a=' + r[1]));
            h += '<li><p class="kit-q-ar" lang="ar" dir="rtl">' + esc(t.ar[r[1] - 1]) + ' <span class="kit-ayah-num">' + arNum(r[1]) + '</span></p>'
              + (t.tr ? '<p class="kit-q-tr">' + (arabic ? esc(t.tr[r[1] - 1]) : mark(t.tr[r[1] - 1], q)) + '</p>' : '')
              + '<div class="kit-q-acts"><a class="kit-q-ref" href="' + href + '">' + esc(label(m, r[0], r[1])) + '</a><a class="kit-q-link" href="' + href + '">' + esc(UI.read) + '</a></div></li>';
          });
          out.innerHTML = h + '</ol>';
        });
      }).catch(function(){ out.innerHTML = '<p class="kit-q-status">' + esc(UI.failed) + '</p>'; });
    }
    var q0 = query().get('q');
    if (q0) { input.value = q0; run(q0); }
  }

  var PARTS = [['[data-quran-reader]', reader], ['[data-quran-bookmarks]', bookmarks], ['[data-quran-search]', search], ['[data-quran-filter]', filter], ['[data-quran-continue]', cont], ['[data-quran-daily]', daily]];
  function scan(){
    for (var i = 0; i < PARTS.length; i++) {
      var els = document.querySelectorAll(PARTS[i][0]);
      for (var j = 0; j < els.length; j++) if (!els[j].__kitQ) { els[j].__kitQ = 1; try { PARTS[i][1](els[j]); } catch (e) { if (window.console) console.error(e); } }
    }
  }
  var queued = 0;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  if (window.MutationObserver) new MutationObserver(function(){ if (!queued) { queued = 1; setTimeout(function(){ queued = 0; scan(); }, 60); } }).observe(document.documentElement, { childList: true, subtree: true });
})();`

/** The script for a site in this language */
export function quranClientJs(lang: string): string {
  return SCRIPT.replace('__UI__', () => JSON.stringify({ ...quranUi(lang), lang: lang === 'ur' || lang === 'ar' ? lang : 'en' })).replace('__ICONS__', () => JSON.stringify(ICONS))
}

/** A page (or a React app's index.html) that shows Quran text: the reader script once, and Tanzil's credit */
export function applyQuranExtras(html: string, lang: string, audio: boolean): string {
  let out = applyQuranCredits(html, lang, audio)
  const tag = `<script data-kit-quran>${quranClientJs(lang)}</script>`
  if (/<script data-kit-quran>[\s\S]*?<\/script>/.test(out)) out = out.replace(/<script data-kit-quran>[\s\S]*?<\/script>/, () => tag)
  else out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, () => `${tag}\n</body>`) : `${out}\n${tag}`
  return out
}
