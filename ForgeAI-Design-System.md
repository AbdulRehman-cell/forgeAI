# ForgeAI Design System
> Pre-built CSS packs + AI system prompt — the same system injected into every ForgeAI-generated site to eliminate AI slop.

---

## How It Works

1. **Pack CSS** is injected into every site as the base layer **before** the AI writes any CSS.
2. **System Prompt Note** tells the AI which classes already exist so it uses them instead of reinventing them.
3. **Palette Presets** let clients pick a color scheme that overrides the AI-generated palette.
4. The AI only writes layout, brand-specific sections, and content on top.

---

## System Prompt Note
> Injected into every file generation prompt (appended after the design brief)

```
FORGEAI DESIGN PACK (CLEAN / BOLD / DARK) IS ALREADY LOADED.
The following CSS variables and component classes are pre-defined and injected
as the base layer — USE them in your HTML. The AI must NOT redefine these
variables or recreate these classes.

AVAILABLE CSS VARIABLES (use var() — never hardcode the equivalent color):
  --bg, --surface, --surface-2, --text, --text-muted
  --primary, --primary-hover, --secondary, --accent, --border
  --radius, --radius-sm, --radius-lg, --shadow, --shadow-lg
  --font-display, --font-body
  --section-py, --content-width

AVAILABLE CLASSES (add these class names to your HTML elements):
  Buttons:      .btn-primary  .btn-secondary  .btn-ghost
  Cards:        .card  .card-white  .card-bordered
  Nav/Header:   nav or header — already sticky + blur, just add content
  Sections:     .section (handles padding)  .container (max-width + margin auto)
  Hero:         .hero  .hero-eyebrow
  Grids:        .grid-2  .grid-3 / .features-grid
  Forms:        input, textarea, select — already styled
  Badges:       .badge  .badge-primary
  Stats:        .stat-value  .stat-label
  Testimonials: .testimonial  .testimonial-text  .testimonial-author  .testimonial-role
  Footer:       footer — already dark-styled
  Animations:   .animate-in (fade-up entrance)

OVERRIDE RULE: Only override a pack variable/class when the design brief DEMANDS
it (e.g. brief says --primary is #6200ff — set that in :root). For layout and
brand-specific sections, write fresh CSS. For standard components (buttons,
cards, nav), USE the pack classes.
```

---

## Pack Selection Logic

```
if --bg luminance < 0.25  →  dark pack
if VIBE contains bold/vivid/energetic/dynamic/vibrant/punchy  →  bold pack
else  →  clean pack (default)
```

---

## Palette Presets
> Client picks one → its CSS vars replace the AI-generated PALETTE line in the design brief

| ID | Name | BG | Primary | Use for |
|----|------|----|---------|---------|
| `ember` | 🔥 Ember | `#ffffff` | `#e85d04` | Food, retail, energy brands |
| `ocean` | 🌊 Ocean | `#ffffff` | `#0077b6` | Tech, finance, healthcare |
| `forest` | 🌿 Forest | `#f8faf9` | `#2d6a4f` | Eco, wellness, outdoors |
| `plum` | 🍇 Plum | `#ffffff` | `#7c3aed` | Creative, SaaS, portfolio |
| `rose` | 🌹 Rose | `#fffaf9` | `#e63946` | Fashion, beauty, lifestyle |
| `slate` | 💎 Slate | `#f8fafc` | `#4f46e5` | Corporate, consulting, apps |
| `midnight` | 🌙 Midnight | `#0a0a0f` | `#06b6d4` | Tech, crypto, gaming |
| `obsidian` | ⚡ Obsidian | `#111111` | `#f59e0b` | Luxury, nightlife, premium |

### Full CSS Vars Per Preset

**ember**
```
--bg #ffffff; --surface #f7f5f2; --surface-2 #edeae5; --text #18130f;
--text-muted #6b6460; --primary #e85d04; --primary-hover #c44c00;
--secondary #219ebc; --accent #ffb703; --border rgba(0,0,0,0.1)
```

**ocean**
```
--bg #ffffff; --surface #f0f8ff; --surface-2 #ddf0fa; --text #03045e;
--text-muted #4a6b80; --primary #0077b6; --primary-hover #005f8e;
--secondary #00b4d8; --accent #48cae4; --border rgba(0,0,0,0.1)
```

**forest**
```
--bg #f8faf9; --surface #eef5f1; --surface-2 #daeee4; --text #1b3a2e;
--text-muted #4d7260; --primary #2d6a4f; --primary-hover #1e4d38;
--secondary #52b788; --accent #95d5b2; --border rgba(0,0,0,0.1)
```

**plum**
```
--bg #ffffff; --surface #f5f3ff; --surface-2 #ede9fe; --text #1e1b4b;
--text-muted #6b7280; --primary #7c3aed; --primary-hover #6d28d9;
--secondary #a78bfa; --accent #c4b5fd; --border rgba(0,0,0,0.1)
```

