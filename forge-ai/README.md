# ForgeAI — Autonomous AI Software Engineer

> Connect GitHub → Import a repo → Click "Fix Workspace" → Get a Pull Request.

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite + TypeScript + Tailwind |
| Backend | Node.js + Express + MongoDB + BullMQ + Socket.IO |
| AI Service | Python + Flask (analysis, context, file tree) |
| AI Providers | OpenAI GPT-4, Anthropic Claude, Google Gemini |
| Queue | Redis + BullMQ |
| VS Code | TypeScript extension |

---

## Quick Start (Docker)

```bash
# 1. Clone and copy env
cp .env.example .env
# Fill in your GitHub OAuth app credentials and at least one AI key

# 2. Start everything
docker compose up --build

# Frontend: http://localhost:5173
# Backend:  http://localhost:4000
# Python:   http://localhost:5001
```

---

## Local Dev (no Docker)

### Prerequisites
- Node.js 20+
- Python 3.12+
- MongoDB running locally
- Redis running locally

### 1. Install dependencies

```bash
# Root
npm install

# Backend
cd backend && npm install

# Frontend
cd frontend && npm install

# Python
cd python-service && pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — fill in:
#   GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
#   JWT_SECRET
#   OPENAI_API_KEY or ANTHROPIC_API_KEY or GEMINI_API_KEY
```

### 3. Run services

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev

# Terminal 3 — Python service
cd python-service && python app.py
```

---

## GitHub OAuth App Setup

1. Go to https://github.com/settings/developers → "New OAuth App"
2. **Homepage URL**: `http://localhost:5173`
3. **Callback URL**: `http://localhost:4000/api/auth/github/callback`
4. Copy Client ID and Secret → paste into `.env`

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Random secret for signing JWTs |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret |
| `OPENAI_API_KEY` | OpenAI key (optional) |
| `ANTHROPIC_API_KEY` | Anthropic key (optional) |
| `GEMINI_API_KEY` | Google Gemini key (optional) |
| `PYTHON_SERVICE_URL` | URL of the Python Flask service |
| `FRONTEND_URL` | Frontend URL (for CORS + OAuth redirect) |

---

## VS Code Extension

```bash
cd vscode-extension
npm install
npm run compile

# Press F5 in VS Code to launch Extension Development Host
```

Set your token in VS Code settings (`Cmd+,` → search "forgeai").

---

## Project Structure

```
forge-ai/
├── frontend/          # React SPA
│   └── src/
│       ├── pages/     # Route pages
│       ├── components/
│       │   ├── layout/    # AppLayout, sidebar
│       │   └── workspace/ # FileTree, ChatPanel, DiffViewer, TaskPanel
│       ├── store/     # Zustand stores
│       ├── lib/       # API client, Socket.IO
│       └── types/     # TypeScript types
├── backend/           # Express API
│   └── src/
│       ├── modules/
│       │   ├── auth/       # JWT + GitHub OAuth
│       │   ├── repository/ # Repo CRUD + file tree
│       │   ├── github/     # GitHub API proxy
│       │   ├── ai/         # Provider abstraction + chat
│       │   ├── tasks/      # Task lifecycle + processor
│       │   ├── websocket/  # Socket.IO
│       │   └── settings/   # User settings
│       └── lib/       # DB, Redis, workers, JWT, passport
├── python-service/    # Flask analysis service
│   └── modules/
│       ├── analyzer.py       # Lint/build/test runner
│       ├── context_builder.py # Smart context for AI prompts
│       ├── file_tree.py      # Directory tree
│       └── indexer.py        # File indexing + framework detection
├── vscode-extension/  # VS Code extension
└── docker-compose.yml
```

---

## 14-Day Roadmap

| Day | Focus |
|-----|-------|
| 1 | Repo setup, auth, Docker, MongoDB |
| 2 | GitHub OAuth, repository import, dashboard |
| 3 | Cloning, indexing, file explorer |
| 4 | Context builder, dependency detection |
| 5 | AI provider abstraction (OpenAI/Claude/Gemini) |
| 6 | Chat UI, workspace chat |
| 7 | Fix current file, fix folder |
| 8 | Fix workspace, build runner |
| 9 | Diff viewer, task history |
| 10 | VS Code extension |
| 11 | Terminal integration, error parser |
| 12 | UI polish, landing page, branding |
| 13 | Testing, bug fixes, performance |
| 14 | Deployment, demo video, launch |

---

## MVP Success Criteria

- [ ] User can sign up and log in (email + GitHub)
- [ ] User can connect GitHub and import a repository
- [ ] Repository is cloned and indexed automatically
- [ ] User clicks "Fix Workspace" and sees live log updates
- [ ] AI fixes errors across multiple files
- [ ] Diff viewer shows all changes
- [ ] User can download changes or create a Pull Request
