# Autonomous Developer Workspace

A full-stack AI-powered development platform that takes a project description, breaks it into tasks using an LLM, and autonomously runs a multi-agent pipeline (code generation → test generation → code review) on each task — with real-time progress streaming, a DAG task graph, a built-in code editor, CI/CD simulation, and an observability dashboard.

---

## Features

- **AI Plan Generation** — Describe your project and the LLM generates a structured task plan with a dependency graph (DAG)
- **Multi-Agent Pipeline** — Each task runs through three sequential agents:
  - `CODE_GENERATOR` — produces Python implementation code
  - `TEST_GENERATOR` — writes a pytest test suite for the generated code
  - `CODE_REVIEWER` — reviews and scores the code with a structured markdown report
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
| Backend | Python 3.11+, FastAPI, python-socketio, Uvicorn |
| AI | Groq API — `llama-3.3-70b-versatile` |
| Validation | Pydantic v2, pydantic-settings |
| Database | Firebase Firestore (`firebase-admin`) |
| Rate Limiting | slowapi |

---

## Project Structure

```
autonomous-developer-workspace/
├── apps/
│   ├── server-py/                  # Python FastAPI backend
│   │   ├── src/
│   │   │   ├── agents/             # Agent runners, dispatcher, registry, LLM wrapper
│   │   │   │   └── runners/        # CodeGenerator, TestGenerator, CodeReviewer
│   │   │   ├── modules/            # projects, tasks, ai, files, cicd, observability
│   │   │   ├── queue/              # asyncio in-memory job queue + worker
│   │   │   └── lib/                # Firestore, Groq client, Socket.IO, logger, config, utils
│   │   ├── .env.example
│   │   ├── requirements.txt
│   │   └── run.py                  # Uvicorn entry point
│   └── web/                        # Next.js 14 frontend
│       └── src/
│           ├── app/                # Pages: home, projects, tasks, graph, editor, deploy, observe
│           ├── components/         # UI components
│           └── lib/                # API client, socket hooks, utilities
```

---

## Prerequisites