**rose**
```
--bg #fffaf9; --surface #fff0f0; --surface-2 #ffe2e2; --text #2d0a12;
--text-muted #7a4d50; --primary #e63946; --primary-hover #c1121f;
--secondary #ff758c; --accent #ffc2ca; --border rgba(0,0,0,0.1)
```

**slate**
```
--bg #f8fafc; --surface #f1f5f9; --surface-2 #e2e8f0; --text #0f172a;
--text-muted #64748b; --primary #4f46e5; --primary-hover #4338ca;
--secondary #06b6d4; --accent #818cf8; --border rgba(0,0,0,0.1)
```

**midnight**
```
--bg #0a0a0f; --surface #13131c; --surface-2 #1c1c2a; --text #f0eef8;
--text-muted #8888aa; --primary #06b6d4; --primary-hover #0891b2;
--secondary #7c3aed; --accent #22d3ee; --border rgba(255,255,255,0.08)
```

**obsidian**
```
--bg #111111; --surface #1a1a1a; --surface-2 #252525; --text #f5f5f5;
--text-muted #999999; --primary #f59e0b; --primary-hover #d97706;
--secondary #ef4444; --accent #fbbf24; --border rgba(255,255,255,0.08)
```

---

## Pack 1: CLEAN
> Default for most sites — retail, food, health, education, SaaS, portfolio.
> Fonts: Fraunces (display) + DM Sans (body)

