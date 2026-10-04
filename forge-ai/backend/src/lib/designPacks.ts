// ─── ForgeAI Design Packs ──────────────────────────────────────────────────
// Pre-built, hand-crafted CSS design systems injected into every generated
// site BEFORE the AI writes its own CSS. The AI writes layout and brand
// customization on top — it never has to invent button styles from scratch.
//
// This is the same principle as Rottoways: fixed, professional component CSS
// that the AI can't mess up, so sites never look like AI slop.

export type PackName = 'clean' | 'bold' | 'dark'

// ─── Palette presets ─────────────────────────────────────────────────────────
// Client-selectable color schemes. When a user picks one, its cssVars string
// replaces the AI-generated PALETTE line in the design brief — giving them
// deterministic color control while the AI still invents vibe, fonts, and copy.
export interface PalettePreset {
  name: string
  emoji: string
  primaryColor: string  // for UI swatch
  bgColor: string       // for UI swatch
  isDark: boolean       // drives swatch text contrast
  cssVars: string       // full PALETTE line value injected into design brief
}

export const PALETTE_PRESETS: Record<string, PalettePreset> = {
  ember: {
    name: 'Ember', emoji: '🔥', primaryColor: '#e85d04', bgColor: '#ffffff', isDark: false,
    cssVars: '--bg #ffffff; --surface #f7f5f2; --surface-2 #edeae5; --text #18130f; --text-muted #6b6460; --primary #e85d04; --primary-hover #c44c00; --secondary #219ebc; --accent #ffb703; --border rgba(0,0,0,0.1)',
  },
  ocean: {
    name: 'Ocean', emoji: '🌊', primaryColor: '#0077b6', bgColor: '#ffffff', isDark: false,
    cssVars: '--bg #ffffff; --surface #f0f8ff; --surface-2 #ddf0fa; --text #03045e; --text-muted #4a6b80; --primary #0077b6; --primary-hover #005f8e; --secondary #00b4d8; --accent #48cae4; --border rgba(0,0,0,0.1)',
  },
  forest: {
    name: 'Forest', emoji: '🌿', primaryColor: '#2d6a4f', bgColor: '#f8faf9', isDark: false,
    cssVars: '--bg #f8faf9; --surface #eef5f1; --surface-2 #daeee4; --text #1b3a2e; --text-muted #4d7260; --primary #2d6a4f; --primary-hover #1e4d38; --secondary #52b788; --accent #95d5b2; --border rgba(0,0,0,0.1)',
  },
  plum: {
    name: 'Plum', emoji: '🍇', primaryColor: '#7c3aed', bgColor: '#ffffff', isDark: false,
    cssVars: '--bg #ffffff; --surface #f5f3ff; --surface-2 #ede9fe; --text #1e1b4b; --text-muted #6b7280; --primary #7c3aed; --primary-hover #6d28d9; --secondary #a78bfa; --accent #c4b5fd; --border rgba(0,0,0,0.1)',
  },
  rose: {
    name: 'Rose', emoji: '🌹', primaryColor: '#e63946', bgColor: '#fffaf9', isDark: false,
    cssVars: '--bg #fffaf9; --surface #fff0f0; --surface-2 #ffe2e2; --text #2d0a12; --text-muted #7a4d50; --primary #e63946; --primary-hover #c1121f; --secondary #ff758c; --accent #ffc2ca; --border rgba(0,0,0,0.1)',
  },
  slate: {
    name: 'Slate', emoji: '💎', primaryColor: '#4f46e5', bgColor: '#f8fafc', isDark: false,
    cssVars: '--bg #f8fafc; --surface #f1f5f9; --surface-2 #e2e8f0; --text #0f172a; --text-muted #64748b; --primary #4f46e5; --primary-hover #4338ca; --secondary #06b6d4; --accent #818cf8; --border rgba(0,0,0,0.1)',
  },
  midnight: {
    name: 'Midnight', emoji: '🌙', primaryColor: '#06b6d4', bgColor: '#0a0a0f', isDark: true,
    cssVars: '--bg #0a0a0f; --surface #13131c; --surface-2 #1c1c2a; --text #f0eef8; --text-muted #8888aa; --primary #06b6d4; --primary-hover #0891b2; --secondary #7c3aed; --accent #22d3ee; --border rgba(255,255,255,0.08)',
  },
  obsidian: {
    name: 'Obsidian', emoji: '⚡', primaryColor: '#f59e0b', bgColor: '#111111', isDark: true,
    cssVars: '--bg #111111; --surface #1a1a1a; --surface-2 #252525; --text #f5f5f5; --text-muted #999999; --primary #f59e0b; --primary-hover #d97706; --secondary #ef4444; --accent #fbbf24; --border rgba(255,255,255,0.08)',
  },
}

export const VALID_PALETTE_IDS = Object.keys(PALETTE_PRESETS)

