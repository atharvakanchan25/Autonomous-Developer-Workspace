# Autonomous Developer Workspace (ADW)

An AI-powered full-stack platform where you describe a software project in plain English and the system autonomously breaks it into tasks, writes the code, writes the tests, reviews the code, runs a CI/CD pipeline, and streams everything live to your browser — all without you writing a single line of code.

---

## What This Project Actually Does

You open the app, type something like:

> "Build a REST API for a task management app with user authentication, CRUD operations, and JWT tokens"

The system then:

1. Sends your description to the Groq LLM (`llama-3.3-70b-versatile`) which breaks it into 4–12 structured tasks with a dependency graph (DAG)
2. Saves all tasks to Firestore and immediately queues the ones with no dependencies
3. For each task, runs a 3-agent pipeline automatically:
   - **Code Generator** — writes production-ready Python implementation
   - **Test Generator** — writes a full pytest test suite for that code
   - **Code Reviewer** — reviews both and produces a scored markdown report
4. After each task pipeline completes, automatically triggers a CI/CD simulation (tests → build → deploy)
5. Streams every log line, status change, and deployment update live to your browser via Socket.IO
6. Saves all generated files to Firestore so you can browse, edit, and version them in the built-in editor

---

## How to Run It

You need two terminals open simultaneously.

### Prerequisites

