# Autonomous Developer Workspace (ADW)

> **An AI that writes code for you** — Describe your project in plain English, and watch as AI breaks it into tasks, writes the code, creates tests, reviews everything, and deploys it automatically.

---

## 🚀 What is This?

**Autonomous Developer Workspace** is like having an AI development team that works for you 24/7. You simply describe what software you want to build, and the system does all the heavy lifting:

- **Breaks down your idea** into smaller, manageable tasks
- **Writes production-ready code** for each task
- **Creates comprehensive tests** to ensure quality
- **Reviews the code** and gives it a quality score
- **Runs CI/CD pipelines** to test, build, and deploy
- **Shows everything live** in your browser as it happens

### Real-World Example

You type:
> "Build a REST API for a blog with user authentication, posts, comments, and likes"

The AI then:
1. Creates 8-10 tasks (database setup, user auth, post endpoints, comment system, etc.)
2. For each task, writes Python code + tests + review
3. Runs automated tests and deployment
4. Gives you all the code files ready to use

**You don't write a single line of code** — just describe what you want!

---

## 🎯 Use Cases

### 1. **Rapid Prototyping**
Need a quick proof-of-concept? Describe your idea and get working code in minutes instead of hours.

### 2. **Learning & Education**
Students can see how AI breaks down complex projects and writes professional code with tests.

### 3. **Code Generation**
Generate boilerplate code, API endpoints, database models, and test suites automatically.

### 4. **Project Planning**
Even if you don't use the generated code, see how AI breaks down your project into logical tasks.

### 5. **Team Collaboration**
Share the task graph with your team to visualize project structure and dependencies.

---

## 🏗️ Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        YOUR BROWSER                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │   Graph    │  │   Editor   │  │   Deploy   │            │
│  │   View     │  │   (Code)   │  │  Pipeline  │            │
│  └────────────┘  └────────────┘  └────────────┘            │
└─────────────────────────────────────────────────────────────┘
                          ↕ (WebSocket + REST API)
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND SERVER (Python)                   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  AI Task Planner (Groq LLM)                          │  │
│  │  "Blog API" → [Task 1, Task 2, Task 3...]           │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↓                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Task Queue (Manages Dependencies)                   │  │
│  │  Runs tasks in correct order                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↓                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  3-Agent Pipeline (For Each Task)                    │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐    │  │
│  │  │  Agent 1   │→ │  Agent 2   │→ │  Agent 3   │    │  │
│  │  │   Code     │  │   Tests    │  │   Review   │    │  │
│  │  │ Generator  │  │ Generator  │  │            │    │  │
│  │  └────────────┘  └────────────┘  └────────────┘    │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↓                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  CI/CD Pipeline                                       │  │
│  │  Tests → Build → Deploy                              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│                    DATABASE (SQLite)                         │
│  Projects | Tasks | Generated Code | Test Results           │
└─────────────────────────────────────────────────────────────┘
```

### How It Works (Step by Step)

#### Step 1: You Describe Your Project
- Open the web app
- Type what you want to build (e.g., "Task management API with authentication")
- Click "Generate Plan"

#### Step 2: AI Creates a Task Plan
- Your description goes to **Groq AI** (powered by Llama 3.3)
- AI breaks it into 4-12 smaller tasks
- Creates a **dependency graph** (Task B can't start until Task A is done)
- Saves everything to the database

#### Step 3: Tasks Run Automatically
For each task, **3 AI agents** work in sequence:

**🤖 Agent 1: Code Generator**
- Writes clean Python code
- Includes all imports and type hints
- Follows best practices
- Saves as `task_name.py`

**🧪 Agent 2: Test Generator**
- Reads the code from Agent 1
- Writes comprehensive pytest tests
- Covers edge cases and errors
- Saves as `test_task_name.py`

**📝 Agent 3: Code Reviewer**
- Reviews both code and tests
- Checks for security issues, performance, quality
- Gives a score out of 10
- Saves as `task_name_review.md`

#### Step 4: CI/CD Pipeline Runs
- Runs all tests
- Builds the project
- Simulates deployment
- Shows results in real-time

#### Step 5: Next Tasks Start Automatically
- When a task completes, the system checks dependencies
- Automatically starts tasks that are now ready
- Continues until all tasks are done

### Real-Time Updates
Everything happens **live** in your browser:
- See tasks change from grey (pending) → blue (running) → green (done)
- Watch logs scroll as agents work
- See deployment progress bars fill up
- No page refresh needed!

---

## 📦 How to Run It

### Prerequisites

Before you start, make sure you have:

- **Python 3.11 or higher** ([Download](https://www.python.org/downloads/))
- **Node.js 18 or higher** ([Download](https://nodejs.org/))
- **Groq API Key** (Free) — [Get it here](https://console.groq.com)
- **Firebase Account** (Free) — [Sign up here](https://console.firebase.google.com)

### Step 1: Clone the Repository

```bash
git clone https://github.com/atharvakanchan25/Autonomous-Developer-Workspace.git
cd Autonomous-Developer-Workspace
```

### Step 2: Setup Backend (Python Server)

```bash
cd apps/server-py