```css
/* ═══ ForgeAI Design Pack: CLEAN ═══════════════════════════════════════
   Pre-built component system — use these classes and variables.
   Override only what the brand brief demands. */

@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,700;0,9..144,800;1,9..144,700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');

:root {
  --bg: #ffffff;
  --surface: #f7f5f2;
  --surface-2: #edeae5;
  --text: #18130f;
  --text-muted: #6b6460;
  --primary: #e85d04;
  --primary-hover: #c44c00;
  --secondary: #219ebc;
  --accent: #ffb703;
  --border: rgba(0,0,0,0.1);
  --radius-sm: 6px;
  --radius: 10px;
  --radius-lg: 18px;
  --radius-xl: 28px;
  --shadow-sm: 0 2px 8px -2px rgba(0,0,0,0.1);
  --shadow: 0 6px 24px -6px rgba(0,0,0,0.14);
  --shadow-lg: 0 16px 48px -16px rgba(0,0,0,0.18);
  --font-display: 'Fraunces', Georgia, serif;
  --font-body: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --section-py: clamp(72px,10vw,128px);
  --content-width: 1120px;
}

/* ── Reset ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; font-size: 16px; }
body {
  font-family: var(--font-body);
  background: var(--bg);
  color: var(--text);
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}

/* ── Typography ── */
h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-display);
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.03em;
  color: var(--text);
}
h1 { font-size: clamp(2.4rem, 5.5vw, 4.5rem); }
h2 { font-size: clamp(1.7rem, 3.4vw, 2.8rem); }
h3 { font-size: clamp(1.2rem, 2vw, 1.5rem); }
h4 { font-size: 1.15rem; }
p  { color: var(--text-muted); line-height: 1.7; }
a  { color: var(--primary); text-decoration: none; transition: opacity .15s; }
a:hover { opacity: .8; }
ul, ol { padding-left: 1.4em; }
img { max-width: 100%; height: auto; display: block; }

/* ── Buttons ── */
.btn-primary, a.btn-primary, button.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 13px 26px;
  background: var(--primary);
  color: #fff !important;
  font-family: var(--font-body);
  font-size: 0.9375rem;
  font-weight: 700;
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  transition: background .15s, transform .15s, box-shadow .15s;
  text-decoration: none !important;
  box-shadow: 0 4px 18px -4px color-mix(in srgb, var(--primary) 55%, transparent);
  white-space: nowrap;
  line-height: 1;
}
.btn-primary:hover {
  background: var(--primary-hover);
  transform: translateY(-2px);
  box-shadow: 0 8px 28px -4px color-mix(in srgb, var(--primary) 50%, transparent);
}
.btn-secondary, a.btn-secondary, button.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: transparent;
  color: var(--text) !important;
  font-family: var(--font-body);
  font-size: 0.9375rem;
  font-weight: 600;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: border-color .15s, background .15s, transform .15s;
  text-decoration: none !important;
  white-space: nowrap;
  line-height: 1;
}
.btn-secondary:hover {
  background: var(--surface);
  border-color: color-mix(in srgb, var(--text) 30%, transparent);
  transform: translateY(-1px);
}
.btn-ghost, a.btn-ghost, button.btn-ghost {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-family: var(--font-body);
  font-size: 0.9375rem;
  font-weight: 500;
  padding: 8px 14px;
  cursor: pointer;
  transition: color .15s;
  text-decoration: none;
}
.btn-ghost:hover { color: var(--text); }

/* ── Cards ── */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 28px;
  transition: box-shadow .22s ease, transform .22s ease;
}
.card:hover {
  box-shadow: var(--shadow);
  transform: translateY(-3px);
}
.card-white { background: #fff; }
.card-bordered { border: 2px solid var(--border); }
.card-icon {
  width: 48px; height: 48px;
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  border-radius: var(--radius);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 18px;
  color: var(--primary);
  font-size: 1.3rem;
}

/* ── Navigation ── */
nav, header.site-header, .site-header, .navbar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(255,255,255,0.88);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border);
  padding: 0 clamp(16px,4vw,40px);
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}
.nav-logo, .logo, .brand {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--text) !important;
  text-decoration: none;
  letter-spacing: -0.04em;
  white-space: nowrap;
}
.nav-links, .nav-menu, nav ul {
  display: flex;
  align-items: center;
  gap: 6px;
  list-style: none;
  padding: 0;
}
.nav-links a, .nav-menu a, nav ul a {
  color: var(--text-muted) !important;
  font-weight: 500;
  font-size: 0.9rem;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  transition: color .15s, background .15s;
  text-decoration: none !important;
}
.nav-links a:hover, .nav-menu a:hover, nav ul a:hover {
  color: var(--text) !important;
  background: var(--surface);
}

/* ── Layout ── */
.section { padding: var(--section-py) clamp(16px,4vw,40px); }
.section-sm { padding: calc(var(--section-py) * .6) clamp(16px,4vw,40px); }
.container, .wrapper, .content-wrap {
  max-width: var(--content-width);
  margin-left: auto;
  margin-right: auto;
  width: 100%;
}
.section-heading { margin-bottom: clamp(40px,6vw,72px); }
.section-label {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--primary);
  margin-bottom: 14px;
}

/* ── Hero ── */
.hero {
  padding: clamp(96px,16vw,176px) clamp(16px,4vw,40px) clamp(80px,12vw,144px);
  background: var(--surface);
  position: relative;
  overflow: hidden;
}
.hero-center { text-align: center; }
.hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 6px 16px;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--primary);
  margin-bottom: 28px;
  letter-spacing: 0.01em;
}
.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-top: 36px;
}
.hero-actions.centered { justify-content: center; }

/* ── Grids ── */
.grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%,320px),1fr)); gap: 28px; }
.grid-3, .features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%,260px),1fr)); gap: 24px; }
.grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%,220px),1fr)); gap: 20px; }

/* ── Forms ── */
.form-group { margin-bottom: 20px; }
label { display: block; font-size: 0.875rem; font-weight: 600; color: var(--text); margin-bottom: 7px; }
input:not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]),
textarea, select {
  font-family: var(--font-body);
  font-size: 0.9375rem;
  width: 100%;
  padding: 12px 16px;
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  transition: border-color .15s, box-shadow .15s;
  outline: none;
  appearance: none;
}
input:focus, textarea:focus, select:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
  background: #fff;
}
textarea { resize: vertical; min-height: 120px; }

/* ── Badges ── */
.badge {
  display: inline-flex; align-items: center; gap: 5px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 999px; padding: 4px 12px;
  font-size: 0.75rem; font-weight: 600; color: var(--text-muted);
}
.badge-primary {
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  border-color: color-mix(in srgb, var(--primary) 25%, transparent);
  color: var(--primary);
}

/* ── Stats ── */
.stat-value {
  font-family: var(--font-display);
  font-size: clamp(2rem,4vw,3rem);
  font-weight: 800;
  color: var(--primary);
  letter-spacing: -0.04em;
  line-height: 1;
}
.stat-label { font-size: 0.875rem; color: var(--text-muted); font-weight: 500; margin-top: 4px; }

/* ── Testimonials ── */
.testimonial { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 28px 32px; }
.testimonial-text { font-size: 1rem; line-height: 1.7; color: var(--text); font-style: italic; margin-bottom: 20px; }
.testimonial-author { font-weight: 700; color: var(--text); font-size: 0.9375rem; }
.testimonial-role { color: var(--text-muted); font-size: 0.8125rem; margin-top: 2px; }
.testimonial-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; margin-bottom: 16px; }

/* ── Pricing ── */
.pricing-card {
  background: var(--surface); border: 1.5px solid var(--border);
  border-radius: var(--radius-lg); padding: 36px 32px; text-align: center;
}
.pricing-card.featured { background: var(--primary); border-color: var(--primary); color: #fff; }
.pricing-card.featured p, .pricing-card.featured .stat-label { color: rgba(255,255,255,.75); }
.pricing-card.featured h2, .pricing-card.featured h3 { color: #fff; }
.price { font-family: var(--font-display); font-size: clamp(2.5rem,5vw,3.5rem); font-weight: 800; letter-spacing: -0.05em; line-height: 1; }
.price sup { font-size: .5em; vertical-align: super; }
.price-period { font-size: 0.875rem; color: var(--text-muted); font-weight: 500; }
.feature-list { list-style: none; padding: 0; text-align: left; }
.feature-list li { padding: 7px 0; border-bottom: 1px solid var(--border); font-size: 0.9rem; color: var(--text-muted); }
.feature-list li::before { content: '✓ '; color: var(--primary); font-weight: 700; }

/* ── Footer ── */
footer, .footer { background: var(--text); color: rgba(255,255,255,.65); padding: clamp(56px,8vw,96px) clamp(16px,4vw,40px) 40px; }
.footer-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px,1fr)); gap: 40px; max-width: var(--content-width); margin: 0 auto 48px; }
footer a, .footer a { color: rgba(255,255,255,.6); transition: color .15s; text-decoration: none; }
footer a:hover, .footer a:hover { color: #fff; }
.footer-logo { color: #fff !important; font-family: var(--font-display); font-size: 1.15rem; font-weight: 800; letter-spacing: -0.03em; }
.footer-bottom { border-top: 1px solid rgba(255,255,255,.08); padding-top: 28px; max-width: var(--content-width); margin: 0 auto; font-size: .8125rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }

/* ── Image helpers ── */
.img-cover { object-fit: cover; width: 100%; height: 100%; }
.img-rounded { border-radius: var(--radius-lg); }
.img-shadow { box-shadow: var(--shadow-lg); }
.aspect-hero { aspect-ratio: 16/7; }
.aspect-card { aspect-ratio: 4/3; }
.aspect-square { aspect-ratio: 1; }

/* ── Utilities ── */
.text-center { text-align: center; }
.text-muted { color: var(--text-muted); }
.text-primary { color: var(--primary); }
.text-accent { color: var(--accent); }
.mt-auto { margin-top: auto; }
.flex { display: flex; }
.flex-col { flex-direction: column; }
.items-center { align-items: center; }
.justify-center { justify-content: center; }
.justify-between { justify-content: space-between; }
.flex-wrap { flex-wrap: wrap; }
.gap-2 { gap: 8px; }
.gap-3 { gap: 12px; }
.gap-4 { gap: 16px; }
.divider { height: 1px; background: var(--border); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }

/* ── Animations ── */
@keyframes fp-fade-up {
  from { opacity: 0; transform: translateY(28px); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-in { animation: fp-fade-up 0.55s cubic-bezier(.22,1,.36,1) both; }
.animate-in-delay-1 { animation-delay: .08s; }
.animate-in-delay-2 { animation-delay: .16s; }
.animate-in-delay-3 { animation-delay: .24s; }

/* ── Responsive ── */
@media (max-width: 768px) {
  h1 { font-size: 2.2rem; }
  h2 { font-size: 1.6rem; }
  .hero { padding: 72px 20px 56px; }
  .section { padding: 56px 20px; }
  nav, .site-header, .navbar { height: auto; min-height: 60px; padding: 12px 20px; }
  .nav-links, .nav-menu, nav ul { display: none; }
  .grid-2, .grid-3, .grid-4, .features-grid { grid-template-columns: 1fr; }
  .footer-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 480px) {
  .footer-grid { grid-template-columns: 1fr; }
  .pricing-card { padding: 28px 20px; }
}
```

