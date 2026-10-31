// ─── Blog, quiz and events: the browser side ─────────────────────────────────
// One script, added to every page of a site that uses these sections, static or
// React. ForgeAI renders all the markup up front and this only shows, hides and
// sends it: clicks are handled once on the document, so sections a React route
// brings in later work without any wiring, and it never adds or removes nodes
// React owns (replies appear in an empty element the markup reserved for them).
//   [data-kit-engine=list]   filters, search, "show more", retiring past events
//   [data-kit-engine=quiz]   questions, scoring, the result
//   [data-kit-engine=tabs]   programme day tabs
//   [data-kit-engine=event]  "this event has ended"
//   [data-kit-engine=article] reading progress and the contents list
//   form[data-kit-post]      RSVP and quiz emails → the owner's Leads inbox

import { t } from './strings'

const SCRIPT = String.raw`(function(){
  if (window.__kitEngines) return; window.__kitEngines = 1;
  var POST = __POST__, UI = __UI__;
  function all(root, sel){ return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function today(){ var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  // React apps keep the route in the hash: #/rsvp?event=…
  function params(){ var h = location.hash.split('?')[1] || ''; return new URLSearchParams(location.search.slice(1) + (h ? '&' + h : '')); }

  // ── Lists: stories and events ──
  function drawList(l){
    var s = l.__kit, q = s.q.toLowerCase(), now = today(), shown = 0, anyPast = false, anyNext = false;
    all(l, '[data-kit-item]').forEach(function(it){
      var end = it.getAttribute('data-end'), past = !!end && end < now;
      if (past) anyPast = true; else anyNext = true;
      var fits = (s.past ? past : !past) && (!s.cat || it.getAttribute('data-cat') === s.cat) && (!q || (it.getAttribute('data-find') || '').toLowerCase().indexOf(q) > -1);
      if (fits) shown++;
      it.hidden = !fits || (s.size > 0 && shown > s.limit);
    });
    var none = l.querySelector('[data-kit-none]'); if (none) none.hidden = shown > 0;
    var more = l.querySelector('[data-kit-do="more"]'); if (more) more.hidden = !(s.size > 0 && shown > s.limit);
    var toggle = l.querySelector('[data-kit-do="past"]');
    if (toggle) { toggle.hidden = !anyPast; toggle.textContent = toggle.getAttribute(s.past ? 'data-kit-next' : 'data-kit-past'); }
    all(l, '[data-kit-chip]').forEach(function(c){ c.setAttribute('aria-pressed', c.getAttribute('data-kit-chip') === s.cat ? 'true' : 'false'); });
    return anyNext;
  }
  function setUpList(l){
    var p = params(), find = l.querySelector('[data-kit-find]'), cat = p.get('category') || p.get('topic') || '';
    var size = Number(l.getAttribute('data-kit-page-size')) || 0;
    // A topic whose stories did not make it onto the site has nothing to show
    all(l, '[data-kit-chip]').forEach(function(c){ var v = c.getAttribute('data-kit-chip'); if (v && !all(l, '[data-kit-item]').some(function(it){ return it.getAttribute('data-cat') === v; })) c.hidden = true; });
    l.__kit = { q: p.get('q') || '', cat: all(l, '[data-kit-chip]').some(function(c){ return c.getAttribute('data-kit-chip') === cat; }) ? cat : '', past: false, size: size, limit: size };
    if (find) { find.value = l.__kit.q; find.addEventListener('input', function(){ l.__kit.q = find.value; l.__kit.limit = size; drawList(l); }); }
    drawList(l);
  }

  // ── Quiz ──
  function fresh(){ return { i: -1, score: 0, counts: {}, result: '' }; }
  function bar(z, n){ var f = z.querySelector('.kit-quiz-fill'), total = Number(z.getAttribute('data-kit-total')) || 1; if (f) f.style.transform = 'scaleX(' + Math.min(1, n / total) + ')'; }
  function showQuestion(z, i){
    z.__kit.i = i;
    all(z, '.kit-quiz-start, .kit-quiz-result, [data-kit-capture]').forEach(function(el){ el.hidden = true; });
    all(z, '.kit-quiz-q').forEach(function(q){ q.hidden = Number(q.getAttribute('data-i')) !== i; });
    bar(z, i);
  }
  function resultFor(z){
    var s = z.__kit, kind = z.getAttribute('data-kit-kind'), list = all(z, '.kit-quiz-result'), best = null;
    if (kind === 'match') {
      var top = -1;
      list.forEach(function(r){ var n = s.counts[r.getAttribute('data-r')] || 0; if (n > top) { top = n; best = r; } });
      return best;
    }
    var bestMin = -Infinity;
    list.forEach(function(r){ var m = Number(r.getAttribute('data-min')) || 0; if (m <= s.score && m > bestMin) { bestMin = m; best = r; } });
    return best || list[0];
  }
  function reveal(z){
    var r = resultFor(z), kind = z.getAttribute('data-kit-kind');
    all(z, '.kit-quiz-q, [data-kit-capture]').forEach(function(el){ el.hidden = true; });
    if (!r) return;
    r.hidden = false; bar(z, Infinity);
    var sc = r.querySelector('[data-kit-score]');
    if (sc && kind === 'correct') sc.textContent = sc.getAttribute('data-kit-score').replace('{n}', z.__kit.score);
    var h = r.querySelector('h3'); if (h && h.focus) h.focus({ preventScroll: true });
    var box = z.getBoundingClientRect(); if (box.top < 0 || box.top > innerHeight * .6) z.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function resultWords(z){
    var r = resultFor(z), h = r && r.querySelector('h3'), kind = z.getAttribute('data-kit-kind');
    var score = kind === 'correct' ? z.__kit.score + '/' + z.getAttribute('data-kit-total') : '';
    return [score, h ? h.textContent : ''].filter(Boolean).join(' — ');
  }
  function finish(z){
    var cap = z.querySelector('[data-kit-capture]');
    if (!cap) return reveal(z);
    all(z, '.kit-quiz-q').forEach(function(q){ q.hidden = true; });
    cap.hidden = false; bar(z, Infinity);
    var input = cap.querySelector('input'); if (input) input.focus({ preventScroll: true });
  }
  function next(z){ var total = Number(z.getAttribute('data-kit-total')); if (z.__kit.i + 1 >= total) finish(z); else showQuestion(z, z.__kit.i + 1); }
  function pick(btn){
    var z = btn.closest('[data-kit-engine="quiz"]'), q = btn.closest('.kit-quiz-q'), kind = z.getAttribute('data-kit-kind'), opts = all(q, '.kit-quiz-opt');
    if (q.__kitDone) return; q.__kitDone = 1;
    var explain = q.querySelector('.kit-quiz-explain'), go = q.querySelector('.kit-quiz-next');
    if (kind === 'correct') {
      if (btn.hasAttribute('data-c')) z.__kit.score++; else btn.classList.add('is-wrong');
      opts.forEach(function(o){ if (o.hasAttribute('data-c')) o.classList.add('is-right'); o.disabled = true; });
    } else {
      btn.classList.add('is-picked');
      opts.forEach(function(o){ o.disabled = true; });
      if (kind === 'match') { var id = btn.getAttribute('data-r'); z.__kit.counts[id] = (z.__kit.counts[id] || 0) + 1; }
      else z.__kit.score += Number(btn.getAttribute('data-p')) || 0;
    }
    bar(z, z.__kit.i + 1);
    if (explain) explain.hidden = false;
    // Nothing to read after a personality answer: move straight on
    if (kind === 'correct' || explain) { go.hidden = false; go.focus({ preventScroll: true }); }
    else setTimeout(function(){ next(z); }, 320);
  }
  function retake(z){
    z.__kit = fresh();
    all(z, '.kit-quiz-q').forEach(function(q){ q.__kitDone = 0;
      all(q, '.kit-quiz-opt').forEach(function(o){ o.disabled = false; o.classList.remove('is-right', 'is-wrong', 'is-picked'); });
      all(q, '.kit-quiz-explain, .kit-quiz-next').forEach(function(el){ el.hidden = true; }); });
    showQuestion(z, 0);
  }

  // ── Replies → the Leads inbox ──
  function labelOf(el, form){
    var l = el.id ? form.querySelector('label[for="' + el.id + '"]') : null;
    return String((l && l.textContent) || el.getAttribute('aria-label') || el.name || 'Field').trim().slice(0, 80);
  }
  function rowsOf(form){
    var out = [];
    all(form, 'input, select, textarea').forEach(function(el){
      if (el.name === '_gotcha' || el.type === 'submit' || el.type === 'button') return;
      var v = String(el.value || '').trim(); if (!v) return;
      out.push([el.type === 'hidden' ? el.name : labelOf(el, form), v.slice(0, 2000), (el.type || '').toLowerCase(), String(el.name || '').slice(0, 60)]);
    });
    return out;
  }
  function send(form, extra){
    var hp = form.querySelector('[name=_gotcha]');
    return fetch(POST, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, keepalive: true, body: JSON.stringify({
      fields: rowsOf(form).concat(extra || []), page: location.pathname + location.hash.split('?')[0], form: form.getAttribute('data-kit-form-title') || 'Website form', hp: hp ? hp.value : '', ref: location.search.slice(0, 300),
    }) }).then(function(r){ if (!r.ok) { var e = new Error(String(r.status)); e.status = r.status; throw e; } });
  }
  document.addEventListener('submit', function(e){
    var form = e.target; if (!form || !form.matches || !form.matches('form[data-kit-post]')) return;
    e.preventDefault();
    var z = form.closest('[data-kit-engine="quiz"]');
    if (z) { // The result never waits on the network: the visitor has earned it
      send(form, [['Quiz result', resultWords(z) || 'Finished', 'text', 'quiz_result']]).catch(function(){});
      return reveal(z);
    }
    var btn = form.querySelector('[type=submit]'), label = btn ? btn.textContent : '', err = form.querySelector('[data-kit-error]');
    if (btn) { btn.disabled = true; btn.textContent = UI.sending; }
    if (err) err.hidden = true;
    send(form).then(function(){
      var ok = form.parentNode.querySelector('[data-kit-thanks]');
      form.hidden = true;
      if (ok) { ok.textContent = UI.thanks; ok.hidden = false; }
    }).catch(function(x){
      if (btn) { btn.disabled = false; btn.textContent = label; }
      if (err) { err.textContent = x && x.status === 400 ? UI.ask : UI.fail; err.hidden = false; }
    });
  });

  // ── Share ──
  function share(btn){
    var url = location.href, text = document.title;
    if (btn.getAttribute('data-kit-via') === 'whatsapp') { window.open('https://wa.me/?text=' + encodeURIComponent(text + ' ' + url), '_blank', 'noopener'); return; }
    var done = function(){ var old = btn.textContent; btn.textContent = btn.getAttribute('data-kit-done'); setTimeout(function(){ btn.textContent = old; }, 1800); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function(){ window.prompt('', url); });
    else window.prompt('', url);
  }

  // ── Clicks, in one place ──
  document.addEventListener('click', function(e){
    // "Take the quiz" in the opener — a plain #quiz would change the route in a hash-routed app
    var jump = e.target && e.target.closest ? e.target.closest('a[href="#quiz"]') : null;
    if (jump) { var box_ = document.querySelector('[data-kit-engine="quiz"]'); if (box_) { e.preventDefault(); box_.scrollIntoView({ behavior: 'smooth', block: 'center' }); } return; }
    var el = e.target && e.target.closest ? e.target.closest('[data-kit-do]') : null; if (!el) return;
    var what = el.getAttribute('data-kit-do'), l = el.closest('[data-kit-engine="list"]'), z = el.closest('[data-kit-engine="quiz"]');
    if (what === 'chip' && l) { l.__kit.cat = el.getAttribute('data-kit-chip'); l.__kit.limit = l.__kit.size; drawList(l); }
    else if (what === 'more' && l) { l.__kit.limit += l.__kit.size; drawList(l); }
    else if (what === 'past' && l) { l.__kit.past = !l.__kit.past; drawList(l); }
    else if (what === 'quiz-start' && z) showQuestion(z, 0);
    else if (what === 'quiz-pick') pick(el);
    else if (what === 'quiz-next' && z) next(z);
    else if (what === 'quiz-skip' && z) reveal(z);
    else if (what === 'quiz-retake' && z) retake(z);
    else if (what === 'share') share(el);
    else if (what === 'tab') {
      var box = el.closest('[data-kit-engine="tabs"]'), n = el.getAttribute('data-kit-tab');
      all(box, '[data-kit-tab]').forEach(function(b){ var on = b === el; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
      all(box, '[data-kit-panel]').forEach(function(p){ p.hidden = p.getAttribute('data-kit-panel') !== n; });
    }
    else if (what === 'jump') { // A plain #id link would change the route in a hash-routed app
      e.preventDefault();
      var to = document.getElementById(el.getAttribute('data-kit-to')); if (to) to.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // ── Reading progress and the contents list ──
  var ticking = 0;
  function readProgress(){
    ticking = 0;
    var a = document.querySelector('[data-kit-engine="article"]'), bar_ = document.querySelector('[data-kit-progress]');
    if (!a || !bar_) return;
    var box = a.getBoundingClientRect(), span = box.height - innerHeight;
    bar_.style.transform = 'scaleX(' + (span > 0 ? Math.max(0, Math.min(1, -box.top / span)) : 1) + ')';
    var links = all(a, '[data-kit-to]'), on = null;
    links.forEach(function(k){ var h = document.getElementById(k.getAttribute('data-kit-to')); if (h && h.getBoundingClientRect().top < innerHeight * .35) on = k; });
    links.forEach(function(k){ k.classList.toggle('is-on', k === on); });
  }
  addEventListener('scroll', function(){ if (!ticking) { ticking = 1; requestAnimationFrame(readProgress); } }, { passive: true });

  // ── Sections the page (or a React route) just brought in ──
  function scan(){
    var now = today();
    all(document, '[data-kit-engine="list"]').forEach(function(l){ if (!l.__kit) setUpList(l); });
    all(document, '[data-kit-engine="quiz"]').forEach(function(z){ if (z.__kit) return; z.__kit = fresh(); if (!z.querySelector('.kit-quiz-start')) z.__kit.i = 0; bar(z, 0); });
    all(document, '[data-kit-ended]').forEach(function(p){ if (p.__kit) return; p.__kit = 1; var over = p.getAttribute('data-kit-ended') < now; p.hidden = !over; });
    all(document, '[data-kit-until]').forEach(function(p){ if (p.__kit) return; p.__kit = 1; if (p.getAttribute('data-kit-until') < now) p.hidden = true; });
    all(document, 'form[data-kit-post]').forEach(function(form){
      if (form.__kit) return; form.__kit = 1;
      // Bots fill every field; people never see this one
      var hp = document.createElement('input'); hp.type = 'text'; hp.name = '_gotcha'; hp.tabIndex = -1; hp.autocomplete = 'off'; hp.setAttribute('aria-hidden', 'true');
      hp.style.cssText = 'position:absolute!important;width:1px!important;height:1px!important;padding:0!important;border:0!important;opacity:0!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;pointer-events:none!important'; form.appendChild(hp);
      var wanted = params().get('event'), sel = form.querySelector('select[name=event]');
      if (wanted && sel) for (var i = 0; i < sel.options.length; i++) if (sel.options[i].text === wanted) sel.selectedIndex = i;
    });
    readProgress();
  }
  var queued = 0;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  if (window.MutationObserver) new MutationObserver(function(){ if (!queued) { queued = 1; setTimeout(function(){ queued = 0; scan(); }, 60); } }).observe(document.documentElement, { childList: true, subtree: true });
})();`

export function enginesJs(endpoint: string, lang: string): string {
  const ui = { thanks: t(lang, 'thanks'), fail: t(lang, 'fail'), ask: t(lang, 'ask'), sending: t(lang, 'sending') }
  return SCRIPT.replace('__POST__', () => JSON.stringify(endpoint)).replace('__UI__', () => JSON.stringify(ui))
}

/** Pages rendered from a section that needs the script */
export const usesEngines = (code: string) => /\bdata-kit-engine=/.test(code)

/** A page (or a React app's index.html) on a site that uses these sections: the script, once */
export function applyEngineExtras(html: string, endpoint: string, lang: string): string {
  const tag = `<script data-kit-engines>${enginesJs(endpoint, lang)}</script>`
  if (/<script data-kit-engines>[\s\S]*?<\/script>/.test(html)) return html.replace(/<script data-kit-engines>[\s\S]*?<\/script>/, () => tag)
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, () => `${tag}\n</body>`) : `${html}\n${tag}`
}
