# Autonomous Developer Workspace

AI-powered development platform that generates code, tests, and deploys automatically.

## 📁 Project Structure

```
Autonomous-Developer-Workspace/
├── frontend/              # React/Next.js web application
│   ├── src/
│   │   ├── app/          # Next.js pages
│   │   ├── components/   # React components
│   │   └── lib/          # Utilities & API client
│   └── package.json
│
├── backend/              # Python FastAPI server
│   ├── api/             # REST API endpoints
│   │   ├── projects/    # Project management
│   │   ├── tasks/       # Task management
│   │   ├── files/       # File operations
│   │   ├── cicd/        # CI/CD pipeline
│   │   ├── ai/          # AI plan generation
│   │   ├── admin/       # Admin operations
│   │   └── observability/ # Logs & monitoring
│   ├── core/            # Core utilities
│   │   ├── config.py    # Configuration
│   │   ├── database.py  # Firestore client
│   │   └── logger.py    # Logging
│   ├── auth/            # Firebase authentication
│   ├── realtime/        # Socket.IO server
│   ├── queue/           # Task queue & worker
│   ├── lib/             # MCP server
│   ├── main.py          # FastAPI app
│   ├── run.py           # Server entry point
│   └── requirements.txt
│
├── ai-services/         # AI agents & LLM logic
│   └── agents/
│       ├── runners/     # Agent implementations
│       │   ├── code_generator.py
│       │   ├── test_generator.py
│       │   ├── code_reviewer.py
│       │   └── scaffold_agent.py
│       ├── agent_dispatcher.py
│       ├── langgraph_pipeline.py
│       └── agent_service.py
│
├── database/            # Firebase/Firestore configs
│   ├── firestore.indexes.json
│   ├── firebase.env.example
│   └── README.md
│
└── shared/              # Shared documentation
    └── README.md
```

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- Firebase account
- Groq API key

### 1. Clone & Setup
```bash
# Install Python dependencies
python -m venv .venv
.venv\Scripts\activate  # Windows
pip install -r requirements.txt

# Install Frontend dependencies
cd frontend
npm install
cd ..
```

### 2. Configure Environment
Edit `.env` in project root:
```env
GROQ_API_KEY=your-groq-api-key
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n
```

### 3. Deploy Database Indexes
```bash
cd database
firebase deploy --only firestore:indexes
cd ..
```

### 4. Run Services

**Backend:**
```bash
python run_backend.py
```

**Frontend (new terminal):**
```bash
cd frontend
npm run dev
```

## 🌐 Access

- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- API Docs: http://localhost:4000/docs

## 🏗️ Architecture

### Data Flow
```
User → Frontend → Backend API → AI Services → Firestore (Cloud)
                      ↓
                 Socket.IO (Real-time updates)
```

### Key Features
- ✅ Cloud-based (Firebase Firestore)
- ✅ Real-time sync across users
- ✅ AI-powered code generation
- ✅ Automated testing & review
- ✅ CI/CD pipeline simulation
- ✅ Multi-user support with RBAC

## 📚 Documentation

- [Database Setup](database/README.md)
- [AI Services](ai-services/README.md)
- [API Documentation](http://localhost:4000/docs)

## 🔐 Security

- Firebase Authentication
- Role-based access control (Admin/User)
- API rate limiting
- Audit logging

## 📄 License

MIT License - Copyright (c) 2025 Atharva Kanchan