---

## Pack 2: BOLD
> High-energy, vivid colors, strong typography. Sports, apps, brands.
> Fonts: Space Grotesk (display) + Inter (body)

```css
/* ═══ ForgeAI Design Pack: BOLD ════════════════════════════════════════
   High-energy components — use these classes and variables. */

@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');

:root {
  --bg: #ffffff;
  --surface: #f4f4f7;
  --surface-2: #eaeaef;
  --text: #0a0a14;
  --text-muted: #64647a;
  --primary: #6200ff;
  --primary-hover: #5000d6;
  --secondary: #00c4ff;
  --accent: #ff3c78;
  --border: rgba(0,0,0,0.09);
  --radius-sm: 4px;
  --radius: 8px;
  --radius-lg: 14px;
  --radius-xl: 22px;
  --shadow-sm: 0 2px 8px -2px rgba(98,0,255,0.12);
  --shadow: 0 8px 28px -6px rgba(98,0,255,0.18);
  --shadow-lg: 0 20px 60px -16px rgba(98,0,255,0.22);
  --font-display: 'Space Grotesk', -apple-system, sans-serif;
  --font-body: 'Inter', -apple-system, sans-serif;
  --section-py: clamp(72px,10vw,128px);
  --content-width: 1140px;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body { font-family: var(--font-body); background: var(--bg); color: var(--text); line-height: 1.6; -webkit-font-smoothing: antialiased; }

h1, h2, h3, h4, h5, h6 { font-family: var(--font-display); font-weight: 700; line-height: 1.05; letter-spacing: -0.04em; color: var(--text); }
h1 { font-size: clamp(2.6rem,6vw,5rem); }
h2 { font-size: clamp(1.8rem,3.8vw,3rem); }
h3 { font-size: clamp(1.2rem,2vw,1.6rem); }
p  { color: var(--text-muted); line-height: 1.7; }
a  { color: var(--primary); text-decoration: none; }
a:hover { opacity: .85; }
img { max-width: 100%; height: auto; display: block; }

.btn-primary, a.btn-primary, button.btn-primary {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 14px 28px; background: var(--primary); color: #fff !important;
  font-family: var(--font-display); font-size: 0.9375rem; font-weight: 700; letter-spacing: -0.01em;
  border: none; border-radius: var(--radius); cursor: pointer;
  transition: background .15s, transform .12s, box-shadow .15s;
  text-decoration: none !important;
  box-shadow: 0 6px 24px -4px color-mix(in srgb, var(--primary) 50%, transparent);
  white-space: nowrap;
}
.btn-primary:hover { background: var(--primary-hover); transform: translateY(-2px) scale(1.01); box-shadow: 0 12px 36px -6px color-mix(in srgb, var(--primary) 50%, transparent); }
.btn-secondary, a.btn-secondary, button.btn-secondary {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 13px 26px; background: transparent; color: var(--text) !important;
  font-family: var(--font-display); font-size: 0.9375rem; font-weight: 600; letter-spacing: -0.01em;
  border: 2px solid var(--text); border-radius: var(--radius); cursor: pointer;
  transition: background .15s, color .15s; text-decoration: none !important; white-space: nowrap;
}
.btn-secondary:hover { background: var(--text); color: #fff !important; }
.btn-ghost, a.btn-ghost, button.btn-ghost { background: transparent; border: none; color: var(--text-muted); font-family: var(--font-body); font-size: 0.9375rem; font-weight: 500; padding: 8px 14px; cursor: pointer; transition: color .15s; }
.btn-ghost:hover { color: var(--text); }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 28px; transition: box-shadow .2s, transform .2s; }
.card:hover { box-shadow: var(--shadow); transform: translateY(-3px); }
.card-white { background: #fff; }
.card-bordered { border: 2px solid var(--border); }
.card-icon { width: 48px; height: 48px; background: color-mix(in srgb, var(--primary) 12%, transparent); border-radius: var(--radius); display: flex; align-items: center; justify-content: center; margin-bottom: 18px; color: var(--primary); font-size: 1.4rem; }

nav, header.site-header, .site-header, .navbar { position: sticky; top: 0; z-index: 100; background: rgba(255,255,255,0.92); backdrop-filter: blur(16px); border-bottom: 1.5px solid var(--border); padding: 0 clamp(16px,4vw,40px); height: 68px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.nav-logo, .logo, .brand { font-family: var(--font-display); font-size: 1.2rem; font-weight: 700; color: var(--text) !important; text-decoration: none; letter-spacing: -0.04em; }
.nav-links, .nav-menu, nav ul { display: flex; align-items: center; gap: 4px; list-style: none; padding: 0; }
.nav-links a, .nav-menu a, nav ul a { color: var(--text-muted) !important; font-weight: 500; font-size: .9rem; padding: 6px 10px; border-radius: var(--radius-sm); transition: color .15s, background .15s; text-decoration: none !important; }
.nav-links a:hover, .nav-menu a:hover, nav ul a:hover { color: var(--text) !important; background: var(--surface); }

.section { padding: var(--section-py) clamp(16px,4vw,40px); }
.section-sm { padding: calc(var(--section-py)*.6) clamp(16px,4vw,40px); }
.container, .wrapper, .content-wrap { max-width: var(--content-width); margin: 0 auto; width: 100%; }
.section-heading { margin-bottom: clamp(40px,6vw,72px); }
.section-label { display: inline-block; font-size: .72rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--primary); margin-bottom: 14px; }

.hero { padding: clamp(100px,17vw,180px) clamp(16px,4vw,40px) clamp(80px,12vw,144px); background: var(--surface); position: relative; overflow: hidden; }
.hero-center { text-align: center; }
.hero-eyebrow { display: inline-flex; align-items: center; gap: 7px; background: color-mix(in srgb, var(--primary) 10%, transparent); border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent); border-radius: 999px; padding: 6px 16px; font-size: .78rem; font-weight: 700; color: var(--primary); margin-bottom: 28px; letter-spacing: 0.04em; text-transform: uppercase; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 36px; }
.hero-actions.centered { justify-content: center; }

.grid-2 { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,320px),1fr)); gap: 28px; }
.grid-3, .features-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,260px),1fr)); gap: 24px; }
.grid-4 { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,220px),1fr)); gap: 20px; }

.form-group { margin-bottom: 20px; }
label { display: block; font-size: .875rem; font-weight: 600; color: var(--text); margin-bottom: 7px; }
input:not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]), textarea, select { font-family: var(--font-body); font-size: .9375rem; width: 100%; padding: 12px 16px; background: var(--surface); border: 2px solid var(--border); border-radius: var(--radius); color: var(--text); transition: border-color .15s, box-shadow .15s; outline: none; appearance: none; }
input:focus, textarea:focus, select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent); }
textarea { resize: vertical; min-height: 120px; }

.badge { display: inline-flex; align-items: center; gap: 5px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 4px 10px; font-size: .73rem; font-weight: 700; color: var(--text-muted); letter-spacing: .04em; }
.badge-primary { background: color-mix(in srgb, var(--primary) 10%, transparent); border-color: color-mix(in srgb, var(--primary) 25%, transparent); color: var(--primary); }

.stat-value { font-family: var(--font-display); font-size: clamp(2rem,4vw,3.2rem); font-weight: 700; color: var(--primary); letter-spacing: -0.05em; line-height: 1; }
.stat-label { font-size: .875rem; color: var(--text-muted); font-weight: 500; margin-top: 4px; }

.testimonial { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 28px 32px; }
.testimonial-text { font-size: 1rem; line-height: 1.7; color: var(--text); font-style: italic; margin-bottom: 20px; }
.testimonial-author { font-weight: 700; color: var(--text); font-size: .9375rem; }
.testimonial-role { color: var(--text-muted); font-size: .8125rem; margin-top: 2px; }
.testimonial-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; margin-bottom: 16px; }

.divider { height: 1.5px; background: var(--border); }
.price { font-family: var(--font-display); font-size: clamp(2.5rem,5vw,3.5rem); font-weight: 700; letter-spacing: -0.06em; line-height: 1; }

footer, .footer { background: var(--text); color: rgba(255,255,255,.65); padding: clamp(56px,8vw,96px) clamp(16px,4vw,40px) 40px; }
.footer-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(160px,1fr)); gap: 40px; max-width: var(--content-width); margin: 0 auto 48px; }
footer a, .footer a { color: rgba(255,255,255,.6); transition: color .15s; text-decoration: none; }
footer a:hover, .footer a:hover { color: #fff; }
.footer-logo { color: #fff !important; font-family: var(--font-display); font-size: 1.15rem; font-weight: 700; letter-spacing: -0.04em; }
.footer-bottom { border-top: 1px solid rgba(255,255,255,.08); padding-top: 28px; max-width: var(--content-width); margin: 0 auto; font-size: .8125rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }

.img-cover { object-fit: cover; width: 100%; height: 100%; }
.img-rounded { border-radius: var(--radius-lg); }
.img-shadow { box-shadow: var(--shadow-lg); }
.aspect-hero { aspect-ratio: 16/7; }
.aspect-card { aspect-ratio: 4/3; }
.aspect-square { aspect-ratio: 1; }

.text-center { text-align: center; }
.text-muted { color: var(--text-muted); }
.text-primary { color: var(--primary); }
.flex { display: flex; }
.flex-col { flex-direction: column; }
.items-center { align-items: center; }
.justify-center { justify-content: center; }
.justify-between { justify-content: space-between; }
.flex-wrap { flex-wrap: wrap; }
.gap-2 { gap: 8px; }
.gap-3 { gap: 12px; }
.gap-4 { gap: 16px; }

@keyframes fp-fade-up { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: translateY(0); } }
.animate-in { animation: fp-fade-up 0.5s cubic-bezier(.22,1,.36,1) both; }
.animate-in-delay-1 { animation-delay: .08s; }
.animate-in-delay-2 { animation-delay: .16s; }
.animate-in-delay-3 { animation-delay: .24s; }

@media (max-width: 768px) {
  h1 { font-size: 2.3rem; }
  h2 { font-size: 1.65rem; }
  .hero { padding: 72px 20px 56px; }
  .section { padding: 56px 20px; }
  nav, .site-header, .navbar { height: auto; min-height: 60px; padding: 12px 20px; }
  .nav-links, .nav-menu, nav ul { display: none; }
  .grid-2, .grid-3, .grid-4, .features-grid { grid-template-columns: 1fr; }
}
```