- Python >= 3.11
- Node.js >= 18
- A [Groq API key](https://console.groq.com) (free)
- A Firebase project with Firestore enabled + a service account key ([Firebase Console](https://console.firebase.google.com))

### 1. Clone

```bash
git clone https://github.com/atharvakanchan25/Autonomous-Developer-Workspace.git
cd Autonomous-Developer-Workspace
```

### 2. Backend setup

```bash
cd apps/server-py

# Windows
.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env

# macOS / Linux
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Fill in `apps/server-py/.env`:

```env
APP_ENV="development"
PORT=4000
GROQ_API_KEY="your-groq-api-key"
FIREBASE_PROJECT_ID="your-firebase-project-id"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"
CORS_ORIGIN="http://localhost:3000"
```

### 3. Frontend setup

```bash
cd apps/web
npm install
copy .env.example .env.local   # Windows
cp .env.example .env.local     # macOS / Linux
```

`apps/web/.env.local` only needs:

```env
NEXT_PUBLIC_API_URL="http://localhost:4000"
```

### 4. Start both servers

**Terminal 1 — Backend (port 4000)**

```bash
cd apps/server-py

# Windows
.venv\Scripts\python.exe run.py

# macOS / Linux
.venv/bin/python run.py
```

**Terminal 2 — Frontend (port 3000)**

```bash
cd apps/web
npm run dev
```

Open **http://localhost:3000** in your browser. Both terminals must stay running.

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:4000 |
| API Docs (Swagger) | http://localhost:4000/docs |
| Health check | http://localhost:4000/health |

---

## Complete User Flow — Step by Step

### Step 1 — Home Page (`/`)

This is where everything starts. You see a large textarea and a "Generate Plan →" button.

**What to do:** Type a description of the software you want to build. Be specific — the more detail you give, the better the task breakdown. For example:

> "Build a Python CLI tool that scrapes product prices from an e-commerce site, stores them in SQLite, and sends an email alert when a price drops below a threshold"

**What happens when you click Generate Plan:**

1. The frontend calls `POST /api/projects/` to create a new project in Firestore using your description as the project name
2. It then calls `POST /api/ai/generate-plan` with your description
3. The backend sends your description to the Groq LLM with a structured system prompt that instructs it to return a JSON task plan with keys, titles, descriptions, order numbers, and dependency arrays
4. The LLM returns 4–12 tasks as a valid DAG (no cycles, dependencies always have lower order numbers)
5. All tasks are saved to Firestore in a single batch write with status `PENDING`
6. Tasks that have no dependencies (root tasks) are immediately added to the in-memory job queue
7. You are automatically redirected to the **Graph page** for your new project

Below the form you also see your 5 most recent projects as a quick-access list. Clicking any of them takes you straight to their Graph page.

---

### Step 2 — Graph Page (`/graph`)

This is the main control center. It shows your tasks as an interactive node graph where arrows represent dependencies — a task can only run after all tasks pointing into it are complete.

**What you see:**

- Each task is a card (node) showing its title, description, order number, and current status
- Arrows between nodes show which tasks depend on which
- A progress bar in the top bar shows how many tasks are done out of total
- A live socket indicator (green pulsing dot = connected, amber = connecting, grey = offline)
- A log panel on the right side showing real-time agent activity

**Node colors and states:**

| Color | Meaning |
|---|---|
| Grey border | PENDING — waiting to run |
| Indigo border + pulsing dot | IN_PROGRESS — pipeline is running right now |
| Green border + checkmark | COMPLETED — all 3 agents passed |
| Red border | FAILED — one of the agents failed |

**What you can do on the Graph page:**

- **Select a project** using the dropdown in the top bar to switch between projects
- **Click any node** to open a details drawer on the right showing the task's full description, dependencies, metadata, and the 3-agent pipeline steps
- **Click "Run" on a PENDING node** to manually trigger the full 3-agent pipeline for that specific task immediately
- **Watch tasks run in real time** — nodes animate (pulse) while running, turn green with a ripple effect when completed, turn red if failed
- **Toggle the Logs panel** using the "Logs" button in the top bar — this shows a live scrolling feed of every agent log line as it happens
- **Refresh** the graph manually using the ↺ button
- **Zoom and pan** the graph canvas, use the minimap in the bottom right corner to navigate large graphs

**What happens automatically in the background:**

The queue worker processes tasks in dependency order. When a root task completes, the worker checks all other tasks in the project and queues any task whose dependencies are now all completed. This cascades through the entire DAG automatically — you don't need to manually trigger anything after the initial plan generation.

---

### Step 3 — The 3-Agent Pipeline (what runs per task)

Every task goes through exactly these three agents in sequence. If any agent fails, the pipeline stops and the task is marked FAILED.

**Agent 1: Code Generator**

Sends the task title and description to the LLM with a system prompt instructing it to produce clean, production-ready Python code with type hints, async/await where appropriate, all imports included, and concise docstrings. The output is saved as a `.py` file named after the task title (e.g. `build_user_auth_api.py`).

**Agent 2: Test Generator**

Receives the task description AND the code produced by Agent 1. Sends both to the LLM with a system prompt instructing it to write a comprehensive pytest test suite covering happy paths, edge cases, error cases, and mocked external dependencies. The output is saved as `test_<taskname>.py`.

**Agent 3: Code Reviewer**

Receives the task description, the implementation code, and the test code. Sends all three to the LLM with a system prompt instructing it to produce a structured markdown review report with exactly these sections: Summary, Strengths, Issues, Security, Performance, Test Coverage, Recommendations, and Score (X/10). The output is saved as `<taskname>_review.md`.

After all three agents complete, the dispatcher saves all generated files to the `projectFiles` Firestore collection (with version history if a file already exists), then triggers the CI/CD pipeline automatically.

---

### Projects Page (`/projects`)

A full list of all your projects as cards. Each card shows the project name, description, task count, and how long ago it was last updated.

**What you can do:**

- **New project** button (top right) — opens an inline form to create a project manually with a name and optional description. This creates the project but does NOT generate a task plan. Use the Home page if you want the AI to generate tasks automatically.
- **Tasks button** on each card — goes to the Tasks page filtered to that project
- **Graph → button** on each card — goes to the Graph page for that project

---

### Tasks Page (`/tasks`)

A table view of all tasks across all projects, or filtered to a specific project.

**What you see:**

- Status summary bar at the top showing counts for PENDING / IN_PROGRESS / COMPLETED / FAILED
- A table with each task's order number, title, description, project name, and current status badge
- A dropdown per row to manually change a task's status

**What you can do:**

- **Filter by project** using the dropdown in the top bar
- **Create a task manually** using the "+ New task" button — opens a form where you enter a title, description, and select a project. This creates a standalone task that you can then run from the Graph page.
- **Change task status manually** using the dropdown in each row — useful for resetting a FAILED task back to PENDING so you can re-run it

---

### Editor Page (`/editor`)

A VS Code-style in-browser code editor for all files generated by the agents.

**What you see:**

- Left sidebar: file explorer showing all files for the selected project, organized by path
- Main area: Monaco editor (the same editor engine that powers VS Code) with syntax highlighting

**What you can do:**

- **Select a project** using the dropdown in the top bar to load its files
- **Click any file** in the explorer to open it in the editor
- **Edit the file** directly in the editor — changes are saved to Firestore when you save
- **Create a new file** using the + button in the file explorer — enter a path and name
- **Rename a file** by right-clicking or using the rename option — opens a modal to change the path/name
- **Delete a file** using the delete option in the file explorer
- **View version history** — every time an agent overwrites a file, the previous version is saved automatically. You can browse and restore old versions from the editor.

The files you see here are the actual Python implementation files, test files, and markdown review reports generated by the agents. You can read the generated code, edit it, and save changes back to Firestore.

---

### Deploy Page (`/deploy`)

Shows the CI/CD pipeline runs for your project. Every time a task's 3-agent pipeline completes successfully, a CI/CD run is triggered automatically.

**What you see:**

- Stats bar at the top: total deployments, running, successful, failed
- A list of deployment cards, each showing the pipeline stages

**Each deployment card shows:**

- Status badge (Pending / Running / Success / Failed) with a live pulsing dot while running
- Three pipeline stages in sequence: **Tests → Build → Deploy**
- Each stage pill shows its status (running/passed/failed) and duration in milliseconds
- A green animated connector line fills in between stages as they pass
- If a stage fails, the error message is shown below in red
- If deploy succeeds, a preview URL is shown (simulated: `https://preview-<id>.adw-deploy.example.com`)
- Stage detail logs at the bottom (e.g. "All tests passed", "Build succeeded — 0 errors")

**What you can do:**

- **Select a project** using the dropdown to see its deployments
- **Manually trigger a deployment** using the "Deploy" button — runs the CI/CD pipeline immediately for the selected project without needing a task to complete first
- **Watch deployments update live** — the page listens to Socket.IO `deployment:updated` events and updates cards in real time without refreshing

**How the CI/CD simulation works:**

The backend runs three stages sequentially with realistic random durations:
- Tests: 1.5–2.5 seconds, 10% chance of failure
- Build: 2–3.5 seconds, 5% chance of failure
- Deploy: 0.8–1.4 seconds, always passes if tests and build passed

The pass/fail outcome for tests and build is deterministic based on a hash of the project+task ID, so the same task always produces the same result.

---

### Observe Page (`/observe`)

A full observability dashboard showing everything that has happened across all projects. Auto-refreshes every 10 seconds and also updates live via Socket.IO.

**Stat cards at the top:**

- **Total Tasks** — total task count with breakdown of done vs failed
- **Agent Runs** — total agent executions with average duration in milliseconds
- **Errors** — total error count, turns red if there are any
- **Success Rate** — percentage of agent runs that completed successfully

**Four tabs below the stat cards:**

**Logs tab** — A paginated table of all observability log entries. Each row shows timestamp, log level (DEBUG/INFO/WARN/ERROR), source, message, and associated task/agent. Useful for debugging what happened during a specific run.

**Agent Activity tab** — A table of all agent run records sorted by most recent. Each row shows which agent ran (CODE_GENERATOR / TEST_GENERATOR / CODE_REVIEWER), which task it ran on, its status, and how long it took. Lets you see at a glance which agents are slow or failing.

**Timeline tab** — Shows completed/failed/in-progress tasks with their full pipeline breakdown. Each row expands to show the three agent stages, their individual durations, and the total pipeline duration. Useful for understanding how long the full code generation cycle takes per task.

**Errors tab** — Shows only ERROR-level log entries. Has a red badge on the tab label showing the error count. Useful for quickly finding what went wrong without scrolling through all logs.

---

## Architecture — How Everything Connects

```
Browser (Next.js on port 3000)
        │
        │  REST API calls (fetch)
        │  Socket.IO (real-time events)
        ▼
FastAPI Server (Python on port 4000)
        │
        ├── POST /api/ai/generate-plan
        │       └── Calls Groq LLM → parses JSON → saves tasks to Firestore
        │           → queues root tasks in asyncio in-memory queue
        │
        ├── asyncio Queue Worker
        │       └── Picks up jobs → runs dispatch_pipeline(task_id)
        │               ├── Agent 1: CODE_GENERATOR → LLM → saves .py file
        │               ├── Agent 2: TEST_GENERATOR → LLM → saves test_.py file
        │               └── Agent 3: CODE_REVIEWER  → LLM → saves _review.md file
        │               → On success: triggers CI/CD + queues dependent tasks
        │
        ├── CI/CD Service
        │       └── Simulates tests → build → deploy with realistic delays
        │           → Emits deployment:updated events via Socket.IO
        │
        └── Socket.IO Server
                └── Emits to project-scoped rooms:
                    task:updated · agent:log · pipeline:stage · deployment:updated
```

---

## Real-time Events (Socket.IO)

The frontend subscribes to a project room by emitting `room:join` with the project ID. The backend then pushes these events:

| Event | When it fires | What it contains |
|---|---|---|
| `task:updated` | Task status changes | taskId, new status, title, timestamp |
| `agent:log` | Any agent logs a message | agentType, log level, message, timestamp |
| `pipeline:stage` | An agent starts, completes, or fails | agentType, stage, duration, summary/error |
| `deployment:updated` | Any CI/CD stage changes | deploymentId, status, stage logs, previewUrl |

The Graph page, Deploy page, and Observe page all listen to these events and update their UI instantly without polling.

---

## Firestore Data Model

| Collection | What's stored |
|---|---|
| `projects` | name, description, createdAt, updatedAt |
| `tasks` | title, description, status, order, projectId, dependsOn (array of task IDs) |
| `agentRuns` | taskId, agentType, status, input, output, durationMs, errorMsg |
| `projectFiles` | projectId, path, name, language, content, size |
| `fileVersions` | fileId, content, size, label (snapshot before agent overwrites) |
| `deployments` | projectId, taskId, status, log (array of stage results), previewUrl |
| `aiPlanLogs` | projectId, prompt, rawResponse, taskCount (audit log of every plan generation) |

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js 14, React 18 | App router, server/client components |
| Styling | Tailwind CSS | Utility-first, dark theme |
| Animations | Framer Motion | Smooth transitions, layout animations |
| Graph | React Flow (@xyflow/react) | Interactive DAG visualization |
| Code Editor | Monaco Editor | VS Code engine in the browser |
| Real-time | Socket.IO client | Live event streaming |
| Backend | FastAPI, Python 3.11+ | Async, fast, auto-generates /docs |
| Real-time server | python-socketio | Socket.IO server integrated with FastAPI |
| AI | Groq API — llama-3.3-70b-versatile | Fast inference, free tier available |
| Validation | Pydantic v2, pydantic-settings | Request/response validation, env config |
| Database | Firebase Firestore (firebase-admin) | NoSQL, real-time capable, free tier |
| Rate limiting | slowapi | Per-IP rate limiting on all routes |
| Job queue | asyncio.Queue (in-memory) | Lightweight task queue, no Redis needed |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | Your Groq API key from console.groq.com |
| `FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Yes | Service account email |
| `FIREBASE_PRIVATE_KEY` | Yes | Service account private key (with `\n` newlines) |
| `APP_ENV` | No | `development` or `production` (default: `development`) |
| `PORT` | No | Backend port (default: `4000`) |
| `CORS_ORIGIN` | No | Allowed frontend origin (default: `http://localhost:3000`) |
| `LOG_LEVEL` | No | `debug`, `info`, `warning`, `error` (default: `info`) |
| `RATE_LIMIT_WINDOW_MS` | No | Rate limit window in ms (default: `60000`) |
| `RATE_LIMIT_MAX` | No | Max requests per window (default: `200`) |

---

## Project Structure

```
autonomous-developer-workspace/
├── apps/
│   ├── server-py/                        # Python FastAPI backend
│   │   ├── src/
│   │   │   ├── agents/
│   │   │   │   ├── runners/
│   │   │   │   │   ├── code_generator.py   # Agent 1: writes Python implementation
│   │   │   │   │   ├── test_generator.py   # Agent 2: writes pytest test suite
│   │   │   │   │   └── code_reviewer.py    # Agent 3: reviews and scores code
│   │   │   │   ├── agent_dispatcher.py     # Runs single agent or full pipeline
│   │   │   │   ├── agent_llm.py            # Groq API wrapper
│   │   │   │   ├── agent_registry.py       # Agent registration and lookup
│   │   │   │   ├── agent_service.py        # FastAPI routes for /api/agents
│   │   │   │   └── agent_types.py          # Enums and dataclasses
│   │   │   ├── modules/
│   │   │   │   ├── ai/ai_service.py        # /api/ai/generate-plan
│   │   │   │   ├── cicd/cicd_service.py    # /api/cicd — CI/CD simulation
│   │   │   │   ├── files/files_service.py  # /api/files — file CRUD + versions
│   │   │   │   ├── observability/          # /api/observe — stats, logs, timeline
│   │   │   │   ├── projects/               # /api/projects
│   │   │   │   └── tasks/                  # /api/tasks
│   │   │   ├── queue/
│   │   │   │   ├── queue.py                # asyncio in-memory job queue
│   │   │   │   └── worker.py               # Job handler + dependency chaining
│   │   │   └── lib/
│   │   │       ├── config.py               # Pydantic settings from .env
│   │   │       ├── emitter.py              # Socket.IO emit helpers
│   │   │       ├── firestore.py            # Firestore client init
│   │   │       ├── groq.py                 # Groq async client init
│   │   │       ├── socket.py               # Socket.IO server init
│   │   │       └── socket_events.py        # Pydantic models for socket payloads
│   │   ├── .env.example
│   │   ├── requirements.txt
│   │   └── run.py                          # Uvicorn entry point
│   └── web/                               # Next.js 14 frontend
│       └── src/
│           ├── app/
│           │   ├── page.tsx                # Home — project description input
│           │   ├── projects/page.tsx       # Projects list
│           │   ├── tasks/page.tsx          # Tasks table
│           │   ├── graph/page.tsx          # DAG task graph + live logs
│           │   ├── editor/page.tsx         # Monaco code editor
│           │   ├── deploy/page.tsx         # CI/CD deployment cards
│           │   └── observe/page.tsx        # Observability dashboard
│           ├── components/
│           │   ├── graph/
│           │   │   ├── TaskGraph.tsx       # React Flow canvas
│           │   │   ├── TaskNode.tsx        # Individual task node card
│           │   │   ├── AnimatedEdge.tsx    # Animated dependency arrows
│           │   │   └── NodeDetailsDrawer.tsx # Slide-in task detail panel
│           │   ├── editor/
│           │   │   ├── EditorPane.tsx      # Monaco editor wrapper
│           │   │   ├── FileExplorer.tsx    # File tree sidebar
│           │   │   └── RenameModal.tsx     # Rename dialog
│           │   ├── cicd/DeploymentCard.tsx # CI/CD pipeline card
│           │   ├── observe/                # Stat cards, log table, timeline, errors
│           │   ├── AgentLogFeed.tsx        # Live scrolling log panel
│           │   ├── Sidebar.tsx             # Left navigation sidebar
│           │   └── PageShell.tsx           # Layout wrapper with sidebar
│           └── lib/
│               ├── api.ts                  # All REST API calls
│               ├── useSocket.ts            # Socket.IO hook
│               ├── useTaskGraph.ts         # Graph data + socket sync hook
│               ├── useFileTree.ts          # File tree state hook
│               ├── motion.ts               # Framer Motion animation presets
│               └── theme.ts                # Color/style constants
```

---

## Frontend Scripts

```bash
cd apps/web
npm run dev        # Development server on port 3000
npm run build      # Production build
npm run start      # Start production server
npm run lint       # ESLint
npm run type-check # TypeScript type check
```

---

## License

MIT License — Copyright (c) 2025 Atharva Kanchan
