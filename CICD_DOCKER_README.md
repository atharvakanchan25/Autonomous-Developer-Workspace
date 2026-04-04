# CI/CD + Docker + Jenkins — ADW Setup Guide

> Complete guide for Docker containerization, Jenkins CI/CD pipeline and deployment.

---

## Project Structure

```
Autonomous-Developer-Workspace/
├── backend/                    Python / FastAPI backend
├── frontend/                   Next.js frontend
├── ai-services/                AI Agents
├── Dockerfile.backend          Backend container build
├── Dockerfile.frontend         Frontend container build
├── docker-compose.yml          Run full stack together
├── Jenkinsfile                 Jenkins pipeline
├── server.py                   Backend entry point
├── requirements.txt            Python dependencies
└── CICD_DOCKER_README.md       This file
```

---

## How It Works

```
GitHub → Jenkins → Docker → Firebase Firestore
                      ↓
              adw-backend  :4000
              adw-frontend :3000
```

---

## Quick Start

### Run with Docker
```bash
docker-compose up -d --build
```
Open → http://localhost:3000

### Run Manually (Development)
```bash
# Terminal 1 - Backend
python server.py

# Terminal 2 - Frontend
cd frontend
npm run dev
```

---

## Environment Variables

Create `.env` at project root:
```env
APP_ENV=development
PORT=4000
GROQ_API_KEY=your-groq-api-key
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"
ADMIN_EMAILS=admin@example.com
CORS_ORIGIN=http://localhost:3000
```

Create `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_FIREBASE_API_KEY=your-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
```

---

## Jenkins Setup

1. Go to http://localhost:8081
2. New Item → Pipeline → Name: `ADW`
3. Pipeline from SCM → Git
4. Repo: `https://github.com/atharvakanchan25/Autonomous-Developer-Workspace`
5. Branch: `*/main`
6. Script Path: `Jenkinsfile`
7. Save → Build Now

---

## Ports

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:4000 |
| API Docs | http://localhost:4000/docs |
| Jenkins | http://localhost:8081 |

---

## Docker Commands

```bash
docker-compose up -d --build    # Build and start
docker-compose down             # Stop
docker logs adw-backend -f      # Backend logs
docker logs adw-frontend -f     # Frontend logs
docker ps                       # Check containers
```

---

## Troubleshooting

**Port in use**
```bash
netstat -ano | findstr :3000
taskkill /PID <PID> /F
docker-compose up -d
```

**Backend not starting** — check `.env` exists at project root

**Admin dashboard empty** — log out and log back in

---

Made by Varad Mandhare
