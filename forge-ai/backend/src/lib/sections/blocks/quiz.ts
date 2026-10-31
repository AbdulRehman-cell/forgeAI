// The quiz engine. Three kinds, decided by what the model writes on each option:
//   "correct": true   — a knowledge quiz with a score and explanations
//   "points": 3       — an assessment: the total picks the result
//   "result": "id"    — "which one are you?": the most-picked result wins
// Everything is rendered up front; the engine script (sections/engines.ts) only
// shows and hides it, so it works the same on static pages and in React apps.

import { Content, Ctx, SectionDef, esc, list, plain } from '../markup'
import { shareButtons } from './blog'

type Kind = 'correct' | 'points' | 'match'

const kindOf = (questions: Content[]): Kind => {
  const options = questions.flatMap((q) => list(q.options, 6)).filter((o) => o && typeof o === 'object')
  if (options.some((o) => o.correct === true || o.correct === 'true')) return 'correct'
  if (options.some((o) => plain(o.result))) return 'match'
  return 'points'
}

function resultMarkup(r: Content, x: Ctx, kind: Kind, total: number): string {
  const src = r.photo ? x.photo(r.photo) : ''
  const id = kind === 'match' ? ` data-r="${esc(plain(r.id ?? r.title))}"` : ` data-min="${Number(r.min) || 0}"`
  const score = kind === 'correct' ? `<p${x.cls('kit-quiz-score')} data-kit-score="${x.say('yourScore', { n: '{n}', t: String(total) })}"></p>` : ''
  const button = x.link(r.button, 'btn btn-primary')
  return `<div${x.cls('kit-quiz-result')}${id} hidden>${src ? x.img(src, r.title, 'kit-quiz-photo') : ''}${score}${plain(r.title) ? `<h3 ${x.jsx ? 'tabIndex' : 'tabindex'}="-1">${x.text(r.title)}</h3>` : ''}${plain(r.text) ? `<p>${x.text(r.text)}</p>` : ''}<div${x.cls('kit-actions')}>${button}<button type="button"${x.cls('btn btn-secondary')} data-kit-do="quiz-retake">${x.say('retake')}</button></div>${shareButtons(x)}</div>`
}