---

## Pack 3: DARK
> Dark bg, glow effects, premium. Gaming, crypto, tech, nightlife.
> Fonts: Space Grotesk (display) + Inter (body)

```css
/* ═══ ForgeAI Design Pack: DARK ════════════════════════════════════════
   Premium dark component system — use these classes and variables. */

@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');

:root {
  --bg: #0a0a0f;
  --surface: #13131c;
  --surface-2: #1c1c2a;
  --text: #f0eef8;
  --text-muted: #8888aa;
  --primary: #7c3aed;
  --primary-hover: #6d28d9;
  --secondary: #06b6d4;
  --accent: #f59e0b;
  --border: rgba(255,255,255,0.08);
  --radius-sm: 6px;
  --radius: 10px;
  --radius-lg: 18px;
  --radius-xl: 28px;
  --shadow-sm: 0 2px 8px -2px rgba(0,0,0,0.5);
  --shadow: 0 8px 32px -8px rgba(0,0,0,0.6);
  --shadow-lg: 0 24px 64px -20px rgba(0,0,0,0.7);
  --glow: 0 0 40px -10px color-mix(in srgb, var(--primary) 40%, transparent);
  --font-display: 'Space Grotesk', -apple-system, sans-serif;
  --font-body: 'Inter', -apple-system, sans-serif;
  --section-py: clamp(72px,10vw,128px);
  --content-width: 1120px;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body { font-family: var(--font-body); background: var(--bg); color: var(--text); line-height: 1.65; -webkit-font-smoothing: antialiased; }

h1, h2, h3, h4, h5, h6 { font-family: var(--font-display); font-weight: 700; line-height: 1.08; letter-spacing: -0.03em; color: var(--text); }
h1 { font-size: clamp(2.4rem,5.5vw,4.5rem); }
h2 { font-size: clamp(1.7rem,3.4vw,2.8rem); }
h3 { font-size: clamp(1.2rem,2vw,1.5rem); }
p  { color: var(--text-muted); line-height: 1.7; }
a  { color: var(--primary); text-decoration: none; }
a:hover { opacity: .85; }
img { max-width: 100%; height: auto; display: block; }

.btn-primary, a.btn-primary, button.btn-primary {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 13px 26px; background: var(--primary); color: #fff !important;
  font-family: var(--font-display); font-size: .9375rem; font-weight: 700;
  border: none; border-radius: var(--radius); cursor: pointer;
  transition: background .15s, transform .15s, box-shadow .15s;
  text-decoration: none !important;
  box-shadow: 0 4px 24px -6px color-mix(in srgb, var(--primary) 60%, transparent);
  white-space: nowrap;
}
.btn-primary:hover { background: var(--primary-hover); transform: translateY(-2px); box-shadow: 0 8px 36px -4px color-mix(in srgb, var(--primary) 65%, transparent); }
.btn-secondary, a.btn-secondary, button.btn-secondary { display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; background: transparent; color: var(--text) !important; font-family: var(--font-display); font-size: .9375rem; font-weight: 600; border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; transition: border-color .15s, background .15s; text-decoration: none !important; white-space: nowrap; }
.btn-secondary:hover { background: var(--surface); border-color: rgba(255,255,255,.18); }
.btn-ghost, a.btn-ghost, button.btn-ghost { background: transparent; border: none; color: var(--text-muted); font-family: var(--font-body); font-size: .9375rem; font-weight: 500; padding: 8px 14px; cursor: pointer; transition: color .15s; }
.btn-ghost:hover { color: var(--text); }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 28px; transition: box-shadow .22s ease, transform .22s ease, border-color .22s; }
.card:hover { box-shadow: var(--shadow), var(--glow); transform: translateY(-3px); border-color: color-mix(in srgb, var(--primary) 30%, transparent); }
.card-white { background: var(--surface-2); }
.card-bordered { border: 1px solid rgba(255,255,255,0.12); }
.card-glass { background: rgba(255,255,255,0.04); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.08); }
.card-icon { width: 48px; height: 48px; background: color-mix(in srgb, var(--primary) 18%, transparent); border-radius: var(--radius); display: flex; align-items: center; justify-content: center; margin-bottom: 18px; color: var(--primary); font-size: 1.3rem; box-shadow: 0 0 20px -6px color-mix(in srgb, var(--primary) 40%, transparent); }

nav, header.site-header, .site-header, .navbar { position: sticky; top: 0; z-index: 100; background: rgba(10,10,15,0.85); backdrop-filter: blur(18px); border-bottom: 1px solid var(--border); padding: 0 clamp(16px,4vw,40px); height: 68px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.nav-logo, .logo, .brand { font-family: var(--font-display); font-size: 1.2rem; font-weight: 700; color: var(--text) !important; text-decoration: none; letter-spacing: -0.03em; }
.nav-links, .nav-menu, nav ul { display: flex; align-items: center; gap: 4px; list-style: none; padding: 0; }
.nav-links a, .nav-menu a, nav ul a { color: var(--text-muted) !important; font-weight: 500; font-size: .9rem; padding: 6px 10px; border-radius: var(--radius-sm); transition: color .15s, background .15s; text-decoration: none !important; }
.nav-links a:hover, .nav-menu a:hover, nav ul a:hover { color: var(--text) !important; background: var(--surface); }

.section { padding: var(--section-py) clamp(16px,4vw,40px); }
.section-sm { padding: calc(var(--section-py)*.6) clamp(16px,4vw,40px); }
.container, .wrapper, .content-wrap { max-width: var(--content-width); margin: 0 auto; width: 100%; }
.section-heading { margin-bottom: clamp(40px,6vw,72px); }
.section-label { display: inline-block; font-size: .72rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--primary); margin-bottom: 14px; }

.hero { padding: clamp(100px,17vw,180px) clamp(16px,4vw,40px) clamp(80px,12vw,144px); background: var(--bg); position: relative; overflow: hidden; }
.hero::before { content: ''; position: absolute; top: -40%; left: 10%; right: 10%; height: 80%; background: radial-gradient(ellipse at center, color-mix(in srgb, var(--primary) 18%, transparent) 0%, transparent 65%); pointer-events: none; }
.hero-center { text-align: center; }
.hero-eyebrow { display: inline-flex; align-items: center; gap: 7px; background: color-mix(in srgb, var(--primary) 12%, transparent); border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent); border-radius: 999px; padding: 6px 16px; font-size: .78rem; font-weight: 700; color: var(--primary); margin-bottom: 28px; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 36px; }
.hero-actions.centered { justify-content: center; }

.grid-2 { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,320px),1fr)); gap: 28px; }
.grid-3, .features-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,260px),1fr)); gap: 24px; }
.grid-4 { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,220px),1fr)); gap: 20px; }

.form-group { margin-bottom: 20px; }
label { display: block; font-size: .875rem; font-weight: 600; color: var(--text); margin-bottom: 7px; }
input:not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]), textarea, select { font-family: var(--font-body); font-size: .9375rem; width: 100%; padding: 12px 16px; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); transition: border-color .15s, box-shadow .15s; outline: none; appearance: none; }
input:focus, textarea:focus, select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 20%, transparent); background: var(--surface); }
textarea { resize: vertical; min-height: 120px; }

.badge { display: inline-flex; align-items: center; gap: 5px; background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: 4px 12px; font-size: .75rem; font-weight: 600; color: var(--text-muted); }
.badge-primary { background: color-mix(in srgb, var(--primary) 14%, transparent); border-color: color-mix(in srgb, var(--primary) 30%, transparent); color: color-mix(in srgb, var(--primary) 80%, #fff); }

.stat-value { font-family: var(--font-display); font-size: clamp(2rem,4vw,3rem); font-weight: 700; color: var(--primary); letter-spacing: -0.05em; line-height: 1; }
.stat-label { font-size: .875rem; color: var(--text-muted); font-weight: 500; margin-top: 4px; }

.testimonial { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 28px 32px; }
.testimonial-text { font-size: 1rem; line-height: 1.7; color: var(--text); font-style: italic; margin-bottom: 20px; }
.testimonial-author { font-weight: 700; color: var(--text); font-size: .9375rem; }
.testimonial-role { color: var(--text-muted); font-size: .8125rem; margin-top: 2px; }
.testimonial-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; margin-bottom: 16px; }

.divider { height: 1px; background: var(--border); }

footer, .footer { background: var(--surface); border-top: 1px solid var(--border); color: var(--text-muted); padding: clamp(56px,8vw,96px) clamp(16px,4vw,40px) 40px; }
.footer-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(160px,1fr)); gap: 40px; max-width: var(--content-width); margin: 0 auto 48px; }
footer a, .footer a { color: var(--text-muted); transition: color .15s; text-decoration: none; }
footer a:hover, .footer a:hover { color: var(--text); }
.footer-logo { color: var(--text) !important; font-family: var(--font-display); font-size: 1.15rem; font-weight: 700; letter-spacing: -0.03em; }
.footer-bottom { border-top: 1px solid var(--border); padding-top: 28px; max-width: var(--content-width); margin: 0 auto; font-size: .8125rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }

.img-cover { object-fit: cover; width: 100%; height: 100%; }
.img-rounded { border-radius: var(--radius-lg); }
.img-shadow { box-shadow: var(--shadow-lg); }
.aspect-hero { aspect-ratio: 16/7; }
.aspect-card { aspect-ratio: 4/3; }
.aspect-square { aspect-ratio: 1; }

.text-center { text-align: center; }
.text-muted { color: var(--text-muted); }
.text-primary { color: var(--primary); }
.flex { display: flex; }
.flex-col { flex-direction: column; }
.items-center { align-items: center; }
.justify-center { justify-content: center; }
.justify-between { justify-content: space-between; }
.flex-wrap { flex-wrap: wrap; }
.gap-2 { gap: 8px; }
.gap-3 { gap: 12px; }
.gap-4 { gap: 16px; }

@keyframes fp-fade-up { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fp-glow-pulse { 0%,100% { box-shadow: var(--glow); } 50% { box-shadow: 0 0 60px -8px color-mix(in srgb,var(--primary) 55%,transparent); } }
.animate-in { animation: fp-fade-up 0.55s cubic-bezier(.22,1,.36,1) both; }
.animate-in-delay-1 { animation-delay: .08s; }
.animate-in-delay-2 { animation-delay: .16s; }
.animate-in-delay-3 { animation-delay: .24s; }
.glow-pulse { animation: fp-glow-pulse 3s ease-in-out infinite; }

@media (max-width: 768px) {
  h1 { font-size: 2.2rem; }
  h2 { font-size: 1.6rem; }
  .hero { padding: 72px 20px 56px; }
  .section { padding: 56px 20px; }
  nav, .site-header, .navbar { height: auto; min-height: 60px; padding: 12px 20px; }
  .nav-links, .nav-menu, nav ul { display: none; }
  .grid-2, .grid-3, .grid-4, .features-grid { grid-template-columns: 1fr; }
}
```

---

*ForgeAI Design System — injected automatically into every generated site.*
*The AI writes content and layout. The pack writes the components.*
