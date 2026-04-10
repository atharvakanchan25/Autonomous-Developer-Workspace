# Docker & Jenkins Setup Guide

This guide explains how to run the ADW project using Docker and Jenkins CI/CD.

---

## Prerequisites

Make sure the following are installed on your server:

- Docker
- Docker Compose v2
- Jenkins (with Docker access)

---

## Running with Docker (Quick Start)

### 1. Clone the repository

```bash
git clone https://github.com/atharvakanchan25/Autonomous-Developer-Workspace.git
cd Autonomous-Developer-Workspace
git checkout feature/varad-cicd-docker-main
```

### 2. Create the external Docker network (one time only)

```bash
docker network create devops-app_default
```

> Skip this if the network already exists. You will see an error saying "network with name devops-app_default already exists" — that is fine.

### 3. Set up your environment file

```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:

```env
GROQ_API_KEY=your-groq-api-key
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"
ADMIN_EMAILS=your@email.com
APP_ENV=production
PORT=4000
CORS_ORIGIN=http://localhost:3000
```

### 4. Build and run

```bash
docker compose up --build -d
```

### 5. Access the app

| Service  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost:3000       |
| Backend  | http://localhost:4000       |
| API Docs | http://localhost:4000/docs  |

### Useful commands

```bash
docker compose logs -f              # tail all logs
docker compose logs -f backend      # backend logs only
docker compose down                 # stop containers
docker compose up --build -d        # rebuild and restart
docker compose restart backend      # restart backend only
```

---

## Running via Jenkins CI/CD

Jenkins automates the full build and deploy process on every manual trigger.

### Pipeline stages

| Stage        | What it does                                      |
|--------------|---------------------------------------------------|
| Checkout     | Pulls latest code from GitHub branch              |
| Build        | Builds backend and frontend Docker images         |
| Deploy       | Removes old containers and starts new ones        |
| Health Check | Waits 10 seconds and checks backend is running    |

### Setting up the Jenkins job

1. Go to Jenkins → **New Item** → **Pipeline** → name it `ADW`
2. Under **Pipeline** section:
   - Definition: `Pipeline script from SCM`
   - SCM: `Git`
   - Repository URL: `https://github.com/atharvakanchan25/Autonomous-Developer-Workspace.git`
   - Branch: `*/feature/varad-cicd-docker-main`
   - Script Path: `Jenkinsfile`
3. Save

### Before first build

Make sure the `.env` file exists in the Jenkins workspace:

```bash
# Run this on the server where Jenkins is running
docker exec -it jenkins bash
cp /var/jenkins_home/workspace/ADW/.env.example /var/jenkins_home/workspace/ADW/.env
# Then edit the .env with your credentials
```

Or copy it directly from your machine:

```bash
docker cp .env jenkins:/var/jenkins_home/workspace/ADW/.env
```

### Trigger a build

Click **Build Now** in Jenkins. The pipeline will:
1. Pull latest code from GitHub
2. Build both Docker images
3. Stop old containers and start new ones
4. Run a health check

### After successful build

- Frontend: `http://<server-ip>:3000`
- Backend: `http://<server-ip>:4000`

---

## Project Structure (Docker)

```
Dockerfile.backend     # Python 3.12 backend image
Dockerfile.frontend    # Node 18 multi-stage frontend image
docker-compose.yml     # Defines backend + frontend services
Jenkinsfile            # CI/CD pipeline definition
.env.example           # Environment variable template
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `network devops-app_default not found` | Run `docker network create devops-app_default` |
| `.env not found` error in Jenkins | Copy `.env` into Jenkins workspace (see above) |
| Container name conflict | Run `docker rm -f adw-backend adw-frontend` then retry |
| Port already in use | Check `docker ps` and stop conflicting containers |
| Build fails on pip install | Check internet connectivity on the server |
