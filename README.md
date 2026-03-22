# Autonomous Developer Workspace

A full-stack AI-powered development platform that takes a project description, breaks it into tasks using an LLM, and autonomously runs a multi-agent pipeline (code generation → test generation → code review) on each task — with real-time progress streaming, a DAG task graph, a built-in code editor, CI/CD simulation, and an observability dashboard.

---

## Features

- **AI Plan Generation** — Describe your project and the LLM API generates a structured task plan with a dependency graph (DAG)
- **Multi-Agent Pipeline** — Each task runs through three sequential agents:
  - `CODE_GENERATOR` — produces TypeScript implementation code
  - `TEST_GENERATOR` — writes tests for the generated code
  - `CODE_REVIEWER` — reviews and annotates the code
- **Real-time Streaming** — Pipeline progress, agent logs, and CI/CD stage updates are pushed live via Socket.IO
- **DAG Task Graph** — Interactive visual graph of tasks and their dependencies (React Flow)
- **Code Editor** — Monaco-based in-browser editor with file explorer and version history
- **CI/CD Simulation** — Automated test → build → deploy pipeline triggered after each completed task
- **Observability Dashboard** — Agent activity table, execution timeline, error feed, and stats
- **Firestore Persistence** — All projects, tasks, agent runs, files, and deployments stored in Firebase Firestore

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React 18, Tailwind CSS, React Flow, Monaco Editor, Socket.IO client |
| Backend | Node.js, Express, TypeScript, Socket.IO, Zod |
| AI | LLM API (e.g. Gemini / Groq / OpenAI) |
| Database | Firebase Firestore (via `firebase-admin`) |
| Monorepo | Turborepo, npm workspaces |

---

## Project Structure

```
autonomous-developer-workspace/
├── apps/
│   ├── server/          # Express API + agent pipeline + Socket.IO
│   │   └── src/
│   │       ├── agents/  # Agent runners, dispatcher, registry, LLM wrapper
│   │       ├── modules/ # projects, tasks, ai, files, cicd, observability
│   │       ├── queue/   # In-memory job queue + worker
│   │       └── lib/     # Firestore, LLM client, Socket, Logger, config
│   └── web/             # Next.js frontend
│       └── src/
│           ├── app/     # Pages: projects, tasks, graph, editor, deploy, observe
│           ├── components/
│           └── lib/     # API client, socket hooks, utilities
└── packages/
    ├── config/          # Shared ESLint + TypeScript configs
    └── ui/              # Shared UI components
```

---

## Prerequisites

