// ─── Site forms → Leads inbox ────────────────────────────────────────────────
// Static sites have no server of their own, so their contact, booking and
// newsletter forms used to show "thank you" and lose the message. Every static
// page now carries this script: it sends each message form to ForgeAI's public
// /site-forms endpoint, where it becomes a lead in the owner's Leads inbox.
// Navigation forms (search, "check availability" → another page) are left
// alone, and pages they lead to get their fields pre-filled from the URL.

import { publicApiBase } from './publicUrl'
import { t } from './sections/strings'

export const siteFormsEndpoint = (shareToken: string) => `${publicApiBase()}/site-forms/${encodeURIComponent(shareToken)}`

function siteFormsJs(endpoint: string, lang: string): string {
  return `(function(){
  if (window.__kitForms) return; window.__kitForms = 1;
  var URL_ = ${JSON.stringify(endpoint)};
  var THANKS = ${JSON.stringify(t(lang, 'thanks'))};
  var FAIL = ${JSON.stringify(t(lang, 'fail'))};
  var ASK = ${JSON.stringify(t(lang, 'ask'))};
  var SENDING = ${JSON.stringify(t(lang, 'sending'))};
  var SKIP = /^(submit|button|reset|image|file|password|hidden)$/i;
  var snap = typeof WeakMap === 'function' ? new WeakMap() : null;
  function clean(s){ return String(s || '').replace(/\\s+/g, ' ').replace(/[*:]+\\s*$/, '').trim(); }
  function labelOf(el, form){
    if (el.id) { var ls = form.querySelectorAll('label[for]'); for (var i = 0; i < ls.length; i++) if (ls[i].getAttribute('for') === el.id) return clean(ls[i].textContent); }
    var p = el.closest ? el.closest('label') : null;
    if (p) { var c = p.cloneNode(true); var inner = c.querySelectorAll('input,select,textarea'); for (var j = 0; j < inner.length; j++) inner[j].remove(); if (clean(c.textContent)) return clean(c.textContent); }
    return clean(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || el.id || 'Field');
  }
  function fieldsOf(form){ var out = [], all = form.querySelectorAll('input,select,textarea');
    for (var i = 0; i < all.length; i++) { var el = all[i]; if (!SKIP.test(el.type || '') && el.name !== '_gotcha') out.push(el); } return out; }
  // A message form saves what the visitor wrote; a navigation form opens another page with it
  function isMessage(form){
    if (form.hasAttribute('data-kit-form')) return true;
    if (form.getAttribute('role') === 'search' || form.querySelector('input[type=search]')) return false;
    var action = (form.getAttribute('action') || '').trim();
    if (action && action.charAt(0) !== '#' && !/^javascript:/i.test(action)) return false;
    var f = fieldsOf(form);
    if (!f.length) return false;
    if (f.length === 1 && /^(q|s|search|query|keywords?)$/i.test(f[0].name || '')) return false;
    return true;
  }
  function collect(form){
    var out = [], seen = {}, f = fieldsOf(form);
    for (var i = 0; i < f.length; i++) { var el = f[i], type = (el.type || el.tagName || '').toLowerCase();
      if (el.disabled || ((type === 'checkbox' || type === 'radio') && !el.checked)) continue;
      if (type === 'radio') { if (seen[el.name]) continue; seen[el.name] = 1; }
      var v = String(el.value || '').trim(); if (!v) continue;
      if (type === 'checkbox' && v === 'on') v = 'Yes';
      out.push([labelOf(el, form).slice(0, 80), v.slice(0, 2000), type, String(el.name || '').slice(0, 60)]); }
    return out;
  }
  function titleOf(form){ var up = form.parentElement, s = up && up.closest ? up.closest('section, aside, .hero-card') : null; var h = s ? s.querySelector('h1, h2, h3') : null;
    var b = form.querySelector('[type=submit], button:not([type])'); return clean((h && h.textContent) || (b && b.textContent) || 'Website form').slice(0, 120); }
  function note(form, text, ok){ var p = document.createElement('p'); p.className = 'kit-thanks'; p.setAttribute('role', ok ? 'status' : 'alert'); p.textContent = text;
    if (ok) form.replaceWith(p); else { var old = form.querySelector('.kit-thanks'); if (old) old.remove(); form.appendChild(p); } }
  document.addEventListener('submit', function(e){ var f = e.target; if (snap && f && f.tagName === 'FORM' && isMessage(f)) snap.set(f, collect(f)); }, true);
  document.addEventListener('submit', function(e){
    var form = e.target; if (!form || form.tagName !== 'FORM' || !isMessage(form)) return;
    if (!form.noValidate && form.checkValidity && !form.checkValidity()) return;
    // Read before the page's own handler could reset it
    var fields = (snap && snap.get(form)) || collect(form);
    if (!fields.length) { if (!e.defaultPrevented) { e.preventDefault(); note(form, ASK, false); } return; }
    var now = Date.now(); if (form.__kitSent && now - form.__kitSent < 4000) { e.preventDefault(); return; } form.__kitSent = now;
    var own = e.defaultPrevented; // the page's script already shows its own confirmation
    if (!own) e.preventDefault();
    var hp = form.querySelector('[name=_gotcha]');
    var body = JSON.stringify({ fields: fields, page: location.pathname, form: titleOf(form), hp: hp ? hp.value : '', ref: location.search.slice(0, 300) });
    var btn = form.querySelector('[type=submit], button:not([type])'), label = btn ? btn.textContent : '';
    if (!own && btn) { btn.disabled = true; btn.textContent = SENDING; }
    fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: body, keepalive: true })
      .then(function(r){ if (!r.ok) throw new Error(String(r.status)); if (!own) note(form, THANKS, true); })
      .catch(function(err){ form.__kitSent = 0; if (!own) { if (btn) { btn.disabled = false; btn.textContent = label; } note(form, /^400$/.test(err && err.message) ? ASK : FAIL, false); } });
  });
  function norm(s){ return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
  // Values a search or hero form carried here pre-fill this page's form — matched
  // loosely ("braces-clear-aligners" picks "Braces & Clear Aligners")
  function prefill(){
    if (!location.search) return;
    var params = new URLSearchParams(location.search), forms = document.querySelectorAll('form');
    for (var i = 0; i < forms.length; i++) { var form = forms[i]; if (!isMessage(form)) continue;
      var f = fieldsOf(form);
      for (var j = 0; j < f.length; j++) { var el = f[j], keys = [norm(el.name), norm(el.id), norm(labelOf(el, form))];
        params.forEach(function(v, k){ if (!v || keys.indexOf(norm(k)) < 0) return;
          if (el.tagName === 'SELECT') { for (var o = 0; o < el.options.length; o++) if (norm(el.options[o].value) === norm(v) || norm(el.options[o].text) === norm(v)) el.selectedIndex = o; }
          else if (!el.value && el.type !== 'checkbox' && el.type !== 'radio') el.value = v; }); } }
  }
  function setUp(){
    var forms = document.querySelectorAll('form');
    for (var i = 0; i < forms.length; i++) { var form = forms[i]; if (!isMessage(form)) continue;
      // Bots fill every field; people never see this one
      if (!form.querySelector('[name=_gotcha]')) { var t = document.createElement('input'); t.type = 'text'; t.name = '_gotcha'; t.tabIndex = -1; t.autocomplete = 'off'; t.setAttribute('aria-hidden', 'true');
        // Hidden in place, not pushed off-screen: a right-to-left page scrolls towards the left
        t.style.cssText = 'position:absolute!important;width:1px!important;height:1px!important;padding:0!important;border:0!important;opacity:0!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;clip-path:inset(50%)!important;pointer-events:none!important'; form.appendChild(t); } }
    prefill();
    // Again once the page's own scripts have run: one that sets a raw URL value on a <select> blanks it
    setTimeout(prefill, 80);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setUp); else setUp();
})();`
}

/** Adds the forms script to a static page (once; a new endpoint replaces the old). */
export function applySiteForms(html: string, endpoint: string): string {
  if (!/<form\b/i.test(html) && !/<\/body>/i.test(html)) return html
  // Messages in the page's own language (<html lang="ur"> → Urdu)
  const lang = /<html\b[^>]*\blang=["']?([a-z]{2,3})/i.exec(html)?.[1]?.toLowerCase() ?? 'en'
  const script = `<script data-kit-forms>${siteFormsJs(endpoint, lang)}</script>`
  if (/<script data-kit-forms>[\s\S]*?<\/script>/.test(html)) return html.replace(/<script data-kit-forms>[\s\S]*?<\/script>/, () => script)
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, () => `${script}\n</body>`) : `${html}\n${script}`
}