# Create virtual environment and install dependencies
# Windows:
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# macOS/Linux:
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Copy environment file
# Windows:
copy .env.example .env

# macOS/Linux:
cp .env.example .env
```

Now edit `apps/server-py/.env` and add your API keys:

```env
APP_ENV="development"
PORT=4000
GROQ_API_KEY="your-groq-api-key-here"
FIREBASE_PROJECT_ID="your-firebase-project-id"
FIREBASE_CLIENT_EMAIL="your-firebase-email@project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"
CORS_ORIGIN="http://localhost:3000"
```

### Step 3: Setup Frontend (React App)

Open a **new terminal** and run:

```bash
cd apps/web

# Install dependencies
npm install

# Copy environment file
# Windows:
copy .env.example .env.local

# macOS/Linux:
cp .env.example .env.local
```

Edit `apps/web/.env.local`:

```env
NEXT_PUBLIC_API_URL="http://localhost:4000"
```

### Step 4: Start Both Servers

You need **TWO terminals** running at the same time:

**Terminal 1 - Backend:**
```bash
cd apps/server-py

# Windows:
.venv\Scripts\python.exe run.py

# macOS/Linux:
.venv/bin/python run.py
```

**Terminal 2 - Frontend:**
```bash
cd apps/web
npm run dev
```

### Step 5: Open Your Browser

Go to **http://localhost:3000** and start building!

### Quick Reference

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | http://localhost:3000 | Main web interface |
| **Backend API** | http://localhost:4000 | Python server |
| **API Docs** | http://localhost:4000/docs | Interactive API documentation |
| **Health Check** | http://localhost:4000/health | Server status |

---

## 🎨 Features & Pages

### 🏠 Home Page
- Enter your project description
- Click "Generate Plan"
- See your recent projects

### 📊 Graph Page
- Visual task graph with dependencies
- Watch tasks run in real-time
- Click nodes to see details
- Live log feed

### 💻 Editor Page
- VS Code-style code editor
- View all generated files
- Edit and save changes
- Version history

### 🚀 Deploy Page
- CI/CD pipeline visualization
- See test results
- Build status
- Deployment logs

### 📈 Observe Page
- Dashboard with stats
- All logs and errors
- Agent activity timeline
- Success rates

### 📁 Projects Page
- List all your projects
- Create new projects
- View task counts

### ✅ Tasks Page
- Table view of all tasks
- Filter by project
- Change task status
- Create manual tasks

---

## 🛠️ Technical Stack

### Frontend (What You See)

| Technology | Purpose | Why We Use It |
|------------|---------|---------------|
| **Next.js 14** | React framework | Fast, modern, server-side rendering |
| **React 18** | UI library | Component-based, reactive |
| **Tailwind CSS** | Styling | Quick, utility-first CSS |
| **Framer Motion** | Animations | Smooth transitions and effects |
| **React Flow** | Graph visualization | Interactive task dependency graph |
| **Monaco Editor** | Code editor | Same engine as VS Code |
| **Socket.IO Client** | Real-time updates | Live data streaming |

### Backend (The Brain)

| Technology | Purpose | Why We Use It |
|------------|---------|---------------|
| **Python 3.11+** | Programming language | Fast, modern, great for AI |
| **FastAPI** | Web framework | Async, fast, auto-generates docs |
| **Groq API** | AI model | Fast inference, free tier |
| **Llama 3.3 70B** | Language model | Smart, capable, open-source |
| **SQLite** | Database | Simple, local, no setup needed |
| **Socket.IO** | WebSockets | Real-time communication |
| **Pydantic** | Data validation | Type-safe, automatic validation |
| **asyncio** | Task queue | Built-in Python async |

### Why These Choices?

✅ **No complex setup** — SQLite instead of PostgreSQL  
✅ **Free AI** — Groq has a generous free tier  
✅ **Fast development** — FastAPI auto-generates API docs  
✅ **Real-time** — Socket.IO for live updates  
✅ **Professional UI** — Monaco Editor = VS Code in browser  
✅ **Modern** — Latest versions of React and Python  

---

## 📂 Project Structure

```
Autonomous-Developer-Workspace/
│
├── apps/
│   ├── server-py/                    # Backend (Python)
│   │   ├── src/
│   │   │   ├── agents/               # AI agents
│   │   │   │   ├── runners/
│   │   │   │   │   ├── code_generator.py    # Writes code
│   │   │   │   │   ├── test_generator.py    # Writes tests
│   │   │   │   │   └── code_reviewer.py     # Reviews code
│   │   │   │   └── agent_dispatcher.py      # Runs agents
│   │   │   │
│   │   │   ├── modules/              # API endpoints
│   │   │   │   ├── ai/               # AI plan generation
│   │   │   │   ├── cicd/             # CI/CD pipeline
│   │   │   │   ├── files/            # File management
│   │   │   │   ├── projects/         # Project CRUD
│   │   │   │   ├── tasks/            # Task CRUD
│   │   │   │   └── observability/    # Logs & stats
│   │   │   │
│   │   │   ├── queue/                # Task queue
│   │   │   │   ├── queue.py          # Queue implementation
│   │   │   │   └── worker.py         # Job processor
│   │   │   │
│   │   │   └── lib/                  # Utilities
│   │   │       ├── config.py         # Environment config
│   │   │       ├── groq.py           # AI client
│   │   │       ├── socket.py         # WebSocket server
│   │   │       └── emitter.py        # Event emitter
│   │   │
│   │   ├── .env.example              # Environment template
│   │   ├── requirements.txt          # Python dependencies
│   │   └── run.py                    # Server entry point
│   │
│   └── web/                          # Frontend (React)
│       └── src/
│           ├── app/                  # Pages
│           │   ├── page.tsx          # Home
│           │   ├── graph/            # Task graph
│           │   ├── editor/           # Code editor
│           │   ├── deploy/           # CI/CD view
│           │   ├── observe/          # Dashboard
│           │   ├── projects/         # Project list
│           │   └── tasks/            # Task list
│           │
│           ├── components/           # React components
│           │   ├── graph/            # Graph components
│           │   ├── editor/           # Editor components
│           │   ├── cicd/             # Deploy components
│           │   └── observe/          # Dashboard components
│           │
│           └── lib/                  # Utilities
│               ├── api.ts            # API calls
│               ├── useSocket.ts      # WebSocket hook
│               └── motion.ts         # Animations
│
└── README.md                         # This file
```

---

## 🔐 Environment Variables

### Backend (.env)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `GROQ_API_KEY` | ✅ Yes | Your Groq API key | `gsk_...` |
| `FIREBASE_PROJECT_ID` | ✅ Yes | Firebase project ID | `my-project-123` |
| `FIREBASE_CLIENT_EMAIL` | ✅ Yes | Service account email | `firebase-adminsdk@...` |
| `FIREBASE_PRIVATE_KEY` | ✅ Yes | Service account key | `-----BEGIN PRIVATE KEY-----...` |
| `APP_ENV` | ❌ No | Environment | `development` |
| `PORT` | ❌ No | Server port | `4000` |
| `CORS_ORIGIN` | ❌ No | Allowed origin | `http://localhost:3000` |