export const quiz: SectionDef = {
  type: 'quiz',
  label: 'Quiz — one question at a time with progress and a personal result: knowledge test, assessment or "which one are you?"; can collect the visitor\'s email for the Leads inbox',
  variants: { card: 'band', split: 'split' },
  doc: '{"eyebrow","title","intro","start":"Start the quiz" (optional first screen),"photo" (split only),"questions":[{"q":"the question","photo","options":[{"label":"…"…}] ×2–5,"explain":"shown after answering"}] ×4–12,"results":[…] ×2–4,"capture":{"title":"Where should we send your result?","text","button":"See my result","optional":true}} — pick ONE kind. Knowledge quiz: exactly one option in each question has "correct":true; results [{"min":0,"title","text","button":{label,href}}, {"min":8,…}] (min = score needed). Assessment: every option has "points":0–5; results use "min" the same way. Which-one-are-you: every option has "result":"id"; results [{"id","title","text","photo","button"}]. "capture" sends the email and the result to the owner\'s Leads inbox — leave it out unless the site wants leads',
  render(c, v, x, tone) {
    const questions = list(c.questions, 15).filter((q) => plain(q?.q ?? q?.question) && list(q.options, 6).length >= 2)
    if (!questions.length) throw new Error('a quiz with no questions')
    const kind = kindOf(questions)
    const total = questions.length
    const start = plain(c.start)
    const counter = (i: number) => x.say('question', { n: i + 1, t: total })
    const items = questions.map((q, i) => {
      const options = list(q.options, 6).map((o) => (o && typeof o === 'object' ? o as Content : { label: o })).filter((o) => plain(o.label ?? o.text))
      const photo = q.photo ? x.photo(q.photo) : ''
      const buttons = options.map((o) => {
        const data = kind === 'correct' ? (o.correct === true || o.correct === 'true' ? ' data-c="1"' : '') : kind === 'match' ? ` data-r="${esc(plain(o.result))}"` : ` data-p="${Number(o.points) || 0}"`
        return `<button type="button"${x.cls('kit-quiz-opt')} data-kit-do="quiz-pick"${data}>${x.text(o.label ?? o.text)}</button>`
      }).join('')
      const last = i === total - 1
      return `<div${x.cls('kit-quiz-q')} data-i="${i}"${i || start ? ' hidden' : ''}><p${x.cls('kit-quiz-count')}>${counter(i)}</p>${photo ? x.img(photo, q.q ?? q.question, 'kit-quiz-photo') : ''}<h3>${x.text(q.q ?? q.question)}</h3><div${x.cls('kit-quiz-opts')}>${buttons}</div>${plain(q.explain) ? `<p${x.cls('kit-quiz-explain')} hidden>${x.text(q.explain)}</p>` : ''}<button type="button"${x.cls('btn btn-primary', 'kit-quiz-next')} data-kit-do="quiz-next" hidden>${last ? x.say('seeResult') : x.say('next')}</button></div>`
    }).join('')
    let results = list(c.results, 6).filter((r) => r && typeof r === 'object' && (plain(r.title) || plain(r.text)))
    // A knowledge quiz still reports the score when the model wrote no results
    if (!results.length && kind !== 'match') results = [{ min: 0 }]
    if (!results.length) throw new Error('a "which one are you" quiz with no results')
    const capture = c.capture && typeof c.capture === 'object' ? c.capture as Content : null
    const emailId = x.uid('kqz')
    const form = capture
      ? `<div${x.cls('kit-quiz-capture')} data-kit-capture="1" hidden>${plain(capture.title) ? `<h3>${x.text(capture.title)}</h3>` : ''}${plain(capture.text) ? `<p>${x.text(capture.text)}</p>` : ''}<form${x.cls('kit-quiz-form')} data-kit-post="1" data-kit-form-title="${esc(plain(c.title) || 'Quiz')}"><div${x.cls('kit-field')}><label ${x.jsx ? 'htmlFor' : 'for'}="${emailId}">${x.say('email')}</label><input id="${emailId}" name="email" type="email" required placeholder="you@example.com"${x.jsx ? ' />' : '>'}</div><button type="submit"${x.cls('btn btn-primary')}>${plain(capture.button) ? x.text(capture.button) : x.say('seeResult')}</button></form>${capture.optional === false ? '' : `<button type="button"${x.cls('kit-quiz-skip')} data-kit-do="quiz-skip">${x.say('skip')}</button>`}</div>`
      : ''
    const box = `<div${x.cls('kit-quiz')} data-kit-engine="quiz" data-kit-kind="${kind}" data-kit-total="${total}" data-kit-title="${esc(plain(c.title))}"><div${x.cls('kit-quiz-bar')} aria-hidden="true"><span${x.cls('kit-quiz-fill')}></span></div>${start ? `<div${x.cls('kit-quiz-start')}><p>${x.say('questions', { n: total })}</p><button type="button"${x.cls('btn btn-primary')} data-kit-do="quiz-start">${esc(start)}</button></div>` : ''}${items}${form}${results.map((r) => resultMarkup(r, x, kind, total)).join('')}</div>`
    if (v === 'split') {
      const src = x.photo(c.photo)
      return x.section('quiz', v, tone, c, `<div${x.cls('kit-quiz-split')}><div${x.cls('kit-quiz-aside')}>${x.head(c)}${src ? x.img(src, c.title, 'kit-quiz-cover') : ''}</div>${box}</div>`, { noHead: true })
    }
    return x.section('quiz', v, tone, c, box)
  },
  css: `/* Quiz */
.kit-quiz { position: relative; max-width: 760px; margin: 0 auto; padding: clamp(1.5rem, 4vw, 2.75rem); padding-top: clamp(1.9rem, 4vw, 3rem); background: var(--kit-card-bg); border: var(--kit-card-border); box-shadow: var(--kit-card-shadow); border-radius: var(--radius-xl); overflow: hidden; }
.kit-quiz-bar { position: absolute; inset-inline: 0; top: 0; height: 6px; background: var(--surface-2); }
.kit-quiz-fill { display: block; height: 100%; width: 100%; background: var(--primary); transform: scaleX(0); transform-origin: 0 50%; transition: transform .3s ease; }
.kit-quiz-start { text-align: center; padding: 1rem 0; }
.kit-quiz-start p { color: var(--muted); margin: 0 0 1rem; }
.kit-quiz-count { font-size: .8rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--primary-ink); margin: 0 0 .6rem; }
.kit-quiz h3 { font-size: clamp(1.25rem, 1.05rem + .9vw, 1.7rem); line-height: 1.28; margin: 0 0 1.25rem; outline: none; }
.kit-quiz-photo { width: 100%; max-height: 300px; object-fit: cover; display: block; border-radius: var(--radius-lg); margin: 0 0 1.25rem; }
.kit-quiz-opts { display: grid; gap: .6rem; }
.kit-quiz-opt { width: 100%; min-height: 54px; padding: .8rem 1.1rem; text-align: start; border-radius: var(--radius); border: 1.5px solid var(--border-strong); background: var(--bg); color: var(--text); font: inherit; font-weight: 600; line-height: 1.35; cursor: pointer; transition: border-color .15s ease, background .15s ease; }
.kit-quiz-opt:hover:not(:disabled) { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 7%, var(--bg)); }
.kit-quiz-opt:focus-visible { outline: none; box-shadow: var(--ring); border-color: var(--primary); }
.kit-quiz-opt:disabled { cursor: default; color: var(--text); opacity: 1; }
.kit-quiz-opt.is-picked { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 12%, var(--bg)); }
.kit-quiz-opt.is-right { border-color: #15803d; background: color-mix(in srgb, #15803d 13%, var(--bg)); }
.kit-quiz-opt.is-wrong { border-color: #b91c1c; background: color-mix(in srgb, #b91c1c 11%, var(--bg)); }
.kit-quiz-opt.is-right::after { content: ' ✓'; color: #15803d; font-weight: 800; }
.kit-quiz-opt.is-wrong::after { content: ' ✕'; color: #b91c1c; font-weight: 800; }
.kit-quiz-explain { margin: 1rem 0 0; padding: .85rem 1.05rem; border-radius: var(--radius); background: var(--surface); color: var(--text); font-size: .96rem; line-height: 1.6; }
.kit-quiz-next { margin-top: 1.1rem; }
.kit-quiz-capture > p { color: var(--muted); margin: -.6rem 0 1.1rem; }
.kit-quiz-form { display: grid; gap: .85rem; justify-items: start; }
.kit-quiz-form .kit-field { width: 100%; }
.kit-quiz-skip { display: block; margin: .9rem 0 0; padding: .4rem 0; border: 0; background: none; color: var(--muted); font: inherit; font-size: .9rem; text-decoration: underline; cursor: pointer; }
.kit-quiz-result { text-align: center; }
.kit-quiz-result > p:not(.kit-quiz-score) { color: var(--muted); line-height: 1.65; margin: 0 auto 1.4rem; max-width: 56ch; }
.kit-quiz-result .kit-actions { justify-content: center; margin-bottom: 1.25rem; }
.kit-quiz-result .kit-share { justify-content: center; }
.kit-quiz-score { font-family: var(--font-heading); font-weight: var(--heading-weight); font-size: clamp(1.8rem, 1.3rem + 2vw, 2.7rem); line-height: 1.15; color: var(--primary-ink); margin: 0 0 .5rem; }
.kit-quiz-split { display: grid; grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); gap: clamp(2rem, 5vw, 4rem); align-items: start; }
.kit-quiz-split .kit-quiz { max-width: none; margin: 0; }
.kit-quiz-split .kit-head { text-align: start; margin: 0 0 1.5rem; }
.kit-quiz-split .kit-head > * { margin-inline: 0; }
.kit-quiz-aside { min-width: 0; }
.kit-quiz-cover { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; border-radius: var(--radius-xl); }
@media (max-width: 860px) { .kit-quiz-split { grid-template-columns: 1fr; } .kit-quiz-cover { display: none; } }
`,
}
