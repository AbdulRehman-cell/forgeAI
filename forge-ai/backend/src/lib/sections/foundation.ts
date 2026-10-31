// What every section shares: bands and their tones, the heading block, icon
// tiles, badges, check lists, form fields and the card surface variables.

export const FOUNDATION_CSS = `/* ── Sections: foundation ── */
.kit-section { padding-block: clamp(64px, 9vw, 112px); background: var(--bg); color: var(--text); position: relative; }
.kit-section.kit-alt { background: var(--surface); }
.kit-section.kit-dark { background: var(--ink); color: #fff; }
/* Dark bands re-scope the colour tokens, so every block inside reads light-on-dark */
.kit-section.kit-dark, .kit-stats, .kit-cta { --text: #ffffff; --muted: rgba(255,255,255,.72); --border: rgba(255,255,255,.12); --border-strong: rgba(255,255,255,.22); --bg: rgba(255,255,255,.04); --surface: rgba(255,255,255,.05); --surface-2: rgba(255,255,255,.08); --primary-ink: var(--accent-on-dark); --kit-card-bg: rgba(255,255,255,.05); --kit-card-border: 1px solid rgba(255,255,255,.1); --kit-card-shadow: none; }
.kit-dark :is(h2, h3, h4, strong, blockquote) { color: #fff; }
.kit-dark :is(p, li, small) { color: rgba(255,255,255,.76); }
.kit-dark .eyebrow { color: var(--accent-on-dark); }
/* Blocks never depend on the page's own .container rule for width and gutters */
:is(.kit-section, .kit-trust, .kit-logos, .kit-stats, .kit-cta, .kit-newsletter) > .container { width: 100%; max-width: var(--maxw, 1200px); margin-inline: auto; padding-inline: clamp(20px, 5vw, 40px); }
.kit-head { max-width: 720px; margin: 0 auto clamp(2.25rem, 4.5vw, 3.5rem); text-align: center; }
.kit-head > * { margin-inline: auto; }
.kit-head h2 { margin-top: .35rem; margin-bottom: .85rem; }
.kit-head p { color: var(--muted); font-size: clamp(1.02rem, 1.3vw, 1.15rem); line-height: 1.65; margin-bottom: 0; max-width: 60ch; }
.kit-dark .kit-head p { color: rgba(255,255,255,.72); }
.kit-head-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem 2rem; flex-wrap: wrap; margin-bottom: clamp(2rem, 4vw, 3rem); }
.kit-head-row .kit-head { margin: 0; text-align: left; }
.kit-head-row .kit-head > * { margin-inline: 0; }
.kit-icon { display: inline-grid; place-items: center; width: 48px; height: 48px; flex-shrink: 0; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--primary) 12%, transparent); color: var(--primary-ink); }
.kit-icon svg { width: 24px; height: 24px; }
.kit-dark .kit-icon { background: rgba(255,255,255,.08); color: var(--accent-on-dark); }
.kit-actions { display: flex; flex-wrap: wrap; gap: .8rem; align-items: center; }
/* Button baseline at zero specificity — only fills gaps the page's own CSS left */
:where(.btn) { display: inline-flex; align-items: center; justify-content: center; gap: .5rem; padding: .85rem 1.5rem; font-weight: 700; line-height: 1.1; border: 1.5px solid transparent; cursor: pointer; text-decoration: none; }
:where(.btn-secondary) { background: transparent; color: var(--text); border-color: var(--border-strong); }
.kit-badge { display: inline-flex; align-items: center; padding: .3rem .7rem; border-radius: 999px; font-size: .7rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; background: var(--primary); color: var(--on-primary); line-height: 1.3; }
.kit-checks { list-style: none; padding: 0; margin: 1.25rem 0 1.75rem; display: grid; gap: .7rem; }
.kit-checks > li { display: flex; gap: .7rem; align-items: flex-start; line-height: 1.5; }
.kit-checks > li::before { content: '✓'; flex-shrink: 0; display: inline-grid; place-items: center; width: 22px; height: 22px; margin-top: .05em; border-radius: 50%; background: color-mix(in srgb, var(--primary) 14%, transparent); color: var(--primary-ink); font-weight: 800; font-size: .75rem; }
.kit-dark .kit-checks > li::before { color: var(--accent-on-dark); }
.kit-field { display: grid; gap: .4rem; min-width: 0; }
.kit-field label { display: block; font-size: .85rem; font-weight: 600; color: var(--text); margin: 0; }
.kit-field :is(input, select, textarea) { width: 100%; min-height: 48px; padding: .7rem .9rem; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--bg); color: var(--text); font: inherit; }
.kit-field textarea { min-height: 120px; resize: vertical; }
.kit-field :is(input, select, textarea):focus { outline: none; border-color: var(--primary); box-shadow: var(--ring); }
.kit-sr { position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.kit-stars { color: var(--primary-ink); letter-spacing: .15em; font-size: .95rem; }
.kit-dark .kit-stars { color: var(--accent-on-dark); }
.kit-avatar { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background: var(--ink); color: #fff; font-weight: 700; font-size: .9rem; flex-shrink: 0; }
.kit-dark .kit-avatar { background: var(--primary); color: var(--on-primary); }
/* Source credits (Quran text, translator, reciter) — a quiet strip under the footer */
.kit-credits { margin: 0; padding: 14px clamp(20px, 5vw, 40px); text-align: center; font-size: .8125rem; line-height: 1.7; color: var(--muted); background: var(--bg); }
.kit-credits a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
/* The floating WhatsApp button must not sit on top of the credit at the end of the page */
body:has(.kit-wa) .kit-credits { padding-bottom: 92px; }
[data-kit-engine][hidden], [data-kit-engine] [hidden], [data-kit-thanks][hidden] { display: none !important; }
.kit-thanks { margin: 0; padding: 1rem 1.2rem; border-radius: var(--radius); background: color-mix(in srgb, var(--primary) 12%, var(--bg)); color: var(--text); font-weight: 600; }
`
