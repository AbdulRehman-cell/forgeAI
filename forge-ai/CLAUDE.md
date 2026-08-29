# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development (run from `forge-ai/`)
```bash
npm run dev          # starts frontend (port 5173) + backend (port 4000) concurrently
npm run build        # tsc frontend then tsc backend
npm run install:all  # npm install all workspaces + pip install python-service deps
```

### Backend only (run from `forge-ai/backend/`)
```bash
npm run dev          # nodemon with ts-node (no compile step)
npm start            # ts-node directly
npm run build        # tsc output to dist/
```

### Frontend only (run from `forge-ai/frontend/`)
```bash
npm run dev          # vite dev server, port 5173
npm run build        # tsc + vite build
npm run lint         # eslint src --ext ts,tsx
npm run preview      # preview built output
```

### Python service (run from `forge-ai/python-service/`)
```bash
python app.py        # Flask on port 5001
pip install -r requirements.txt
```

### Docker (full stack)
```bash
docker-compose up    # mongo:7, redis:7, backend:4000, python:5001, frontend nginx
```

## Architecture

### Stack
- **Backend**: Express 4 + TypeScript (ts-node in dev) on port 4000
- **Frontend**: React 18 + Vite 5 + Tailwind 3.4 on port 5173
- **Database**: MongoDB via Mongoose 8 (Atlas URI). Three collections: `users`, `repositories`, `tasks`
- **Python service**: Flask 3 on port 5001 — repo analysis, file search, dependency graphs, lint/build/test running
- **WebSocket**: Socket.IO with JWT auth. Rooms: `user:{userId}` and `task:{taskId}`. Event: `task:update`

### Request flow
HTTP → Helmet/CORS/rateLimit → express.json → morgan → passport.initialize → route handler → `requireAuth` middleware → business logic → `enqueueJob()` → in-process job handler → Mongoose save → Socket.IO emit

### Job queue
Despite `bullmq`/`ioredis` being in `package.json`, **they are not used**. The actual queue is in-process: `setImmediate` + a handler registry in `backend/src/lib/workers.ts`. Redis is declared in docker-compose but the backend does not connect to it.

### AI provider system
`backend/src/modules/ai/ai.factory.ts` — `createProvider(name)` supports: `openai`, `claude` (Anthropic), `gemini` (default free tier), `github` (legacy GitHub Models), `kimi` (256k ctx), `groq` (Llama 3.3 fallback). `HybridProvider` wraps a primary + fallback, auto-switching on rate-limit or billing errors.

Provider routing:
- **Chat / live agent**: forced to free stack (GitHub/Gemini hybrid)
- **Builder**: GitHub GPT generates structure, then best-effort Claude QA pass polishes CSS and fixes routing
- `BUILDER_AI_PROVIDER` / `ENHANCER_AI_PROVIDER` env vars control this split

`chatWithContinuation()` in `task.processor.ts` detects truncated AI responses (unclosed `<file>` tags) and auto-continues without re-generating.

### Task processing (`backend/src/modules/tasks/task.processor.ts`)
This is the AI engine for all task types. Common fix cycle:
1. Call Python `/analyze` → errors list
2. Call Python `/repo/context` → smart context string
3. Build prompt → AI response → parse `<file path="...">...</file>` XML → write files → git commit
4. Up to 5 fix iterations per workspace

Key task types and their handlers:
- `fix-file` / `fix-workspace` — iterative AI fix loop
- `review` / `generate-tests` / `security-scan` — one-shot analysis
- `blitz-deploy` — AI generates Dockerfile + CI config → pushes branch → calls Render/Railway/Vercel APIs
- `build-site` — Lovable-style website generator (static or MERN). Runs site audit first if `importUrl` is set; `mode: enhance | rebuild` (enhance is default with importUrl)
- `agent` — autonomous agent with filesystem + terminal tools
- `rebuild-proposal` — analyzes 25 source files, generates structured markdown proposal
- `build-dashboard` — ingests CSV/Sheets/Stripe data, generates Chart.js HTML dashboard

### Website builder pipeline (`build-site`)
- `lib/siteAudit.ts` — scores any URL 0–10 across 7 weighted categories; returns verdict `enhance` / `rebuild` / `perfect` (≥8 score blocks the build with 409 `SITE_ALREADY_GOOD`)
- `lib/siteImport.ts` — crawls homepage + up to 5 inner pages; downloads brand photos; parses JSON-LD; sanitizes HTML for enhance mode
- **Enhance mode** layers ForgeAI CSS LAST (never replaces). `sanitizeEnhancementCss()` in `task.processor.ts` is load-bearing — it whitelists only shadow/radius/transition/spacing properties and strips layout/color/font-family rewrites that would break the client's existing design
- `lib/deployers.ts` — Render/Railway/Vercel API integrations including custom domain management