- Node.js >= 18
- npm >= 10
- An LLM API key (e.g. [Gemini](https://aistudio.google.com/app/apikey) / [Groq](https://console.groq.com) / [OpenAI](https://platform.openai.com))
- A Firebase project with Firestore enabled and a service account key

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/<your-username>/autonomous-developer-workspace.git
cd autonomous-developer-workspace
npm install
```

### 2. Configure the server

```bash
cp apps/server/.env.example apps/server/.env
```

Fill in `apps/server/.env`:

```env
NODE_ENV="development"
PORT=4000

LLM_API_KEY="your-llm-api-key"

FIREBASE_PROJECT_ID="your-firebase-project-id"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"

CORS_ORIGIN="http://localhost:3000"
LOG_LEVEL="info"
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=200
```

> **Never commit your `.env` file or Firebase service account JSON to version control.**

### 3. Configure the web app

```bash
cp apps/web/.env.example apps/web/.env.local
```

Set the API and WebSocket URL (defaults to `http://localhost:4000`).

### 4. Run in development

```bash
npm run dev
```

This starts both the server (port `4000`) and the web app (port `3000`) in parallel via Turborepo.

---

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/ai/generate-plan` | Generate a task plan from a project description |
| `GET` | `/api/projects` | List all projects |
| `POST` | `/api/projects` | Create a project |
| `GET` | `/api/tasks?projectId=` | List tasks for a project |
| `POST` | `/api/agents/run` | Run a single agent or full pipeline on a task |
| `GET` | `/api/agents/runs/:taskId` | Get all agent runs for a task |
| `GET` | `/api/files?projectId=` | List project files |
| `GET` | `/api/cicd/:projectId` | List deployments for a project |
| `GET` | `/api/observe/:projectId` | Observability metrics |
| `GET` | `/health` | Health check |

### Socket.IO Events (server → client)

| Event | Description |
|---|---|
| `task:updated` | Task status changed |
| `agent:log` | Agent log message |
| `pipeline:stage` | Agent stage started / completed / failed |
| `deployment:updated` | CI/CD stage progress |

---

## Scripts

```bash
npm run dev          # Start all apps in development mode
npm run build        # Build all apps
npm run lint         # Lint all packages
npm run type-check   # TypeScript check across all packages
npm run clean        # Remove build artifacts
```

---

## Environment Variables Reference

| Variable | Description |
|---|---|
| `LLM_API_KEY` | LLM API key (e.g. Gemini / Groq / OpenAI) |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account email |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key |
| `PORT` | Server port (default: `4000`) |
| `CORS_ORIGIN` | Allowed CORS origin (default: `http://localhost:3000`) |
| `LOG_LEVEL` | Winston log level (`info`, `debug`, `warn`, `error`) |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in ms |
| `RATE_LIMIT_MAX` | Max requests per window |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Next.js)                        │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Projects │  │ DAG Graph│  │  Editor  │  │  Observability│  │
│  │  & Tasks │  │(ReactFlow│  │ (Monaco) │  │   Dashboard   │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬───────┘  │
│       └─────────────┴──────────────┴────────────────┘          │
│                    REST (fetch) + Socket.IO client              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Express Server (Node.js)                     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      REST API Routes                    │   │
│  │  /api/projects  /api/tasks  /api/ai  /api/agents        │   │
│  │  /api/files     /api/cicd   /api/observe   /health      │   │
│  └──────────────────────────┬──────────────────────────────┘   │
│                             │                                   │
│          ┌──────────────────┼──────────────────┐               │
│          ▼                  ▼                  ▼               │
│  ┌───────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │  AI Service   │  │  Job Queue   │  │   CI/CD Service  │    │
│  │ (plan gen)    │  │  + Worker    │  │ (test→build→     │    │
│  └──────┬────────┘  └──────┬───────┘  │  deploy sim)     │    │
│         │                  │          └────────┬─────────┘    │
│         │                  ▼                   │               │
│         │        ┌─────────────────┐           │               │
│         │        │  Agent Pipeline │           │               │
│         │        │                 │           │               │
│         │        │ ┌─────────────┐ │           │               │
│         │        │ │CODE_GENERATOR│ │           │               │
│         │        │ └──────┬──────┘ │           │               │
│         │        │        ▼        │           │               │
│         │        │ ┌─────────────┐ │           │               │
│         │        │ │TEST_GENERATOR│ │           │               │
│         │        │ └──────┬──────┘ │           │               │
│         │        │        ▼        │           │               │
│         │        │ ┌─────────────┐ │           │               │
│         │        │ │CODE_REVIEWER│ │           │               │
│         │        │ └─────────────┘ │           │               │
│         │        └────────┬────────┘           │               │
│         │                 │                    │               │
│         └────────┐        │      ┌─────────────┘               │
│                  ▼        ▼      ▼                             │
│           ┌─────────────────────────┐                          │
│           │       LLM API           │                          │
│           │ (e.g. Gemini/Groq/      │                          │
│           │       OpenAI)           │                          │
│           └─────────────────────────┘                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                     Socket.IO Server                     │  │
│  │  task:updated · agent:log · pipeline:stage ·             │  │
│  │  deployment:updated                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Firebase Firestore                           │
│                                                                 │
│   projects · tasks · agentRuns · projectFiles ·                 │
│   fileVersions · deployments · aiPlanLogs                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## License

MIT License — Copyright (c) 2025 Atharva Kanchan

Feel free to use, modify, and distribute this project. Contributions and improvements are welcome — open a PR or file an issue!
