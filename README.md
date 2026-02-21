# Real-Time Collaborative Task Board

A Kanban-style task board with real-time synchronization, conflict resolution, and offline support.

## Features

- **Three-column Kanban board**: To Do, In Progress, Done
- **Real-time collaboration**: Changes sync across all clients within 200ms
- **Drag-and-drop**: Smooth task movement with dnd-kit
- **Conflict resolution**: Handles concurrent edits, moves, and reorders
- **Offline support**: Queue operations when disconnected, replay on reconnect
- **Multi-user presence**: See who's online and what they're editing
- **Optimistic UI**: Instant feedback with server reconciliation

## Tech Stack

- **Backend**: Node.js, Express, TypeScript, WebSocket (ws)
- **Frontend**: React 18, TypeScript, Zustand, dnd-kit, Tailwind CSS
- **Database**: PostgreSQL
- **Containerization**: Docker, Docker Compose

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local development)

### Using Docker (Recommended)

```bash
# Clone the repository
git clone <repository-url>
cd collaborative-task-board

# Start all services
docker compose up

# The app will be available at:
# - Frontend: http://localhost:5173
# - Backend API: http://localhost:3001
# - WebSocket: ws://localhost:3001/ws
```

### Local Development

```bash
# Install root dependencies
npm install

# Start PostgreSQL with Docker
docker compose up postgres -d

# Install dependencies for backend and frontend
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# Run database migrations
npm run db:migrate

# Start development servers
npm run dev

# Or start individually:
npm run dev:backend  # Backend on port 3001
npm run dev:frontend # Frontend on port 5173
```

## Project Structure

```
├── backend/
│   ├── src/
│   │   ├── db/              # Database connection and migrations
│   │   ├── handlers/        # WebSocket message handlers
│   │   ├── services/        # Business logic
│   │   ├── types/           # TypeScript types
│   │   ├── utils/           # Utilities (fractional indexing)
│   │   └── index.ts         # Server entry point
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── hooks/           # Custom hooks (WebSocket)
│   │   ├── store/           # Zustand store
│   │   └── types/           # TypeScript types
│   └── Dockerfile
├── docker-compose.yml
├── DESIGN.md               # Architecture and design decisions
└── README.md
```

## Running Tests

```bash
# Run all tests
npm test

# Run with server for integration tests
# Terminal 1:
npm run dev

# Terminal 2:
npm run test:backend
```

## API Endpoints

### REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/tasks` | Get all tasks |
| POST | `/api/tasks` | Create a task |

### WebSocket Messages

| Type | Direction | Description |
|------|-----------|-------------|
| `sync:full` | Server → Client | Initial state sync |
| `sync:ack` | Server → Client | Operation acknowledgment |
| `task:create` | Bidirectional | Create task |
| `task:update` | Bidirectional | Update task |
| `task:move` | Bidirectional | Move task |
| `task:delete` | Bidirectional | Delete task |
| `conflict:notification` | Server → Client | Conflict detected |
| `presence:update` | Server → Client | User presence update |
| `user:join` | Server → Client | User connected |
| `user:leave` | Server → Client | User disconnected |

## Deployment

### Live Demo

**Frontend**: [https://your-app.vercel.app](https://your-app.vercel.app)
**Backend**: [https://your-backend.railway.app](https://your-backend.railway.app)

> Note: Free tier deployments may have cold starts of 10-30 seconds after inactivity.

### Deploy to Railway

1. Fork this repository
2. Create a new project on [Railway](https://railway.app)
3. Add a PostgreSQL database
4. Deploy the backend:
   - Connect your GitHub repo
   - Set root directory to `backend`
   - Add environment variable: `DATABASE_URL` (from Railway PostgreSQL)
5. Deploy the frontend:
   - Create a new service
   - Set root directory to `frontend`
   - Add environment variable: `VITE_WS_URL=wss://your-backend.railway.app/ws`

### Environment Variables

**Backend**:
```env
DATABASE_URL=postgresql://user:pass@host:5432/dbname
PORT=3001
CORS_ORIGIN=http://localhost:5173
NODE_ENV=production
```

**Frontend**:
```env
VITE_WS_URL=ws://localhost:3001/ws
VITE_API_URL=http://localhost:3001
```

## Architecture Highlights

### Conflict Resolution

- **Version-based concurrency control**: Each task has a version number
- **First-write-wins**: Concurrent operations resolve deterministically
- **User notification**: Losing user gets notified with current state

### O(1) Task Ordering

Uses fractional indexing to avoid re-indexing on every move:
- Insert between positions "A" and "Z" → "M"
- Insert between "A" and "M" → "G"
- Positions extend only when necessary

### Offline Support

- Operations queue locally when disconnected
- Visual indicator shows pending operations
- On reconnect, operations replay against server state
- Conflicts handled the same as online conflicts

## Design Document

See [DESIGN.md](./DESIGN.md) for detailed documentation of:
- Conflict resolution strategies
- Ordering algorithm
- WebSocket protocol
- Database design
- Trade-offs and future improvements

## Demo Video

[Link to 2-3 minute screen recording demonstrating:]
- Two browser tabs making simultaneous edits
- Network disconnect and reconnect scenario
- Final consistent state

## License

MIT