### Frontend (.env.local)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | ✅ Yes | Backend URL | `http://localhost:4000` |

---

## 🎓 How to Use (Quick Start)

### 1. Describe Your Project
```
"Build a REST API for a todo app with user authentication, 
CRUD operations for tasks, and SQLite database"
```

### 2. Watch It Generate
- AI creates 6-8 tasks
- Each task gets code + tests + review
- Everything runs automatically

### 3. View the Code
- Go to Editor page
- See all generated files
- Edit if needed

### 4. Check Deployment
- Go to Deploy page
- See CI/CD pipeline results
- View test results

### 5. Download & Use
- All code is saved in the database
- Copy files to your project
- Run and customize as needed

---

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests
- Improve documentation

---

## 📄 License

MIT License — Copyright (c) 2025 Atharva Kanchan

---

## 🙋 FAQ

**Q: Do I need to know how to code?**  
A: No! Just describe what you want in plain English.

**Q: Is it really free?**  
A: Yes! Groq has a free tier, and SQLite is free.

**Q: Can I use the generated code in production?**  
A: Yes, but review it first. AI-generated code should be tested and validated.

**Q: What languages does it support?**  
A: Currently generates Python code. More languages coming soon!

**Q: Can I edit the generated code?**  
A: Yes! Use the built-in editor or download the files.

**Q: How accurate is the AI?**  
A: Pretty good! But always review the code before using it.

---

## 🌟 Star This Project

If you find this useful, please give it a ⭐ on GitHub!

**GitHub:** https://github.com/atharvakanchan25/Autonomous-Developer-Workspace

---

Made with ❤️ by [Atharva Kanchan](https://github.com/atharvakanchan25)
