import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import { createWebSocketHandler } from './handlers/wsHandler.js';
import * as taskService from './services/taskService.js';
import { runMigrations } from './db/migrate.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// REST API endpoints (for initial load and fallback)
app.get('/api/tasks', async (_, res) => {
  const result = await taskService.getAllTasks();
  if (result.success) {
    res.json(result.data);
  } else {
    res.status(500).json({ error: result.error });
  }
});

app.post('/api/tasks', async (req, res) => {
  const result = await taskService.createTask(req.body);
  if (result.success) {
    res.status(201).json(result.data);
  } else if (result.error) {
    res.status(400).json({ error: result.error });
  } else {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({
  server,
  path: '/ws',
});

// Initialize WebSocket handler
const wsHandler = createWebSocketHandler(wss);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  wsHandler.destroy();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  wsHandler.destroy();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Run migrations and start server
runMigrations()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
      console.log(`REST API: http://localhost:${PORT}/api`);
    });
  })
  .catch((err) => {
    console.error('Failed to run migrations:', err);
    process.exit(1);
  });