// ─── Pack selection ─────────────────────────────────────────────────────────
// Reads the design brief to pick the right pack. Dark bg → dark pack.
// Bold/vivid/energy keywords → bold pack. Default → clean.
export function selectPack(designBrief: string): PackName {
  const brief = designBrief.toLowerCase()

  // Look for dark background color in palette line
  const bgMatch = brief.match(/--bg\s*[:#]?\s*(#[0-9a-f]{3,8}|rgba?\([^)]+\))/i)
  if (bgMatch) {
    const bg = bgMatch[1].trim()
    if (bg.startsWith('#')) {
      const hex = bg.replace('#', '')
      const r = parseInt(hex.substring(0, 2), 16) || 0
      const g = parseInt(hex.substring(2, 4), 16) || 0
      const b = parseInt(hex.substring(4, 6), 16) || 0
      const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255
      if (luminance < 0.25) return 'dark'
    }
  }

  // Bold/energy keywords in VIBE line
  const vibeLine = brief.match(/vibe\s*[:\-]\s*([^\n]+)/i)?.[1] ?? ''
  const boldKeywords = /bold|vivid|energetic|high.energy|dynamic|vibrant|intense|punchy|striking|powerful/i
  if (boldKeywords.test(vibeLine)) return 'bold'

  return 'clean'
}

// ─── System prompt note ─────────────────────────────────────────────────────
// Injected into every generation prompt so the AI uses pack classes rather
// than reinventing them.
export function getPackPromptNote(pack: PackName): string {
  const heroNote = pack === 'bold'
    ? `The BOLD pack hero is a DARK gradient background (deep navy/indigo) with vivid radial mesh glows — this is intentional. DO NOT override the hero background to white/light.`
    : pack === 'dark'
    ? `The DARK pack hero is on --bg (deep dark) with a radial primary glow — DO NOT make it white or grey.`
    : `The CLEAN pack hero is white with a subtle gradient mesh. DO NOT change it to a flat grey.`

  return `
FORGEAI DESIGN PACK (${pack.toUpperCase()}) IS ALREADY LOADED as the base CSS layer.
USE its classes and variables — never recreate what is already defined.

━━ CRITICAL — NEVER DO THESE (they produce "vibe-coded" output): ━━
• NEVER add border-style: dashed, border-style: dotted, or border: N px dashed/dotted to ANY nav link, nav button, or header anchor. The pack already sets nav a { border: none !important }. Any dashed nav border is the #1 vibe-coded tell.
• NEVER write border-style: dashed or dotted anywhere on the page — not on cards, not on buttons, not anywhere. It always looks amateur.
• NEVER override --bg, --surface, --text, or --primary in your stylesheet — set them ONCE in :root at the top. The pack reads from these vars everywhere.
• NEVER inline <style> blocks in HTML pages (static sites). All CSS goes in styles.css.
• ${heroNote}

━━ CSS VARIABLES (use var() — never hardcode the color): ━━
  --bg  --surface  --surface-2  --text  --text-muted
  --primary  --primary-hover  --secondary  --accent
  --border  --border-strong
  --radius  --radius-sm  --radius-lg  --radius-xl
  --shadow-sm  --shadow  --shadow-lg  --shadow-xl
  --font-display  --font-body
  --section-py  --content-width  --gutter

━━ COMPONENT CLASSES (already fully styled — just use them): ━━
  Buttons:      .btn-primary  .btn-secondary  .btn-ghost
  Cards:        .card  .feature-card  .card-white  .card-elevated  .card-glass (DARK only)
  Card icon:    .card-icon  .feature-icon  (inside .card)
  Nav:          nav or header — sticky + blur already applied; DO NOT add border to nav a links
  Layout:       .section (auto-alternates bg/surface)  .container  .container-narrow
  Section head: .section-head (centered intro block)  .section-label / .eyebrow
  Hero:         .hero  .hero-eyebrow  .hero-actions  .hero-bg (full-bleed photo img)
  CTA section:  .cta-section (gradient banner — use this for call-to-action blocks)
  Grids:        .grid-2  .grid-3  .grid-4  .features-grid
  Forms:        input, textarea, select — already styled (focus ring + surface bg)
  Badges:       .badge  .badge-primary  .badge-success  .badge-danger
  Stats:        .stat-value  .stat-label
  Testimonials: .testimonial  .testimonial-text  .testimonial-author  .testimonial-role
  Footer:       footer / .footer / .site-footer — already dark; .footer-grid  .footer-logo
  Animations:   .animate-in (and .animate-in-delay-1/2/3/4)
  Helpers:      .img-cover  .img-rounded  .img-shadow  .aspect-hero  .aspect-card
  Gallery:      .gallery-grid (auto-fill grid)  .gallery-item (4:3 card)  .gallery-overlay (hover bottom-fade)  .gallery-caption
                Structure: <div class="gallery-item"><img src="..." alt=""/><div class="gallery-overlay"><span>caption</span></div></div>
                ⚠️ NEVER add a flat dark overlay that covers the whole image — it makes photos look black. The .gallery-overlay is subtle & hover-only.
                ⚠️ Use even numbers of items (4, 6, 8) to fill the grid cleanly; if odd, give the last .gallery-item style="grid-column:span 2"
  Alerts:       .alert  .alert-success  .alert-error  .alert-info

━━ TEXT CONTRAST RULE: ━━
• On light backgrounds (var(--bg), var(--surface), any white/cream), use var(--text) or var(--text-muted) — NEVER white (#fff) or rgba(255,255,255,*).
• White text is ONLY safe inside: .hero, .hero-section, .cta-section, or a section with a confirmed dark background.
• Putting white text on a cream/light surface makes it invisible — this is a hard contrast failure.

━━ OVERRIDE RULE: ━━
Only override a pack variable when the DESIGN BRIEF demands it (e.g. brief says --primary is #6200ff → set that in :root at the very top of styles.css, before any other rules). For layout and brand-specific sections, write fresh CSS. For standard components (buttons, cards, nav, forms), use the pack classes and only layer brand-specific tweaks on top.`
}

// ─────────────────────────────────────────────────────────────────────────────
// PACK 1: CLEAN
// Editorial, white background, strong typography, orange accent.
// Default for most sites — retail, food, health, education, SaaS, portfolio.
// ─────────────────────────────────────────────────────────────────────────────
const CLEAN_PACK_CSS = `/* ═══ ForgeAI Design Pack: CLEAN — Professional Edition ═════════════════
   Lovable/Linear/Vercel-tier component system.
   Every element has depth, rhythm, and micro-interaction.
   Override ONLY what the brand brief demands. */

@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;0,9..144,800;1,9..144,700&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap');

:root {
  /* ── Palette (overridden by AI design brief :root) ── */
  --bg:           #ffffff;
  --surface:      #f8f7f4;
  --surface-2:    #f0ede8;
  --text:         #16120d;
  --text-muted:   #6b6460;
  --primary:      #e85d04;
  --primary-hover:#c44c00;
  --secondary:    #219ebc;
  --accent:       #ffb703;
  --border:       rgba(0,0,0,0.09);
  --border-strong:rgba(0,0,0,0.16);

  /* ── Geometry ── */
  --radius-xs: 4px;
  --radius-sm: 7px;
  --radius:    12px;
  --radius-lg: 20px;
  --radius-xl: 32px;

  /* ── Depth (light-optimised) ── */
  --shadow-sm:  0 1px 4px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.05);
  --shadow:     0 4px 16px -4px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06);
  --shadow-lg:  0 12px 40px -12px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.06);
  --shadow-xl:  0 24px 64px -16px rgba(0,0,0,0.22), 0 8px 24px rgba(0,0,0,0.08);

  /* ── Typography ── */
  --font-display: 'Fraunces', Georgia, 'Times New Roman', serif;
  --font-body:    'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  /* ── Layout ── */
  --section-py:    clamp(72px, 10vw, 120px);
  --content-width: 1120px;
  --content-narrow: 720px;
  --gutter:        clamp(20px, 5vw, 48px);
}

/* ── Reset ──────────────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
  font-family: var(--font-body);
  background: var(--bg);
  color: var(--text);
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  overflow-x: hidden;
}
img, video, svg { max-width: 100%; height: auto; display: block; }

/* ── Typography ──────────────────────────────────────────────────────────── */
h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-display);
  font-weight: 800;
  line-height: 1.08;
  letter-spacing: -0.035em;
  color: var(--text);
  text-wrap: balance;
}
h1 { font-size: clamp(2.5rem, 5.5vw, 4.5rem); }
h2 { font-size: clamp(1.75rem, 3.4vw, 2.8rem); letter-spacing: -0.03em; }
h3 { font-size: clamp(1.15rem, 2vw, 1.45rem); letter-spacing: -0.02em; }
h4 { font-size: 1.1rem; font-weight: 700; letter-spacing: -0.01em; }
p  { color: var(--text-muted); line-height: 1.72; }
a  { color: var(--primary); text-decoration: none; transition: opacity .15s; }
a:hover { opacity: .78; }
strong { color: var(--text); }
ul, ol { padding-left: 1.4em; }

/* ── Navigation (frosted glass, always readable) ─────────────────────────── */
nav, header, .site-header, .navbar, .nav {
  position: sticky;
  top: 0;
  z-index: 200;
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 0 var(--gutter);
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(18px) saturate(180%);
  -webkit-backdrop-filter: blur(18px) saturate(180%);
  border-bottom: 1px solid var(--border);
  transition: box-shadow .2s;
}
nav.scrolled, header.scrolled { box-shadow: var(--shadow-sm); }
.nav-logo, .logo, .brand, .site-logo {
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--text) !important;
  text-decoration: none !important;
  letter-spacing: -0.04em;
  white-space: nowrap;
  flex-shrink: 0;
}
.nav-links, .nav-menu {
  display: flex;
  align-items: center;
  gap: 2px;
  list-style: none;
  flex: 1;
  padding: 0;
}
.nav-links a, .nav-menu a, nav a:not(.nav-logo):not(.logo):not(.btn-primary) {
  color: var(--text-muted) !important;
  font-weight: 500;
  font-size: 0.9rem;
  padding: 6px 11px;
  border-radius: var(--radius-sm);
  transition: color .14s, background .14s;
  text-decoration: none !important;
}
.nav-links a:hover, .nav-menu a:hover,
nav a:not(.nav-logo):not(.logo):not(.btn-primary):hover,
.nav-links a.active, .nav-menu a.active { color: var(--text) !important; background: var(--surface-2); }
.nav-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

/* ── Buttons ─────────────────────────────────────────────────────────────── */
.btn-primary, a.btn-primary, button.btn-primary {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 12px 24px;
  background: var(--primary); color: #fff !important;
  font-family: var(--font-body); font-size: 0.9375rem; font-weight: 700; line-height: 1;
  border: 1.5px solid var(--primary); border-radius: var(--radius);
  cursor: pointer; white-space: nowrap; text-decoration: none !important;
  transition: background .15s, border-color .15s, transform .15s, box-shadow .15s;
  box-shadow: 0 2px 8px -2px color-mix(in srgb, var(--primary) 45%, transparent);
}
.btn-primary:hover, a.btn-primary:hover, button.btn-primary:hover {
  background: var(--primary-hover); border-color: var(--primary-hover);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px -6px color-mix(in srgb, var(--primary) 50%, transparent);
}
.btn-primary:active { transform: translateY(0); }

.btn-secondary, a.btn-secondary, button.btn-secondary {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 11px 22px;
  background: transparent; color: var(--text) !important;
  font-family: var(--font-body); font-size: 0.9375rem; font-weight: 600; line-height: 1;
  border: 1.5px solid var(--border-strong); border-radius: var(--radius);
  cursor: pointer; white-space: nowrap; text-decoration: none !important;
  transition: border-color .15s, background .15s, transform .15s, box-shadow .15s;
}
.btn-secondary:hover, a.btn-secondary:hover, button.btn-secondary:hover {
  background: var(--surface); border-color: color-mix(in srgb, var(--text) 28%, transparent);
  box-shadow: var(--shadow-sm); transform: translateY(-1px);
}

.btn-ghost, a.btn-ghost, button.btn-ghost {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 9px 16px; background: transparent; border: none;
  color: var(--text-muted) !important; font-family: var(--font-body);
  font-size: 0.9rem; font-weight: 500; cursor: pointer; text-decoration: none !important;
  border-radius: var(--radius-sm); transition: color .14s, background .14s;
}
.btn-ghost:hover, a.btn-ghost:hover, button.btn-ghost:hover {
  color: var(--text) !important; background: var(--surface-2);
}
button { cursor: pointer; }

/* ── Cards ───────────────────────────────────────────────────────────────── */
.card, .feature-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: clamp(22px,3vw,32px);
  transition: box-shadow .22s ease, transform .22s ease, border-color .22s ease;
  position: relative;
}
.card:hover, .feature-card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-4px);
  border-color: color-mix(in srgb, var(--primary) 22%, var(--border));
}
/* Card on a surface background */
.section-surface .card, .section-surface .feature-card { background: var(--bg); }
/* White card (default on surface sections) */
.card-white { background: #fff !important; }
.card-bordered { border-width: 2px; }
/* Elevated card with subtle gradient sheen */
.card-elevated {
  background: linear-gradient(145deg, var(--bg) 0%, color-mix(in srgb, var(--surface) 60%, var(--bg)) 100%);
  box-shadow: var(--shadow);
}
.card-elevated:hover { box-shadow: var(--shadow-xl); transform: translateY(-5px); }

/* Icon box inside a card */
.card-icon, .feature-icon {
  width: 48px; height: 48px; border-radius: var(--radius);
  background: color-mix(in srgb, var(--primary) 11%, transparent);
  color: var(--primary); font-size: 1.35rem;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 20px; flex-shrink: 0;
}

/* ── Layout primitives ───────────────────────────────────────────────────── */
.section {
  padding: var(--section-py) var(--gutter);
}
/* Alternating surface color — breaks visual monotony automatically */
.section:nth-child(even), .section-surface { background: var(--surface); }
.section:nth-child(odd), .section-white    { background: var(--bg); }

.section-sm  { padding: calc(var(--section-py) * .55) var(--gutter); }
.section-xs  { padding: calc(var(--section-py) * .35) var(--gutter); }

.container, .wrapper, .content-wrap {
  max-width: var(--content-width);
  margin-inline: auto;
  width: 100%;
}
.container-narrow { max-width: var(--content-narrow); margin-inline: auto; }

.section-head, .section-heading {
  text-align: center;
  max-width: 640px;
  margin-inline: auto;
  margin-bottom: clamp(40px, 6vw, 68px);
}
.section-label, .eyebrow {
  display: inline-block;
  font-size: 0.72rem; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--primary); margin-bottom: 14px;
}

/* ── Hero ────────────────────────────────────────────────────────────────── */
.hero, .hero-section {
  padding: clamp(100px, 16vw, 172px) var(--gutter) clamp(84px, 12vw, 140px);
  text-align: center;
  position: relative; overflow: hidden;
  background: var(--bg);
}
/* Gradient mesh glow in the background */
.hero::before, .hero-section::before {
  content: '';
  position: absolute; inset: -10% -5%; z-index: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 55% 50% at 25% 20%, color-mix(in srgb, var(--primary) 12%, transparent), transparent 70%),
    radial-gradient(ellipse 55% 50% at 78% 28%, color-mix(in srgb, var(--secondary) 10%, transparent), transparent 70%),
    radial-gradient(ellipse 40% 40% at 55% 75%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 70%);
  filter: blur(48px);
}
.hero > *, .hero-section > * { position: relative; z-index: 1; }
.hero-eyebrow {
  display: inline-flex; align-items: center; gap: 7px;
  background: var(--bg); border: 1.5px solid var(--border-strong);
  border-radius: 999px; padding: 6px 16px;
  font-size: 0.78rem; font-weight: 700; color: var(--primary);
  margin-bottom: 28px; letter-spacing: 0.02em;
  box-shadow: var(--shadow-sm);
}
.hero h1, .hero-section h1 {
  max-width: 900px; margin-inline: auto;
  font-size: clamp(2.6rem, 6vw, 5rem);
  letter-spacing: -0.04em; line-height: 1.04;
}
.hero p, .hero-sub, .hero-subtitle {
  max-width: 560px; margin: 20px auto 0;
  font-size: clamp(1.05rem, 1.6vw, 1.25rem);
  color: var(--text-muted); line-height: 1.68;
}
.hero-actions, .cta-group {
  display: flex; flex-wrap: wrap; gap: 12px;
  align-items: center; justify-content: center;
  margin-top: 40px;
}
/* Full-bleed photo hero */
.hero-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; border-radius: 0; }
.hero:has(.hero-bg)::after {
  content: ''; position: absolute; inset: 0; z-index: 0;
  background: linear-gradient(180deg, rgba(5,5,8,.52) 0%, rgba(5,5,8,.78) 100%);
}
.hero:has(.hero-bg) h1, .hero:has(.hero-bg) p,
.hero:has(.hero-bg) .hero-eyebrow, .hero:has(.hero-bg) .hero-sub { color: #fff !important; }

/* ── Grids ───────────────────────────────────────────────────────────────── */
.grid-2 { display: grid; gap: 28px; grid-template-columns: repeat(auto-fit, minmax(min(100%,320px),1fr)); }
.grid-3, .features-grid { display: grid; gap: 24px; grid-template-columns: repeat(auto-fit, minmax(min(100%,260px),1fr)); }
.grid-4 { display: grid; gap: 20px; grid-template-columns: repeat(auto-fit, minmax(min(100%,220px),1fr)); }

/* ── Forms ───────────────────────────────────────────────────────────────── */
.form-group { display: flex; flex-direction: column; gap: 7px; margin-bottom: 18px; }
label { font-size: 0.875rem; font-weight: 600; color: var(--text); }
input:not([type=”checkbox”]):not([type=”radio”]):not([type=”submit”]):not([type=”button”]):not([type=”range”]),
textarea, select {
  font-family: var(--font-body); font-size: 0.9375rem; width: 100%;
  padding: 11px 15px;
  background: var(--surface-2); border: 1.5px solid var(--border);
  border-radius: var(--radius); color: var(--text);
  transition: border-color .15s, box-shadow .15s, background .15s;
  outline: none; appearance: none;
}
input:hover:not(:focus), textarea:hover:not(:focus), select:hover:not(:focus) {
  border-color: color-mix(in srgb, var(--text) 22%, transparent);
}
input:focus, textarea:focus, select:focus {
  border-color: var(--primary); background: var(--bg);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 14%, transparent);
}
textarea { resize: vertical; min-height: 120px; }
::placeholder { color: var(--text-muted); opacity: .65; }

/* ── Badges ──────────────────────────────────────────────────────────────── */
.badge {
  display: inline-flex; align-items: center; gap: 5px;
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: 999px; padding: 4px 12px;
  font-size: 0.75rem; font-weight: 700; color: var(--text-muted);
}
.badge-primary {
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  border-color: color-mix(in srgb, var(--primary) 22%, transparent); color: var(--primary);
}
.badge-success { background: rgba(22,163,74,.1); border-color: rgba(22,163,74,.25); color: #16a34a; }
.badge-warn    { background: rgba(234,88,12,.1);  border-color: rgba(234,88,12,.25);  color: #ea580c; }
.badge-danger  { background: rgba(220,38,38,.1);  border-color: rgba(220,38,38,.25);  color: #dc2626; }

/* ── Stats ───────────────────────────────────────────────────────────────── */
.stat-value {
  font-family: var(--font-display); font-size: clamp(2rem,4vw,3rem);
  font-weight: 800; color: var(--primary); letter-spacing: -0.04em; line-height: 1;
  font-variant-numeric: tabular-nums;
}
.stat-label { font-size: 0.875rem; color: var(--text-muted); font-weight: 500; margin-top: 5px; }

/* ── Testimonials ────────────────────────────────────────────────────────── */
.testimonial {
  background: var(--bg); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 28px 32px;
  box-shadow: var(--shadow-sm);
}
.testimonial-text {
  font-size: 1.0rem; line-height: 1.72; color: var(--text);
  font-style: italic; margin-bottom: 22px;
}
.testimonial-text::before { content: '\\201C'; font-size: 2.5em; line-height: 0; vertical-align: -0.5em; color: var(--primary); opacity: .35; margin-right: 2px; }
.testimonial-author { font-weight: 700; color: var(--text); font-size: 0.9375rem; }
.testimonial-role   { color: var(--text-muted); font-size: 0.8125rem; margin-top: 3px; }
.testimonial-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; }

/* ── CTA / Banner section ────────────────────────────────────────────────── */
.cta-section, .cta-banner, .promo-section {
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--primary) 92%, #000),
    color-mix(in srgb, var(--secondary, #219ebc) 80%, var(--primary)));
  color: #fff; border-radius: var(--radius-xl);
  padding: clamp(56px, 9vw, 88px) var(--gutter);
  text-align: center; position: relative; overflow: hidden;
}
.cta-section::before {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(circle at 20% 50%, rgba(255,255,255,.12) 0%, transparent 60%),
              radial-gradient(circle at 80% 30%, rgba(255,255,255,.08) 0%, transparent 50%);
}
.cta-section > * { position: relative; z-index: 1; }
.cta-section h1, .cta-section h2, .cta-section h3 { color: #fff !important; }
.cta-section p { color: rgba(255,255,255,.82) !important; }
.cta-section .btn-secondary {
  background: rgba(255,255,255,.15) !important; border-color: rgba(255,255,255,.45) !important;
  color: #fff !important;
}
.cta-section .btn-secondary:hover {
  background: rgba(255,255,255,.25) !important; border-color: rgba(255,255,255,.7) !important;
}

/* ── Pricing ─────────────────────────────────────────────────────────────── */
.pricing-card {
  background: var(--bg); border: 1.5px solid var(--border);
  border-radius: var(--radius-lg); padding: 36px 32px; text-align: center;
  transition: box-shadow .22s, transform .22s, border-color .22s;
}
.pricing-card:hover { box-shadow: var(--shadow-lg); transform: translateY(-4px); }
.pricing-card.featured {
  background: var(--primary); border-color: var(--primary);
  box-shadow: 0 16px 48px -12px color-mix(in srgb, var(--primary) 55%, transparent);
}
.pricing-card.featured h2, .pricing-card.featured h3,
.pricing-card.featured .stat-value { color: #fff; }
.pricing-card.featured p, .pricing-card.featured .stat-label { color: rgba(255,255,255,.78); }
.pricing-card.featured .feature-list li { border-color: rgba(255,255,255,.12); color: rgba(255,255,255,.88); }
.pricing-card.featured .feature-list li::before { color: rgba(255,255,255,.9); }
.price {
  font-family: var(--font-display); font-size: clamp(2.5rem,5vw,3.5rem);
  font-weight: 800; letter-spacing: -0.06em; line-height: 1; font-variant-numeric: tabular-nums;
}
.price sup { font-size: 0.5em; vertical-align: super; }
.price-period { font-size: 0.875rem; color: var(--text-muted); font-weight: 500; }
.feature-list { list-style: none; padding: 0; text-align: left; }
.feature-list li {
  padding: 8px 0; border-bottom: 1px solid var(--border);
  font-size: 0.9rem; color: var(--text-muted);
  display: flex; align-items: center; gap: 8px;
}
.feature-list li::before { content: '✓'; color: var(--primary); font-weight: 800; flex-shrink: 0; }

/* ── Footer ──────────────────────────────────────────────────────────────── */
footer, .footer, .site-footer {
  background: #111;
  color: rgba(255,255,255,.58);
  padding: clamp(56px,8vw,96px) var(--gutter) 36px;
}
.footer-inner {
  max-width: var(--content-width); margin-inline: auto;
}
.footer-grid {
  display: grid; grid-template-columns: 2fr repeat(auto-fit, minmax(140px,1fr));
  gap: 40px; margin-bottom: 48px;
}
footer a, .footer a { color: rgba(255,255,255,.55); transition: color .14s; text-decoration: none; }
footer a:hover, .footer a:hover { color: rgba(255,255,255,.92); }
.footer-logo { color: #fff !important; font-family: var(--font-display); font-size: 1.15rem; font-weight: 800; letter-spacing: -0.03em; display: block; margin-bottom: 14px; }
.footer-desc { font-size: 0.875rem; line-height: 1.6; max-width: 280px; }
.footer-col-title { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,.4); margin-bottom: 16px; }
.footer-col-links { display: flex; flex-direction: column; gap: 10px; }
.footer-bottom {
  border-top: 1px solid rgba(255,255,255,.07);
  padding-top: 28px; max-width: var(--content-width); margin-inline: auto;
  font-size: 0.8125rem; display: flex; align-items: center;
  justify-content: space-between; flex-wrap: wrap; gap: 12px;
  color: rgba(255,255,255,.32);
}

/* ── Step / how-it-works ─────────────────────────────────────────────────── */
.step { text-align: center; padding: 24px; }
.step-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 48px; height: 48px; border-radius: 50%;
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  color: var(--primary); font-weight: 800; font-size: 1.1rem;
  margin-bottom: 18px; font-variant-numeric: tabular-nums;
}

/* ── Image helpers ───────────────────────────────────────────────────────── */
.img-cover { object-fit: cover; width: 100%; height: 100%; }
.img-rounded { border-radius: var(--radius-lg); }
.img-shadow { box-shadow: var(--shadow-xl); }
.aspect-hero { aspect-ratio: 16/7; overflow: hidden; border-radius: var(--radius-xl); }
.aspect-card { aspect-ratio: 4/3; overflow: hidden; border-radius: var(--radius-lg); }
.aspect-square { aspect-ratio: 1; overflow: hidden; border-radius: var(--radius-lg); }

/* ── Gallery grid ────────────────────────────────────────────────────────── */
/* Use this for photo grids — never write custom gallery CSS from scratch */
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
  gap: 16px;
}
/* Fill uneven rows: last item(s) stretch to fill the row */
.gallery-grid .gallery-item:last-child:nth-child(3n - 1) { grid-column: span 2; }
.gallery-item {
  position: relative; overflow: hidden; border-radius: var(--radius-lg);
  aspect-ratio: 4/3; cursor: pointer;
  background: var(--surface-2);
}
.gallery-item img {
  width: 100%; height: 100%; object-fit: cover; display: block;
  transition: transform .4s ease;
}
.gallery-item:hover img { transform: scale(1.04); }
/* Overlay: visible only on hover, max 40% opacity so images stay vivid */
.gallery-overlay, .gallery-item-overlay {
  position: absolute; inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.52) 0%, rgba(0,0,0,0) 55%);
  opacity: 0; transition: opacity .3s ease;
  display: flex; align-items: flex-end; padding: 18px;
}
.gallery-item:hover .gallery-overlay,
.gallery-item:hover .gallery-item-overlay { opacity: 1; }
.gallery-overlay p, .gallery-overlay span,
.gallery-item-overlay p, .gallery-item-overlay span {
  color: #fff; font-size: 0.875rem; font-weight: 600; margin: 0;
  text-shadow: 0 1px 4px rgba(0,0,0,0.4);
}
/* Always-visible caption variant */
.gallery-item.captioned .gallery-overlay,
.gallery-item.captioned .gallery-item-overlay {
  opacity: 1;
  background: linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 60%);
}

/* ── Dividers ────────────────────────────────────────────────────────────── */
.divider { height: 1px; background: var(--border); }
.divider-gradient { height: 1px; background: linear-gradient(90deg, transparent, var(--border-strong), transparent); }

/* ── Alert ───────────────────────────────────────────────────────────────── */
.alert { padding: 12px 16px; border-radius: var(--radius); border: 1px solid; font-size: 0.9rem; margin-bottom: 1rem; }
.alert-success { background: rgba(22,163,74,.1);  border-color: rgba(22,163,74,.25);  color: #16a34a; }
.alert-error   { background: rgba(220,38,38,.1);  border-color: rgba(220,38,38,.25);  color: #dc2626; }
.alert-info    { background: color-mix(in srgb, var(--primary) 8%, transparent); border-color: color-mix(in srgb, var(--primary) 25%, transparent); color: var(--primary); }
.alert-warning { background: rgba(234,88,12,.1);  border-color: rgba(234,88,12,.25);  color: #ea580c; }

/* ── Utility ─────────────────────────────────────────────────────────────── */
.text-center { text-align: center; }
.text-muted  { color: var(--text-muted); }
.text-primary { color: var(--primary); }
.flex { display: flex; }
.flex-col { flex-direction: column; }
.flex-wrap { flex-wrap: wrap; }
.items-center { align-items: center; }
.justify-between { justify-content: space-between; }
.justify-center { justify-content: center; }
.mt-auto { margin-top: auto; }
.gap-2 { gap: 8px; } .gap-3 { gap: 12px; } .gap-4 { gap: 16px; } .gap-6 { gap: 24px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }

/* ── Entrance animations ─────────────────────────────────────────────────── */
@keyframes fp-up { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
@keyframes fp-in { from { opacity: 0; } to { opacity: 1; } }
.animate-in { animation: fp-up .55s cubic-bezier(.22,1,.36,1) both; }
.animate-in-delay-1 { animation-delay: .08s; }
.animate-in-delay-2 { animation-delay: .16s; }
.animate-in-delay-3 { animation-delay: .24s; }
.animate-in-delay-4 { animation-delay: .32s; }

/* ── Responsive ──────────────────────────────────────────────────────────── */
@media (max-width: 900px) {
  .footer-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 768px) {
  :root { --gutter: 20px; }
  h1 { font-size: 2.3rem; }
  h2 { font-size: 1.65rem; }
  .hero { padding: 80px var(--gutter) 64px; }
  .section { padding: 60px var(--gutter); }
  nav, header, .site-header, .navbar { height: auto; min-height: 60px; padding: 14px var(--gutter); flex-wrap: wrap; }
  .nav-links, .nav-menu { display: none; }
  .grid-2, .grid-3, .grid-4, .features-grid { grid-template-columns: 1fr; }
  .cta-section { border-radius: var(--radius-lg); }
}
@media (max-width: 480px) {
  :root { --gutter: 16px; }
  .footer-grid { grid-template-columns: 1fr; }
  .pricing-card { padding: 28px 20px; }
  .hero-actions, .cta-group { flex-direction: column; align-items: stretch; }
  .hero-actions > *, .cta-group > * { width: 100%; justify-content: center; }
}
`

// ─────────────────────────────────────────────────────────────────────────────
// PACK 2: BOLD
// High-energy, vivid colors, strong typography. Sports, apps, brands.
// ─────────────────────────────────────────────────────────────────────────────
const BOLD_PACK_CSS = `/* ═══ ForgeAI Design Pack: BOLD — Professional Edition ═════════════════
   High-energy, vivid. Sports, apps, brands, startups.
   Use className= in React JSX — NEVER class=. */

@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:ital,wght@0,400;0,500;0,600;1,400&display=swap');

:root {
  --bg:           #ffffff;
  --surface:      #f5f4fa;
  --surface-2:    #ebebf5;
  --text:         #080814;
  --text-muted:   #5a5a78;
  --primary:      #6200ff;
  --primary-hover:#5000d6;
  --secondary:    #00c4ff;
  --accent:       #ff3c78;
  --border:       rgba(0,0,0,0.08);
  --border-strong:rgba(0,0,0,0.15);

  --radius-xs: 3px;
  --radius-sm: 6px;
  --radius:    10px;
  --radius-lg: 16px;
  --radius-xl: 24px;

  --shadow-sm: 0 2px 8px -2px rgba(98,0,255,0.1);
  --shadow:    0 8px 28px -6px rgba(98,0,255,0.18);
  --shadow-lg: 0 20px 60px -16px rgba(98,0,255,0.22);
  --shadow-xl: 0 32px 80px -20px rgba(98,0,255,0.28);

  --font-display: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-body:    'Inter', -apple-system, BlinkMacSystemFont, sans-serif;

  --section-py:    clamp(72px, 10vw, 128px);
  --content-width: 1140px;
  --gutter:        clamp(20px, 5vw, 48px);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
  font-family: var(--font-body);
  background: var(--bg); color: var(--text);
  line-height: 1.62; -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility; overflow-x: hidden;
}
img, video { max-width: 100%; height: auto; display: block; }

/* ── Typography ── */
h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-display); font-weight: 700;
  line-height: 1.06; letter-spacing: -0.04em; color: var(--text); text-wrap: balance;
}
h1 { font-size: clamp(2.6rem, 6vw, 5.2rem); }
h2 { font-size: clamp(1.8rem, 3.8vw, 3rem); letter-spacing: -0.035em; }
h3 { font-size: clamp(1.2rem, 2vw, 1.6rem); letter-spacing: -0.02em; }
h4 { font-size: 1.1rem; }
p  { color: var(--text-muted); line-height: 1.72; }
a  { color: var(--primary); text-decoration: none; transition: opacity .15s; }
a:hover { opacity: .82; }

/* ── Nav — border-style ALWAYS solid, kills AI dashed/dotted border bugs ── */
nav, header, .site-header, .navbar, .nav {
  position: sticky; top: 0; z-index: 200; height: 68px;
  display: flex; align-items: center; justify-content: space-between; gap: 24px;
  padding: 0 var(--gutter);
  background: color-mix(in srgb, var(--bg) 90%, transparent);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border-bottom: 1.5px solid var(--border);
  transition: box-shadow .2s;
}
.nav-logo, .logo, .brand, .site-logo {
  font-family: var(--font-display); font-size: 1.2rem; font-weight: 700;
  color: var(--text) !important; text-decoration: none !important; letter-spacing: -0.04em; flex-shrink: 0;
}
.nav-links, .nav-menu { display: flex; align-items: center; gap: 2px; list-style: none; flex: 1; padding: 0; }
/* Kill any AI-injected border/outline on nav links — solid only, never dashed/dotted */
nav a, .nav-links a, .nav-menu a, nav li a {
  color: var(--text-muted) !important; font-weight: 600; font-size: 0.875rem;
  padding: 7px 12px; border-radius: var(--radius-sm);
  border: none !important; outline: none;
  transition: color .14s, background .14s; text-decoration: none !important;
  letter-spacing: 0.01em; white-space: nowrap;
}
nav a:not(.btn-primary):not(.nav-logo):not(.logo):not(.brand) {
  border: none !important; border-style: solid !important;
}
nav a:hover, .nav-links a:hover, .nav-menu a:hover,
nav a.active, .nav-links a.active { color: var(--text) !important; background: var(--surface-2); }
.nav-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

/* ── Buttons ── */
.btn-primary, a.btn-primary, button.btn-primary {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 13px 26px; background: var(--primary); color: #fff !important;
  font-family: var(--font-display); font-size: 0.9375rem; font-weight: 700; line-height: 1;
  border: 2px solid var(--primary); border-radius: var(--radius); cursor: pointer;
  white-space: nowrap; text-decoration: none !important;
  transition: background .14s, transform .12s, box-shadow .14s;
  box-shadow: 0 6px 24px -4px color-mix(in srgb, var(--primary) 50%, transparent);
}
.btn-primary:hover, a.btn-primary:hover, button.btn-primary:hover {
  background: var(--primary-hover); border-color: var(--primary-hover);
  transform: translateY(-2px) scale(1.01);
  box-shadow: 0 12px 36px -6px color-mix(in srgb, var(--primary) 55%, transparent);
}
.btn-secondary, a.btn-secondary, button.btn-secondary {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 12px 24px; background: transparent; color: var(--text) !important;
  font-family: var(--font-display); font-size: 0.9375rem; font-weight: 600; line-height: 1;
  border: 2px solid var(--border-strong); border-radius: var(--radius); cursor: pointer;
  white-space: nowrap; text-decoration: none !important;
  transition: background .14s, border-color .14s, color .14s, box-shadow .14s;
}
.btn-secondary:hover, a.btn-secondary:hover, button.btn-secondary:hover {
  background: var(--text); border-color: var(--text); color: #fff !important;
  box-shadow: var(--shadow-sm);
}
.btn-ghost, a.btn-ghost, button.btn-ghost {
  display: inline-flex; align-items: center; gap: 7px; padding: 9px 14px;
  background: transparent; border: none; border-radius: var(--radius-sm);
  color: var(--text-muted) !important; font-family: var(--font-body);
  font-size: 0.9rem; font-weight: 500; cursor: pointer; text-decoration: none !important;
  transition: color .14s, background .14s;
}
.btn-ghost:hover, a.btn-ghost:hover { color: var(--text) !important; background: var(--surface-2); }
button { cursor: pointer; }

/* ── Cards ── */
.card, .feature-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: clamp(22px, 3vw, 30px);
  transition: box-shadow .22s ease, transform .22s ease, border-color .22s;
  position: relative; overflow: hidden;
}
.card:hover, .feature-card:hover {
  box-shadow: var(--shadow-lg); transform: translateY(-4px);
  border-color: color-mix(in srgb, var(--primary) 30%, transparent);
}
.card-white { background: #fff !important; }
.card-elevated { background: #fff; box-shadow: var(--shadow); }
.card-elevated:hover { box-shadow: var(--shadow-xl); transform: translateY(-5px); }
/* Gradient top-border accent on hover */
.card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, var(--primary), var(--secondary));
  opacity: 0; transition: opacity .22s;
}
.card:hover::before { opacity: 1; }
.card-icon, .feature-icon {
  width: 48px; height: 48px; border-radius: var(--radius);
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  color: var(--primary); font-size: 1.4rem;
  display: flex; align-items: center; justify-content: center; margin-bottom: 18px;
}

/* ── Layout ── */
.section { padding: var(--section-py) var(--gutter); }
.section:nth-child(even), .section-surface { background: var(--surface); }
.section:nth-child(odd), .section-white { background: var(--bg); }
.section-sm { padding: calc(var(--section-py) * .55) var(--gutter); }
.container, .wrapper, .content-wrap { max-width: var(--content-width); margin-inline: auto; width: 100%; }
.container-narrow { max-width: 720px; margin-inline: auto; }
.section-head, .section-heading { text-align: center; max-width: 640px; margin-inline: auto; margin-bottom: clamp(40px,6vw,68px); }
.section-label, .eyebrow {
  display: inline-block; font-size: 0.72rem; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--primary); margin-bottom: 14px;
}

/* ── Hero — dark gradient with vivid mesh glow ── */
.hero, .hero-section {
  padding: clamp(100px, 17vw, 180px) var(--gutter) clamp(80px, 12vw, 144px);
  text-align: center; position: relative; overflow: hidden;
  background: linear-gradient(170deg, #08081a 0%, #12082a 50%, #0a1428 100%);
  color: #fff;
}
.hero::before, .hero-section::before {
  content: ''; position: absolute; inset: -10% -5%; z-index: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 60% 55% at 30% 20%, color-mix(in srgb, var(--primary) 28%, transparent), transparent 65%),
    radial-gradient(ellipse 50% 45% at 75% 30%, color-mix(in srgb, var(--secondary) 22%, transparent), transparent 65%),
    radial-gradient(ellipse 40% 40% at 55% 80%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 65%);
  filter: blur(40px);
}
.hero > *, .hero-section > * { position: relative; z-index: 1; }
.hero h1, .hero-section h1 { color: #fff; max-width: 900px; margin-inline: auto; }
.hero p, .hero-sub, .hero-subtitle { color: rgba(255,255,255,.72) !important; max-width: 560px; margin: 20px auto 0; font-size: clamp(1.05rem,1.6vw,1.2rem); }
.hero-eyebrow {
  display: inline-flex; align-items: center; gap: 7px;
  background: color-mix(in srgb, var(--primary) 18%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 40%, transparent);
  border-radius: 999px; padding: 6px 18px;
  font-size: 0.78rem; font-weight: 700; color: color-mix(in srgb, var(--secondary) 90%, #fff);
  margin-bottom: 28px; letter-spacing: 0.06em; text-transform: uppercase;
}
.hero-actions, .cta-group {
  display: flex; flex-wrap: wrap; gap: 12px;
  align-items: center; justify-content: center; margin-top: 40px;
}
/* Override secondary button for dark hero */
.hero .btn-secondary, .hero-section .btn-secondary {
  border-color: rgba(255,255,255,.35) !important; color: #fff !important;
  background: rgba(255,255,255,.08) !important;
}
.hero .btn-secondary:hover, .hero-section .btn-secondary:hover {
  background: rgba(255,255,255,.18) !important; border-color: rgba(255,255,255,.6) !important;
}
/* Full-bleed photo hero */
.hero-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; border-radius: 0; }
.hero:has(.hero-bg)::after {
  content: ''; position: absolute; inset: 0; z-index: 0;
  background: linear-gradient(180deg, rgba(8,8,26,.6) 0%, rgba(8,8,26,.82) 100%);
}

/* ── Grids ── */
.grid-2 { display: grid; gap: 28px; grid-template-columns: repeat(auto-fit, minmax(min(100%,320px),1fr)); }
.grid-3, .features-grid { display: grid; gap: 24px; grid-template-columns: repeat(auto-fit, minmax(min(100%,260px),1fr)); }
.grid-4 { display: grid; gap: 20px; grid-template-columns: repeat(auto-fit, minmax(min(100%,220px),1fr)); }

/* ── Forms ── */
.form-group { display: flex; flex-direction: column; gap: 7px; margin-bottom: 18px; }
label { font-size: 0.875rem; font-weight: 600; color: var(--text); }
input:not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]):not([type="range"]),
textarea, select {
  font-family: var(--font-body); font-size: 0.9375rem; width: 100%;
  padding: 12px 15px; background: var(--surface-2); border: 2px solid var(--border);
  border-radius: var(--radius); color: var(--text);
  transition: border-color .15s, box-shadow .15s; outline: none; appearance: none;
}
input:focus, textarea:focus, select:focus {
  border-color: var(--primary); background: var(--bg);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
}
textarea { resize: vertical; min-height: 120px; }

/* ── Badges ── */
.badge {
  display: inline-flex; align-items: center; gap: 5px;
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 4px 10px;
  font-size: 0.73rem; font-weight: 700; color: var(--text-muted); letter-spacing: 0.04em;
}
.badge-primary {
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  border-color: color-mix(in srgb, var(--primary) 28%, transparent); color: var(--primary);
}
.badge-success { background: rgba(22,163,74,.1); border-color: rgba(22,163,74,.25); color: #16a34a; }
.badge-danger  { background: rgba(220,38,38,.1); border-color: rgba(220,38,38,.25); color: #dc2626; }

/* ── Stats ── */
.stat-value { font-family: var(--font-display); font-size: clamp(2rem,4vw,3.2rem); font-weight: 700; color: var(--primary); letter-spacing: -0.05em; line-height: 1; font-variant-numeric: tabular-nums; }
.stat-label { font-size: 0.875rem; color: var(--text-muted); font-weight: 500; margin-top: 5px; }

/* ── Testimonials ── */
.testimonial { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 28px 32px; box-shadow: var(--shadow-sm); }
.testimonial-text { font-size: 1rem; line-height: 1.72; color: var(--text); font-style: italic; margin-bottom: 22px; }
.testimonial-text::before { content: '\\201C'; font-size: 2.5em; line-height: 0; vertical-align: -0.5em; color: var(--primary); opacity: .35; margin-right: 2px; }
.testimonial-author { font-weight: 700; color: var(--text); font-size: 0.9375rem; }
.testimonial-role { color: var(--text-muted); font-size: 0.8125rem; margin-top: 3px; }
.testimonial-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; }

/* ── CTA section ── */
.cta-section, .cta-banner {
  background: linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--secondary) 70%, var(--primary)) 100%);
  color: #fff; border-radius: var(--radius-xl);
  padding: clamp(56px,9vw,88px) var(--gutter); text-align: center; position: relative; overflow: hidden;
}
.cta-section::before {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(circle at 15% 50%, rgba(255,255,255,.14) 0%, transparent 55%),
              radial-gradient(circle at 85% 30%, rgba(255,255,255,.09) 0%, transparent 50%);
}
.cta-section > * { position: relative; z-index: 1; }
.cta-section h1, .cta-section h2, .cta-section h3 { color: #fff !important; }
.cta-section p { color: rgba(255,255,255,.82) !important; }
.cta-section .btn-secondary {
  background: rgba(255,255,255,.14) !important; border-color: rgba(255,255,255,.45) !important; color: #fff !important;
}
.cta-section .btn-secondary:hover { background: rgba(255,255,255,.26) !important; }

/* ── Pricing ── */
.pricing-card { background: var(--bg); border: 1.5px solid var(--border); border-radius: var(--radius-lg); padding: 36px 32px; text-align: center; transition: box-shadow .22s, transform .22s; }
.pricing-card:hover { box-shadow: var(--shadow-lg); transform: translateY(-4px); }
.pricing-card.featured { background: var(--primary); border-color: var(--primary); box-shadow: 0 20px 60px -16px color-mix(in srgb, var(--primary) 55%, transparent); }
.pricing-card.featured h2, .pricing-card.featured h3 { color: #fff; }
.pricing-card.featured p { color: rgba(255,255,255,.78); }
.price { font-family: var(--font-display); font-size: clamp(2.5rem,5vw,3.5rem); font-weight: 700; letter-spacing: -0.06em; line-height: 1; font-variant-numeric: tabular-nums; }
.price sup { font-size: .5em; vertical-align: super; }
.feature-list { list-style: none; padding: 0; text-align: left; }
.feature-list li { padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 0.9rem; color: var(--text-muted); display: flex; align-items: center; gap: 8px; }
.feature-list li::before { content: '✓'; color: var(--primary); font-weight: 800; flex-shrink: 0; }

/* ── Footer ── */
footer, .footer, .site-footer { background: #0a0a14; color: rgba(255,255,255,.58); padding: clamp(56px,8vw,96px) var(--gutter) 36px; }
.footer-inner { max-width: var(--content-width); margin-inline: auto; }
.footer-grid { display: grid; grid-template-columns: 2fr repeat(auto-fit,minmax(140px,1fr)); gap: 40px; margin-bottom: 48px; }
footer a, .footer a { color: rgba(255,255,255,.55); transition: color .14s; text-decoration: none; }
footer a:hover, .footer a:hover { color: rgba(255,255,255,.92); }
.footer-logo { color: #fff !important; font-family: var(--font-display); font-size: 1.15rem; font-weight: 700; letter-spacing: -0.04em; display: block; margin-bottom: 12px; }
.footer-col-title { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,.38); margin-bottom: 14px; }
.footer-bottom { border-top: 1px solid rgba(255,255,255,.07); padding-top: 28px; max-width: var(--content-width); margin-inline: auto; font-size: 0.8125rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; color: rgba(255,255,255,.3); }

/* ── Image helpers ── */
.img-cover { object-fit: cover; width: 100%; height: 100%; }
.img-rounded { border-radius: var(--radius-lg); }
.img-shadow { box-shadow: var(--shadow-xl); }
.aspect-hero { aspect-ratio: 16/7; overflow: hidden; border-radius: var(--radius-xl); }
.aspect-card { aspect-ratio: 4/3; overflow: hidden; border-radius: var(--radius-lg); }
.aspect-square { aspect-ratio: 1; overflow: hidden; border-radius: var(--radius-lg); }

/* ── Gallery grid ── */
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
  gap: 16px;
}
.gallery-grid .gallery-item:last-child:nth-child(3n - 1) { grid-column: span 2; }
.gallery-item {
  position: relative; overflow: hidden; border-radius: var(--radius-lg);
  aspect-ratio: 4/3; cursor: pointer; background: var(--surface-2);
}
.gallery-item img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .4s ease; }
.gallery-item:hover img { transform: scale(1.04); }
.gallery-overlay, .gallery-item-overlay {
  position: absolute; inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.52) 0%, rgba(0,0,0,0) 55%);
  opacity: 0; transition: opacity .3s ease;
  display: flex; align-items: flex-end; padding: 18px;
}
.gallery-item:hover .gallery-overlay,
.gallery-item:hover .gallery-item-overlay { opacity: 1; }
.gallery-overlay p, .gallery-overlay span,
.gallery-item-overlay p, .gallery-item-overlay span { color: #fff; font-size: 0.875rem; font-weight: 600; margin: 0; }
.gallery-item.captioned .gallery-overlay,
.gallery-item.captioned .gallery-item-overlay { opacity: 1; background: linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 60%); }

/* ── Alerts ── */
.alert { padding: 12px 16px; border-radius: var(--radius); border: 1px solid; font-size: 0.9rem; margin-bottom: 1rem; }
.alert-success { background: rgba(22,163,74,.1); border-color: rgba(22,163,74,.25); color: #16a34a; }
.alert-error   { background: rgba(220,38,38,.1); border-color: rgba(220,38,38,.25); color: #dc2626; }
.alert-info    { background: color-mix(in srgb, var(--primary) 8%, transparent); border-color: color-mix(in srgb, var(--primary) 25%, transparent); color: var(--primary); }

/* ── Utility ── */
.text-center { text-align: center; } .text-muted { color: var(--text-muted); } .text-primary { color: var(--primary); }
.flex { display: flex; } .flex-col { flex-direction: column; } .flex-wrap { flex-wrap: wrap; }
.items-center { align-items: center; } .justify-between { justify-content: space-between; } .justify-center { justify-content: center; }
.gap-2 { gap: 8px; } .gap-3 { gap: 12px; } .gap-4 { gap: 16px; } .gap-6 { gap: 24px; }
.mt-auto { margin-top: auto; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
.divider { height: 1.5px; background: var(--border); }

/* ── Animations ── */
@keyframes fp-up { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
.animate-in { animation: fp-up .5s cubic-bezier(.22,1,.36,1) both; }
.animate-in-delay-1 { animation-delay: .08s; }
.animate-in-delay-2 { animation-delay: .16s; }
.animate-in-delay-3 { animation-delay: .24s; }
.animate-in-delay-4 { animation-delay: .32s; }

/* ── Responsive ── */
@media (max-width: 900px) { .footer-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 768px) {
  :root { --gutter: 20px; }
  h1 { font-size: 2.4rem; } h2 { font-size: 1.7rem; }
  .hero { padding: 80px var(--gutter) 64px; }
  .section { padding: 60px var(--gutter); }
  nav, header, .site-header, .navbar { height: auto; min-height: 60px; flex-wrap: wrap; padding: 14px var(--gutter); }
  .nav-links, .nav-menu { display: none; }
  .grid-2, .grid-3, .grid-4, .features-grid { grid-template-columns: 1fr; }
  .cta-section { border-radius: var(--radius-lg); }
}
@media (max-width: 480px) {
  :root { --gutter: 16px; }
  .footer-grid { grid-template-columns: 1fr; }
  .hero-actions, .cta-group { flex-direction: column; align-items: stretch; }
  .hero-actions > *, .cta-group > * { width: 100%; justify-content: center; }
}
`

// ─────────────────────────────────────────────────────────────────────────────
// PACK 3: DARK
// Dark bg, glow effects, premium. Gaming, crypto, tech, nightlife.
// ─────────────────────────────────────────────────────────────────────────────
const DARK_PACK_CSS = `/* ═══ ForgeAI Design Pack: DARK — Professional Edition ══════════════════
   Premium dark. Gaming, crypto, SaaS, tech, nightlife.
   Use className= in React JSX — NEVER class=. */

@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:ital,wght@0,400;0,500;0,600;1,400&display=swap');

:root {
  --bg:           #08080f;
  --surface:      #111120;
  --surface-2:    #1a1a2e;
  --text:         #ededf8;
  --text-muted:   #8585a8;
  --primary:      #7c3aed;
  --primary-hover:#6d28d9;
  --secondary:    #06b6d4;
  --accent:       #f59e0b;
  --border:       rgba(255,255,255,0.07);
  --border-strong:rgba(255,255,255,0.14);

  --radius-xs: 3px;
  --radius-sm: 6px;
  --radius:    10px;
  --radius-lg: 18px;
  --radius-xl: 28px;

  --shadow-sm: 0 2px 10px rgba(0,0,0,0.5);
  --shadow:    0 8px 32px -8px rgba(0,0,0,0.65);
  --shadow-lg: 0 24px 64px -20px rgba(0,0,0,0.75);
  --shadow-xl: 0 40px 90px -24px rgba(0,0,0,0.85);
  --glow:      0 0 40px -10px color-mix(in srgb, var(--primary) 45%, transparent);
  --glow-lg:   0 0 80px -15px color-mix(in srgb, var(--primary) 40%, transparent);

  --font-display: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-body:    'Inter', -apple-system, BlinkMacSystemFont, sans-serif;

  --section-py:    clamp(72px, 10vw, 128px);
  --content-width: 1120px;
  --gutter:        clamp(20px, 5vw, 48px);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; color-scheme: dark; }
body {
  font-family: var(--font-body); background: var(--bg); color: var(--text);
  line-height: 1.65; -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility; overflow-x: hidden;
}
img, video { max-width: 100%; height: auto; display: block; }

/* ── Typography ── */
h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-display); font-weight: 700;
  line-height: 1.08; letter-spacing: -0.03em; color: var(--text); text-wrap: balance;
}
h1 { font-size: clamp(2.4rem, 5.5vw, 4.8rem); }
h2 { font-size: clamp(1.7rem, 3.4vw, 2.8rem); }
h3 { font-size: clamp(1.15rem, 2vw, 1.5rem); }
h4 { font-size: 1.1rem; }
p  { color: var(--text-muted); line-height: 1.72; }
a  { color: var(--primary); text-decoration: none; transition: opacity .15s; }
a:hover { opacity: .82; }

/* ── Nav — kills AI-injected dashed/dotted borders ── */
nav, header, .site-header, .navbar, .nav {
  position: sticky; top: 0; z-index: 200; height: 68px;
  display: flex; align-items: center; justify-content: space-between; gap: 24px;
  padding: 0 var(--gutter);
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  border-bottom: 1px solid var(--border);
}
.nav-logo, .logo, .brand, .site-logo {
  font-family: var(--font-display); font-size: 1.2rem; font-weight: 700;
  color: var(--text) !important; text-decoration: none !important; letter-spacing: -0.03em; flex-shrink: 0;
}
.nav-links, .nav-menu { display: flex; align-items: center; gap: 2px; list-style: none; flex: 1; padding: 0; }
/* Force solid border-style — prevents AI from injecting dashed/dotted nav borders */
nav a, .nav-links a, .nav-menu a, nav li a {
  color: var(--text-muted) !important; font-weight: 500; font-size: 0.875rem;
  padding: 6px 11px; border-radius: var(--radius-sm);
  border: none !important; border-style: solid !important; outline: none;
  transition: color .14s, background .14s; text-decoration: none !important;
}
nav a:not(.btn-primary):not(.nav-logo):not(.logo):not(.brand) { border: none !important; }
nav a:hover, .nav-links a:hover, .nav-menu a:hover,
nav a.active, .nav-links a.active { color: var(--text) !important; background: var(--surface-2); }
.nav-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

/* ── Buttons ── */
.btn-primary, a.btn-primary, button.btn-primary {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 12px 24px; background: var(--primary); color: #fff !important;
  font-family: var(--font-display); font-size: 0.9375rem; font-weight: 700; line-height: 1;
  border: 1.5px solid var(--primary); border-radius: var(--radius); cursor: pointer;
  white-space: nowrap; text-decoration: none !important;
  transition: background .14s, transform .12s, box-shadow .14s;
  box-shadow: 0 4px 24px -6px color-mix(in srgb, var(--primary) 60%, transparent);
}
.btn-primary:hover, a.btn-primary:hover, button.btn-primary:hover {
  background: var(--primary-hover); border-color: var(--primary-hover);
  transform: translateY(-2px);
  box-shadow: 0 8px 40px -6px color-mix(in srgb, var(--primary) 65%, transparent), var(--glow);
}
.btn-secondary, a.btn-secondary, button.btn-secondary {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 11px 22px; background: transparent; color: var(--text) !important;
  font-family: var(--font-display); font-size: 0.9375rem; font-weight: 600; line-height: 1;
  border: 1.5px solid var(--border-strong); border-radius: var(--radius); cursor: pointer;
  white-space: nowrap; text-decoration: none !important;
  transition: border-color .14s, background .14s, box-shadow .14s;
}
.btn-secondary:hover, a.btn-secondary:hover, button.btn-secondary:hover {
  background: var(--surface); border-color: rgba(255,255,255,.22); box-shadow: var(--shadow-sm);
}
.btn-ghost, a.btn-ghost, button.btn-ghost {
  display: inline-flex; align-items: center; gap: 7px; padding: 9px 14px;
  background: transparent; border: none; border-radius: var(--radius-sm);
  color: var(--text-muted) !important; font-family: var(--font-body);
  font-size: 0.9rem; font-weight: 500; cursor: pointer; text-decoration: none !important;
  transition: color .14s, background .14s;
}
.btn-ghost:hover, a.btn-ghost:hover { color: var(--text) !important; background: var(--surface-2); }
button { cursor: pointer; }

/* ── Cards ── */
.card, .feature-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: clamp(22px, 3vw, 30px);
  transition: box-shadow .22s ease, transform .22s ease, border-color .22s; position: relative;
}
.card:hover, .feature-card:hover {
  box-shadow: var(--shadow), var(--glow); transform: translateY(-4px);
  border-color: color-mix(in srgb, var(--primary) 35%, transparent);
}
/* Glass card */
.card-glass {
  background: rgba(255,255,255,.035); backdrop-filter: blur(14px);
  border: 1px solid rgba(255,255,255,.09);
}
.card-glass:hover { border-color: color-mix(in srgb, var(--primary) 40%, transparent); box-shadow: var(--glow-lg); }
/* Elevated — darker surface */
.card-elevated { background: var(--surface-2); }
.card-icon, .feature-icon {
  width: 48px; height: 48px; border-radius: var(--radius);
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  color: var(--primary); font-size: 1.3rem;
  display: flex; align-items: center; justify-content: center; margin-bottom: 18px;
  box-shadow: 0 0 20px -6px color-mix(in srgb, var(--primary) 45%, transparent);
}

/* ── Layout ── */
.section { padding: var(--section-py) var(--gutter); }
/* Dark pack sections alternate between bg and surface */
.section:nth-child(even), .section-surface { background: var(--surface); }
.section:nth-child(odd)  { background: var(--bg); }
.section-sm { padding: calc(var(--section-py) * .55) var(--gutter); }
.container, .wrapper, .content-wrap { max-width: var(--content-width); margin-inline: auto; width: 100%; }
.container-narrow { max-width: 720px; margin-inline: auto; }
.section-head, .section-heading { text-align: center; max-width: 640px; margin-inline: auto; margin-bottom: clamp(40px,6vw,68px); }
.section-label, .eyebrow {
  display: inline-block; font-size: 0.72rem; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: color-mix(in srgb, var(--primary) 80%, #fff); margin-bottom: 14px;
}

/* ── Hero — deep dark with radial glow ── */
.hero, .hero-section {
  padding: clamp(100px, 17vw, 180px) var(--gutter) clamp(80px, 12vw, 144px);
  text-align: center; position: relative; overflow: hidden; background: var(--bg);
}
.hero::before, .hero-section::before {
  content: ''; position: absolute; inset: -15% -10%; z-index: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 55% 50% at 50% 10%, color-mix(in srgb, var(--primary) 22%, transparent), transparent 60%),
    radial-gradient(ellipse 45% 40% at 20% 60%, color-mix(in srgb, var(--secondary) 14%, transparent), transparent 60%),
    radial-gradient(ellipse 40% 35% at 80% 55%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 60%);
  filter: blur(44px);
}
.hero > *, .hero-section > * { position: relative; z-index: 1; }
.hero h1, .hero-section h1 { max-width: 900px; margin-inline: auto; color: var(--text); }
.hero p, .hero-sub, .hero-subtitle { max-width: 560px; margin: 20px auto 0; font-size: clamp(1.05rem,1.6vw,1.2rem); }
.hero-eyebrow {
  display: inline-flex; align-items: center; gap: 7px;
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 35%, transparent);
  border-radius: 999px; padding: 6px 16px;
  font-size: 0.78rem; font-weight: 700; color: color-mix(in srgb, var(--primary) 80%, #fff);
  margin-bottom: 28px; letter-spacing: 0.04em;
}
.hero-actions, .cta-group {
  display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: center; margin-top: 40px;
}
/* Full-bleed photo hero */
.hero-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; border-radius: 0; }
.hero:has(.hero-bg)::after {
  content: ''; position: absolute; inset: 0; z-index: 0;
  background: linear-gradient(180deg, rgba(8,8,15,.65) 0%, rgba(8,8,15,.88) 100%);
}

/* ── Grids ── */
.grid-2 { display: grid; gap: 28px; grid-template-columns: repeat(auto-fit,minmax(min(100%,320px),1fr)); }
.grid-3, .features-grid { display: grid; gap: 24px; grid-template-columns: repeat(auto-fit,minmax(min(100%,260px),1fr)); }
.grid-4 { display: grid; gap: 20px; grid-template-columns: repeat(auto-fit,minmax(min(100%,220px),1fr)); }

/* ── Forms ── */
.form-group { display: flex; flex-direction: column; gap: 7px; margin-bottom: 18px; }
label { font-size: 0.875rem; font-weight: 600; color: var(--text); }
input:not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]):not([type="range"]),
textarea, select {
  font-family: var(--font-body); font-size: 0.9375rem; width: 100%;
  padding: 12px 15px; background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--radius); color: var(--text);
  transition: border-color .15s, box-shadow .15s, background .15s; outline: none; appearance: none;
}
input:focus, textarea:focus, select:focus {
  border-color: var(--primary); background: var(--surface);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 20%, transparent);
}
textarea { resize: vertical; min-height: 120px; }
::placeholder { color: var(--text-muted); opacity: .55; }

/* ── Badges ── */
.badge {
  display: inline-flex; align-items: center; gap: 5px;
  background: var(--surface-2); border: 1px solid var(--border-strong);
  border-radius: 999px; padding: 4px 12px;
  font-size: 0.75rem; font-weight: 600; color: var(--text-muted);
}
.badge-primary {
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  border-color: color-mix(in srgb, var(--primary) 35%, transparent);
  color: color-mix(in srgb, var(--primary) 80%, #fff);
}

/* ── Stats ── */
.stat-value { font-family: var(--font-display); font-size: clamp(2rem,4vw,3rem); font-weight: 700; color: var(--primary); letter-spacing: -0.05em; line-height: 1; font-variant-numeric: tabular-nums; }
.stat-label { font-size: 0.875rem; color: var(--text-muted); font-weight: 500; margin-top: 5px; }

/* ── Testimonials ── */
.testimonial { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 28px 32px; }
.testimonial:hover { border-color: color-mix(in srgb, var(--primary) 28%, transparent); box-shadow: var(--glow); transition: border-color .22s, box-shadow .22s; }
.testimonial-text { font-size: 1rem; line-height: 1.72; color: var(--text); font-style: italic; margin-bottom: 22px; }
.testimonial-text::before { content: '\\201C'; font-size: 2.5em; line-height: 0; vertical-align: -0.5em; color: var(--primary); opacity: .45; margin-right: 2px; }
.testimonial-author { font-weight: 700; color: var(--text); font-size: 0.9375rem; }
.testimonial-role { color: var(--text-muted); font-size: 0.8125rem; margin-top: 3px; }
.testimonial-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; }

/* ── CTA section ── */
.cta-section, .cta-banner {
  background: linear-gradient(135deg, var(--surface-2) 0%, color-mix(in srgb, var(--primary) 18%, var(--surface-2)) 100%);
  border: 1px solid color-mix(in srgb, var(--primary) 28%, transparent);
  border-radius: var(--radius-xl); padding: clamp(56px,9vw,88px) var(--gutter);
  text-align: center; position: relative; overflow: hidden;
  box-shadow: var(--glow-lg);
}
.cta-section::before {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(circle at 20% 50%, color-mix(in srgb, var(--primary) 14%, transparent) 0%, transparent 60%),
              radial-gradient(circle at 80% 30%, color-mix(in srgb, var(--secondary) 10%, transparent) 0%, transparent 50%);
}
.cta-section > * { position: relative; z-index: 1; }

/* ── Pricing ── */
.pricing-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 36px 32px; text-align: center; transition: box-shadow .22s, transform .22s, border-color .22s; }
.pricing-card:hover { box-shadow: var(--shadow), var(--glow); transform: translateY(-4px); border-color: color-mix(in srgb, var(--primary) 30%, transparent); }
.pricing-card.featured { background: linear-gradient(145deg, var(--primary), color-mix(in srgb, var(--primary-hover) 80%, #000)); border-color: transparent; box-shadow: var(--shadow-xl), var(--glow-lg); }
.pricing-card.featured h2, .pricing-card.featured h3 { color: #fff !important; }
.pricing-card.featured p { color: rgba(255,255,255,.72) !important; }
.price { font-family: var(--font-display); font-size: clamp(2.5rem,5vw,3.5rem); font-weight: 700; letter-spacing: -0.06em; line-height: 1; font-variant-numeric: tabular-nums; }
.price sup { font-size: .5em; vertical-align: super; }
.feature-list { list-style: none; padding: 0; text-align: left; }
.feature-list li { padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 0.9rem; color: var(--text-muted); display: flex; align-items: center; gap: 8px; }
.feature-list li::before { content: '✓'; color: var(--primary); font-weight: 800; flex-shrink: 0; }

/* ── Footer ── */
footer, .footer, .site-footer { background: var(--surface); border-top: 1px solid var(--border); color: var(--text-muted); padding: clamp(56px,8vw,96px) var(--gutter) 36px; }
.footer-inner { max-width: var(--content-width); margin-inline: auto; }
.footer-grid { display: grid; grid-template-columns: 2fr repeat(auto-fit,minmax(140px,1fr)); gap: 40px; margin-bottom: 48px; }
footer a, .footer a { color: var(--text-muted); transition: color .14s; text-decoration: none; }
footer a:hover, .footer a:hover { color: var(--text); }
.footer-logo { color: var(--text) !important; font-family: var(--font-display); font-size: 1.15rem; font-weight: 700; letter-spacing: -0.03em; display: block; margin-bottom: 12px; }
.footer-col-title { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,.28); margin-bottom: 14px; }
.footer-bottom { border-top: 1px solid var(--border); padding-top: 28px; max-width: var(--content-width); margin-inline: auto; font-size: 0.8125rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }

/* ── Image helpers ── */
.img-cover { object-fit: cover; width: 100%; height: 100%; }
.img-rounded { border-radius: var(--radius-lg); }
.img-shadow { box-shadow: var(--shadow-xl); }
.aspect-hero { aspect-ratio: 16/7; overflow: hidden; border-radius: var(--radius-xl); }
.aspect-card { aspect-ratio: 4/3; overflow: hidden; border-radius: var(--radius-lg); }
.aspect-square { aspect-ratio: 1; overflow: hidden; border-radius: var(--radius-lg); }
.divider { height: 1px; background: var(--border); }

/* ── Gallery grid ── */
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
  gap: 16px;
}
.gallery-grid .gallery-item:last-child:nth-child(3n - 1) { grid-column: span 2; }
.gallery-item {
  position: relative; overflow: hidden; border-radius: var(--radius-lg);
  aspect-ratio: 4/3; cursor: pointer; background: rgba(255,255,255,.04);
}
.gallery-item img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .4s ease; }
.gallery-item:hover img { transform: scale(1.04); }
.gallery-overlay, .gallery-item-overlay {
  position: absolute; inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 55%);
  opacity: 0; transition: opacity .3s ease;
  display: flex; align-items: flex-end; padding: 18px;
}
.gallery-item:hover .gallery-overlay,
.gallery-item:hover .gallery-item-overlay { opacity: 1; }
.gallery-overlay p, .gallery-overlay span,
.gallery-item-overlay p, .gallery-item-overlay span { color: #fff; font-size: 0.875rem; font-weight: 600; margin: 0; }
.gallery-item.captioned .gallery-overlay,
.gallery-item.captioned .gallery-item-overlay { opacity: 1; background: linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 60%); }

/* ── Alerts ── */
.alert { padding: 12px 16px; border-radius: var(--radius); border: 1px solid; font-size: 0.9rem; margin-bottom: 1rem; }
.alert-success { background: rgba(22,163,74,.1); border-color: rgba(22,163,74,.25); color: #4ade80; }
.alert-error   { background: rgba(220,38,38,.1); border-color: rgba(220,38,38,.25); color: #f87171; }
.alert-info    { background: color-mix(in srgb, var(--primary) 10%, transparent); border-color: color-mix(in srgb, var(--primary) 28%, transparent); color: color-mix(in srgb, var(--primary) 80%, #fff); }

/* ── Utility ── */
.text-center { text-align: center; } .text-muted { color: var(--text-muted); } .text-primary { color: var(--primary); }
.flex { display: flex; } .flex-col { flex-direction: column; } .flex-wrap { flex-wrap: wrap; }
.items-center { align-items: center; } .justify-between { justify-content: space-between; } .justify-center { justify-content: center; }
.gap-2 { gap: 8px; } .gap-3 { gap: 12px; } .gap-4 { gap: 16px; } .gap-6 { gap: 24px; }
.mt-auto { margin-top: auto; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }

/* ── Animations ── */
@keyframes fp-up { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
@keyframes fp-glow-pulse { 0%,100% { box-shadow: var(--glow); } 50% { box-shadow: var(--glow-lg); } }
.animate-in { animation: fp-up 0.55s cubic-bezier(.22,1,.36,1) both; }
.animate-in-delay-1 { animation-delay: .08s; } .animate-in-delay-2 { animation-delay: .16s; }
.animate-in-delay-3 { animation-delay: .24s; } .animate-in-delay-4 { animation-delay: .32s; }
.glow-pulse { animation: fp-glow-pulse 3s ease-in-out infinite; }

/* ── Responsive ── */
@media (max-width: 900px) { .footer-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 768px) {
  :root { --gutter: 20px; }
  h1 { font-size: 2.2rem; } h2 { font-size: 1.6rem; }
  .hero { padding: 80px var(--gutter) 64px; }
  .section { padding: 60px var(--gutter); }
  nav, header, .site-header, .navbar { height: auto; min-height: 60px; flex-wrap: wrap; padding: 14px var(--gutter); }
  .nav-links, .nav-menu { display: none; }
  .grid-2, .grid-3, .grid-4, .features-grid { grid-template-columns: 1fr; }
  .cta-section { border-radius: var(--radius-lg); }
}
@media (max-width: 480px) {
  :root { --gutter: 16px; }
  .footer-grid { grid-template-columns: 1fr; }
  .hero-actions, .cta-group { flex-direction: column; align-items: stretch; }
  .hero-actions > *, .cta-group > * { width: 100%; justify-content: center; }
}
`

const PACKS: Record<PackName, string> = {
  clean: CLEAN_PACK_CSS,
  bold:  BOLD_PACK_CSS,
  dark:  DARK_PACK_CSS,
}

export function getPackCss(pack: PackName): string {
  return PACKS[pack]
}