- **Python** >= 3.11
- **Node.js** >= 18
- **npm** >= 9
- A **Groq API key** — get one free at [console.groq.com](https://console.groq.com)
- A **Firebase project** with Firestore enabled and a service account key — [Firebase Console](https://console.firebase.google.com)

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/atharvakanchan25/Autonomous-Developer-Workspace.git
cd Autonomous-Developer-Workspace
```

### 2. Set up the Python backend

```bash
cd apps/server-py

# Create and activate virtual environment
python -m venv .venv

# Windows (PowerShell)
.venv\Scripts\python.exe -m pip install -r requirements.txt

# macOS / Linux
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Configure backend environment

```bash
copy .env.example .env        # Windows
cp .env.example .env          # macOS / Linux
```

Fill in `apps/server-py/.env`:

```env
APP_ENV="development"
PORT=4000

GROQ_API_KEY="your-groq-api-key"

FIREBASE_PROJECT_ID="your-firebase-project-id"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"

CORS_ORIGIN="http://localhost:3000"
LOG_LEVEL="info"
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=200
```

> **Never commit your `.env` file.** It is already in `.gitignore`.

### 4. Set up the Next.js frontend

```bash
cd apps/web
npm install
copy .env.example .env.local   # Windows
cp .env.example .env.local     # macOS / Linux
```

`apps/web/.env.local` defaults are fine for local development:

```env
NEXT_PUBLIC_API_URL="http://localhost:4000"
```

### 5. Run the project

Open **two terminals**:

**Terminal 1 — Backend (port 4000):**
```bash
cd apps/server-py

# Windows
.venv\Scripts\python.exe run.py

# macOS / Linux
.venv/bin/python run.py
```

**Terminal 2 — Frontend (port 3000):**
```bash
cd apps/web
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## API Reference

### Projects

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/projects/` | List all projects |
| `POST` | `/api/projects/` | Create a project |
| `GET` | `/api/projects/{id}` | Get a project with its tasks |

### Tasks

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/tasks/` | List tasks (optional `?projectId=`) |
| `POST` | `/api/tasks/` | Create a task |
| `GET` | `/api/tasks/{id}` | Get a task |
| `PATCH` | `/api/tasks/{id}/status` | Update task status |

### AI

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/ai/generate-plan` | Generate a task plan from a project description |

### Agents

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/agents/run` | Run a single agent or full pipeline on a task |
| `GET` | `/api/agents/runs/{task_id}` | Get all agent runs for a task |
| `GET` | `/api/agents/` | List all registered agents |

### Files

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/files/?projectId=` | List project files (no content) |
| `GET` | `/api/files/{id}` | Get a file with content |
| `POST` | `/api/files/` | Create a file |
| `PUT` | `/api/files/{id}` | Update file content |
| `PATCH` | `/api/files/{id}/rename` | Rename / move a file |
| `DELETE` | `/api/files/{id}` | Delete a file |
| `GET` | `/api/files/{id}/versions` | List file version history |
| `GET` | `/api/files/versions/{version_id}` | Get a specific version |
| `POST` | `/api/files/{id}/versions/{version_id}/restore` | Restore a version |

### CI/CD

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/cicd/deploy` | Trigger a CI/CD pipeline |
| `GET` | `/api/cicd/deployments?projectId=` | List deployments for a project |
| `GET` | `/api/cicd/deployments/{id}` | Get a deployment |

### Observability

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/observe/summary` | Global stats (tasks, agent runs, errors) |
| `GET` | `/api/observe/logs` | Paginated log query |
| `GET` | `/api/observe/agents` | Recent agent activity |
| `GET` | `/api/observe/timeline` | Execution timeline per task |
| `GET` | `/api/observe/errors` | Recent error logs |

### Health

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Server + Firestore health check |

---

## Socket.IO Events

The backend emits these events to project-scoped rooms (`project:{projectId}`).

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `task:updated` | `{ taskId, projectId, status, title, updatedAt }` | Task status changed |
| `agent:log` | `{ taskId, projectId, agentRunId, agentType, level, message, timestamp }` | Agent log line |
| `pipeline:stage` | `{ taskId, projectId, agentType, stage, durationMs, summary, error, timestamp }` | Agent stage started / completed / failed |
| `deployment:updated` | `{ deploymentId, projectId, status, stage, log, previewUrl, updatedAt }` | CI/CD stage progress |

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `room:join` | `projectId` | Subscribe to a project's events |
| `room:leave` | `projectId` | Unsubscribe from a project's events |

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `APP_ENV` | No | `development` | Application environment |
| `PORT` | No | `4000` | Server port |
| `GROQ_API_KEY` | **Yes** | — | Groq API key |
| `FIREBASE_PROJECT_ID` | **Yes** | — | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | **Yes** | — | Firebase service account email |
| `FIREBASE_PRIVATE_KEY` | **Yes** | — | Firebase service account private key |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed CORS origin |
| `LOG_LEVEL` | No | `info` | Logging level (`debug`, `info`, `warning`, `error`) |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limit window in milliseconds |
| `RATE_LIMIT_MAX` | No | `200` | Max requests per window |

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
│                  FastAPI Server (Python)                        │
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
│  │ (plan gen)    │  │(asyncio.Queue│  │ (test→build→     │    │
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
│           │       Groq API          │                          │
│           │  llama-3.3-70b-versatile│                          │
│           └─────────────────────────┘                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  python-socketio Server                  │  │
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

## Firestore Collections

| Collection | Description |
|---|---|
| `projects` | Project metadata (name, description) |
| `tasks` | Tasks with status, order, and dependency IDs |
| `agentRuns` | Individual agent execution records with input/output |
| `projectFiles` | Generated source files with content and language |
| `fileVersions` | Version history snapshots for each file |
| `deployments` | CI/CD pipeline runs with stage logs |
| `aiPlanLogs` | Audit log of every LLM plan generation call |

---

## Frontend Scripts

```bash
cd apps/web

npm run dev        # Start development server on port 3000
npm run build      # Production build
npm run start      # Start production server
npm run lint       # ESLint
npm run type-check # TypeScript check
```

---

## License

MIT License — Copyright (c) 2025 Atharva Kanchan

Feel free to use, modify, and distribute this project. Contributions and improvements are welcome — open a PR or file an issue!
