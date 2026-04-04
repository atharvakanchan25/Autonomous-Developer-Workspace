# CI/CD + Docker + Jenkins — ADW Setup Guide

> This guide explains how the Autonomous Developer Workspace (ADW) is containerized with Docker, automated with Jenkins, and deployed via CI/CD pipeline.

---

## Table of Contents

- [Project Structure](#project-structure)
- [How It Works](#how-it-works)
- [Docker Setup](#docker-setup)
- [Jenkins Setup](#jenkins-setup)
- [Running the Project](#running-the-project)
- [Workflow — Code to Deployment](#workflow--code-to-deployment)
- [Ports Reference](#ports-reference)
- [Troubleshooting](#troubleshooting)

---

## Project Structure

```
Autonomous-Developer-Workspace/
│
├── apps/
│   ├── server-py/              Backend (Python / FastAPI)
│   │   ├── Dockerfile          How to build backend container
│   │   ├── .dockerignore       Files to exclude from Docker build
│   │   ├── .env                Credentials (Groq API + Firebase)
│   │   └── src/                Backend source code
│   │
│   └── web/                    Frontend (Next.js / React)
│       ├── Dockerfile          How to build frontend container
│       ├── .dockerignore       Files to exclude from Docker build
│       ├── .env.local          Firebase frontend credentials
│       └── src/                Frontend source code
│
├── docker-compose.yml          Runs both containers together
├── Jenkinsfile                 Jenkins pipeline instructions
└── CICD_DOCKER_README.md       This file
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│                      YOUR MACHINE                        │
│                                                          │
│   ┌─────────────┐        ┌──────────────────────────┐   │
│   │   Jenkins   │        │      Docker Desktop       │   │
│   │             │        │                           │   │
│   │ localhost   │        │   ┌───────────────────┐   │   │
│   │   :8081     │        │   │   adw-frontend    │   │   │
│   │             │─Build─▶│   │   localhost:3000  │   │   │
│   │ Jenkinsfile │        │   └─────────┬─────────┘   │   │
│   │  pipeline   │        │             │              │   │
│   └─────────────┘        │   ┌─────────▼─────────┐   │   │
│                           │   │   adw-backend     │   │   │
│                           │   │   localhost:4000  │   │   │
│                           │   └─────────┬─────────┘   │   │
│                           └─────────────┼─────────────┘   │
└─────────────────────────────────────────┼─────────────────┘
                                          │
                              ┌───────────▼───────────┐
                              │   Firebase Firestore   │
                              │     Cloud Database     │
                              │                        │
                              │  Users, Projects,      │
                              │  Tasks, Audit Logs,    │
                              │  Agent Runs            │
                              └───────────────────────┘
```

---

## Docker Setup

### Prerequisites
- Docker Desktop installed and running
- `.env` file in `apps/server-py/`
- `.env.local` file in `apps/web/`

### Files

**`apps/server-py/Dockerfile`** — Builds the Python backend
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 4000
CMD ["python", "run.py"]
```

**`apps/web/Dockerfile`** — Builds the Next.js frontend
- Uses multi-stage build (deps → builder → runner)
- Bakes `NEXT_PUBLIC_API_URL=http://localhost:4000` at build time
- Uses Next.js standalone output for smaller image size

**`docker-compose.yml`** — Runs both containers together
- Backend on port `4000`
- Frontend on port `3000`
- Both connected to `devops-app_default` network (shared with Jenkins)
- Backend reads credentials from `.env` file

### Build and Run

```bash
# Build and start both containers
docker-compose up -d --build

# Start already built containers
docker-compose up -d

# Stop containers
docker-compose down

# View logs
docker logs adw-backend
docker logs adw-frontend

# Check running containers
docker ps
```

---

## Jenkins Setup

### Prerequisites
- Jenkins running at `http://localhost:8081`
- GitHub credentials configured in Jenkins as `github-credentials`
- Docker available inside Jenkins container

### Jenkinsfile Pipeline Stages

```
Checkout → Deploy → Health Check
```

| Stage | What it does |
|---|---|
| Checkout | Pulls latest code from GitHub branch |
| Deploy | Stops old containers, starts new ones from pre-built images |
| Health Check | Waits 8 seconds, checks backend is running |

### Connect Jenkins to GitHub

1. Go to `http://localhost:8081`
2. New Item → Pipeline → Name it `ADW`
3. Pipeline → Pipeline script from SCM
4. SCM → Git
5. Repository URL → `https://github.com/atharvakanchan25/Autonomous-Developer-Workspace`
6. Credentials → `github-credentials`
7. Branch → `*/feature/cicd-logs-and-docker`
8. Script Path → `Jenkinsfile`
9. Save

### Run Pipeline

1. Go to `http://localhost:8081`
2. Click `ADW`
3. Click `Build Now`
4. Watch the pipeline run in real time

---

## Running the Project

### Option 1 — Docker (Recommended for production/demo)

```bash
# Build images and start containers
docker-compose up -d --build

# Open browser
http://localhost:3000
```

### Option 2 — Manual (Recommended for development)

```bash
# Terminal 1 — Backend
cd apps/server-py
.venv\Scripts\activate          # Windows
.venv\Scripts\python.exe run.py

# Terminal 2 — Frontend
cd apps/web
npm run dev

# Open browser
http://localhost:3000
```

> Note: You cannot run Docker and Manual at the same time on the same ports.
> Stop Docker first with `docker-compose down` before running manually.

---

## Workflow — Code to Deployment

```
Step 1 — Make your code changes locally

Step 2 — Test locally with npm run dev

Step 3 — Push to GitHub
    git add .
    git commit -m "your message"
    git push origin feature/cicd-logs-and-docker

Step 4 — Rebuild Docker images with latest code
    docker-compose down
    docker-compose up -d --build

Step 5 — OR trigger Jenkins to redeploy
    Go to localhost:8081 → ADW → Build Now
    Jenkins stops old containers and starts new ones

Step 6 — Open browser
    http://localhost:3000
    Latest version is live
```

---

## Ports Reference

| Service | URL | Description |
|---|---|---|
| Frontend | http://localhost:3000 | Main web interface |
| Backend API | http://localhost:4000 | Python FastAPI server |
| API Docs | http://localhost:4000/docs | Interactive API documentation |
| Health Check | http://localhost:4000/health | Server status |
| Jenkins | http://localhost:8081 | CI/CD pipeline dashboard |

---

## Environment Variables

### Backend — `apps/server-py/.env`

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | Groq AI API key |
| `FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Yes | Firebase service account email |
| `FIREBASE_PRIVATE_KEY` | Yes | Firebase private key |
| `ADMIN_EMAILS` | Yes | Comma separated admin emails |
| `PORT` | No | Server port (default 4000) |
| `CORS_ORIGIN` | No | Allowed origin (default localhost:3000) |

### Frontend — `apps/web/.env.local`

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | Backend URL (http://localhost:4000) |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes | Firebase web API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes | Firebase auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes | Firebase project ID |

---

## Troubleshooting

### Port already in use
```bash
# Find what is using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID with actual number)
taskkill /PID <PID> /F

# Then start Docker
docker-compose up -d
```

### Backend container not starting
```bash
# Check logs
docker logs adw-backend

# Common cause: missing .env file
# Make sure apps/server-py/.env exists with all credentials
```

### Admin dashboard showing empty data
- Make sure you are logged in with an admin email
- Log out and log back in to refresh your role token
- Check backend logs: `docker logs adw-backend`

### Jenkins build failing
- Make sure Docker images are built first: `docker-compose up -d --build`
- Jenkins uses pre-built images — it does not rebuild from scratch
- Check Jenkins console output for specific error

### Frontend not connecting to backend
- The frontend Docker image bakes `http://localhost:4000` at build time
- If you change the backend URL, you must rebuild the frontend image
- Run: `docker-compose up -d --build frontend`

---

## Quick Commands Reference

```bash
# Start everything
docker-compose up -d

# Start with fresh build
docker-compose up -d --build

# Stop everything
docker-compose down

# View backend logs
docker logs adw-backend -f

# View frontend logs
docker logs adw-frontend -f

# Restart only backend
docker restart adw-backend

# Check all containers
docker ps

# Jenkins deploy
# Go to localhost:8081 → ADW → Build Now
```

---

## Branch

All CI/CD and Docker work is on branch:
```
feature/cicd-logs-and-docker
```

---

Made with by Varad Mandhare