### Frontend state
Three Zustand stores (no Redux):
- `authStore.ts` — `token`, `user` (persisted to localStorage as `forge-auth`)
- `workspaceStore.ts` — `activeFile`, `expandedDirs`, `taskRunning`, `taskId`
- `editorStore.ts` — tabs, split pane, search

API client (`lib/api.ts`): Axios with `VITE_API_URL` base. Injects `Authorization: Bearer {token}`, redirects to `/login` on 401.

### Frontend routing
Public: `/`, `/login`, `/share/:token`
Private (behind `PrivateRoute` + `AppLayout`): `/dashboard`, `/builder`, `/repositories`, `/repositories/:id`, `/repositories/:id/workspace`, `/dashboards`, `/dashboards/new`, `/dashboards/:id`, `/tasks`, `/search`, `/settings`, `/pricing`

### Plans and billing
`backend/src/lib/plans.ts`: `free` ($0, 5 fixes/3 reviews/3 deploys/mo), `pro` ($19, 100 fixes), `team` ($49, unlimited). `middleware/usage.middleware.ts` enforces quotas. Stripe integration lives in `billing.routes.ts`.

### File storage pattern
Task `before`/`after` file content is stored directly in MongoDB task documents (with a `truncated` flag for large files) — this is what powers one-click revert without needing git history.

### Python service endpoints
| Path | Purpose |
|------|---------|
| `POST /repo/index` | Walk repo, detect framework, extract deps |
| `POST /repo/context` | Build smart context string for AI prompts |
| `POST /analyze` | Run lint/build/test, return errors |
| `POST /repo/dependencies` | Build import graph |
| `POST /repo/impact` | All files transitively importing a given file |
| `POST /repo/search` | Full-text search across source files |

### Key env vars
```
MONGODB_URI, JWT_SECRET, JWT_EXPIRES_IN=7d
GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_CALLBACK_URL
OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY
PYTHON_SERVICE_URL=http://localhost:5001
FRONTEND_URL=http://localhost:5173
VITE_API_URL, VITE_WS_URL
BUILDER_AI_PROVIDER, ENHANCER_AI_PROVIDER
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
```

### New features added (post-initial commit)

| Feature | Backend | Frontend |
|---------|---------|----------|
| Contact leads | `modules/leads/lead.model.ts` + `leads.routes.ts` | `pages/Leads.tsx` |
| Team seats | `modules/teams/teams.routes.ts` + `user.model.ts` (teamMembers) | `pages/TeamSettings.tsx` |
| Client approval | `repository.routes.ts` + public `POST/GET /api/approve/:token` in `app.ts` | `pages/ApprovalPage.tsx` |
| Maintenance mode | `repository.routes.ts` POST `/:id/maintenance` | Builder.tsx toggle |
| Page speed score | `repository.routes.ts` GET `/:id/speed-score` (PageSpeed Insights API) | Builder.tsx panel |
| Monthly maintenance plan | `lib/maintenanceScheduler.ts` + `repository.routes.ts` | Builder.tsx toggle |
| Agency white-label | `modules/settings/whitelabel.routes.ts` + `user.model.ts` (whiteLabel) | `pages/Settings.tsx` |
| SEO injection | `task.processor.ts` `buildSite()` — sitemap.xml, robots.txt, meta/OG/JSON-LD | — |
| Analytics embed | `task.processor.ts` `buildSite()` — GA/Plausible snippet | Builder.tsx checkbox |
| Edit-after-generate | `task.routes.ts` POST `/tasks/patch-site` (delegates to agent) | Builder.tsx chat |
| Mobile preview | — | Builder.tsx device frames |

**Public routes (no auth):** `GET/POST /api/approve/:token`, `POST /api/leads/submit/:siteToken`, `POST /api/teams/accept`

### Tailwind custom tokens
Colors: `brand` (indigo scale), `violet`, `surface`. Font: JetBrains Mono. Custom shadows: `glow-*`. Custom animations: `fade-up`, `float`, `aurora-shift`, `shimmer`, `glow-pulse`. Dark mode: `class`.
