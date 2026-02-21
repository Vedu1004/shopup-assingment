import { WebSocket, WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { WSMessage, WSMessageType, Task, User } from '../types/index.js';
import * as taskService from '../services/taskService.js';
import { presenceService } from '../services/presenceService.js';
import { calculateMovePosition } from '../services/taskService.js';

interface ExtendedWebSocket extends WebSocket {
  clientId: string;
  isAlive: boolean;
}

class WebSocketHandler {
  private wss: WebSocketServer;
  private clients: Map<string, ExtendedWebSocket> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(wss: WebSocketServer) {
    this.wss = wss;
    this.setupHeartbeat();
    this.wss.on('connection', this.handleConnection.bind(this));
  }

  /**
   * Setup heartbeat to detect dead connections
   */
  private setupHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((ws, clientId) => {
        if (!ws.isAlive) {
          this.handleDisconnect(clientId);
          ws.terminate();
          return;
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket): void {
    const extWs = ws as ExtendedWebSocket;
    extWs.clientId = uuidv4();
    extWs.isAlive = true;

    this.clients.set(extWs.clientId, extWs);

    // Add user to presence
    const user = presenceService.addUser(extWs.clientId);

    console.log(`Client connected: ${user.name} (${extWs.clientId})`);

    // Setup event handlers
    extWs.on('pong', () => {
      extWs.isAlive = true;
      presenceService.updateLastSeen(extWs.clientId);
    });

    extWs.on('message', (data) => {
      this.handleMessage(extWs, data.toString());
    });

    extWs.on('close', () => {
      this.handleDisconnect(extWs.clientId);
    });

    extWs.on('error', (error) => {
      console.error(`WebSocket error for ${extWs.clientId}:`, error);
      this.handleDisconnect(extWs.clientId);
    });

    // Send initial sync
    this.sendInitialSync(extWs);

    // Notify others of new user
    this.broadcastExcept(extWs.clientId, {
      type: 'user:join',
      payload: user,
      clientId: 'server',
      timestamp: Date.now(),
      messageId: uuidv4(),
    });
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(clientId: string): void {
    const user = presenceService.removeUser(clientId);
    this.clients.delete(clientId);

    if (user) {
      console.log(`Client disconnected: ${user.name} (${clientId})`);

      // Notify others
      this.broadcast({
        type: 'user:leave',
        payload: { userId: clientId, userName: user.name },
        clientId: 'server',
        timestamp: Date.now(),
        messageId: uuidv4(),
      });
    }
  }

  /**
   * Send initial sync with all tasks and users
   */
  private async sendInitialSync(ws: ExtendedWebSocket): Promise<void> {
    const tasksResult = await taskService.getAllTasks();
    const users = presenceService.getAllUsers();

    this.sendToClient(ws.clientId, {
      type: 'sync:full',
      payload: {
        tasks: tasksResult.data || [],
        users,
        yourId: ws.clientId,
        yourUser: presenceService.getUser(ws.clientId),
      },
      clientId: 'server',
      timestamp: Date.now(),
      messageId: uuidv4(),
    });
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(ws: ExtendedWebSocket, rawData: string): Promise<void> {
    let message: WSMessage;

    try {
      message = JSON.parse(rawData);
    } catch {
      this.sendError(ws.clientId, 'Invalid JSON message');
      return;
    }

    presenceService.updateLastSeen(ws.clientId);

    // Route message to appropriate handler
    switch (message.type) {
      case 'task:create':
        await this.handleTaskCreate(ws.clientId, message);
        break;
      case 'task:update':
        await this.handleTaskUpdate(ws.clientId, message);
        break;
      case 'task:move':
        await this.handleTaskMove(ws.clientId, message);
        break;
      case 'task:delete':
        await this.handleTaskDelete(ws.clientId, message);
        break;
      case 'presence:editing':
        this.handlePresenceEditing(ws.clientId, message);
        break;
      default:
        this.sendError(ws.clientId, `Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle task creation
   */
  private async handleTaskCreate(clientId: string, message: WSMessage): Promise<void> {
    const result = await taskService.createTask(message.payload);

    if (result.success && result.data) {
      // Send acknowledgment to sender
      this.sendToClient(clientId, {
        type: 'sync:ack',
        payload: {
          messageId: message.messageId,
          task: result.data,
        },
        clientId: 'server',
        timestamp: Date.now(),
        messageId: uuidv4(),
      });

      // Broadcast to others
      this.broadcastExcept(clientId, {
        type: 'task:create',
        payload: result.data,
        clientId,
        timestamp: Date.now(),
        messageId: uuidv4(),
      });
    } else {
      this.sendError(clientId, result.error || 'Failed to create task', message.messageId);
    }
  }

  /**
   * Handle task update
   */
  private async handleTaskUpdate(clientId: string, message: WSMessage): Promise<void> {
    const result = await taskService.updateTask(message.payload);

    if (result.success && result.data) {
      // Send acknowledgment
      this.sendToClient(clientId, {
        type: 'sync:ack',
        payload: {
          messageId: message.messageId,
          task: result.data,
        },
        clientId: 'server',
        timestamp: Date.now(),
        messageId: uuidv4(),
      });

      // Broadcast to others
      this.broadcastExcept(clientId, {
        type: 'task:update',
        payload: result.data,
        clientId,
        timestamp: Date.now(),
        messageId: uuidv4(),
      });
    } else if (result.conflict) {
      // Send conflict notification
      this.sendToClient(clientId, {
        type: 'conflict:notification',
        payload: {
          messageId: message.messageId,
          conflict: result.conflict,
        },
        clientId: 'server',
        timestamp: Date.now(),
        messageId: uuidv4(),
      });
    } else {
      this.sendError(clientId, result.error || 'Failed to update task', message.messageId);
    }
  }

  /**
   * Handle task move
   */
  private async handleTaskMove(clientId: string, message: WSMessage): Promise<void> {
    const payload = message.payload as {
      id: string;
      column: string;
      targetIndex: number;
      version: number;
    };

    // Calculate position from target index
    const position = await calculateMovePosition(
      payload.column as Task['column'],
      payload.targetIndex
    );

    const moveInput = {
      id: payload.id,
      column: payload.column,
      position,
      version: payload.version,
    };

    const result = await taskService.moveTask(moveInput);

    if (result.success && result.data) {
      // Send acknowledgment
      this.sendToClient(clientId, {
        type: 'sync:ack',
        payload: {
          messageId: message.messageId,
          task: result.data,
        },
        clientId: 'server',
        timestamp: Date.now(),
        messageId: uuidv4(),
      });

      // Broadcast to others
      this.broadcastExcept(clientId, {
        type: 'task:move',
        payload: result.data,
        clientId,
        timestamp: Date.now(),
        messageId: uuidv4(),
      });
    } else if (result.conflict) {
      // Send conflict notification with current task state
      this.sendToClient(clientId, {
        type: 'conflict:notification',
        payload: {
          messageId: message.messageId,
          conflict: result.conflict,
          operation: 'move',
        },
        clientId: 'server',
        timestamp: Date.now(),
        messageId: uuidv4(),
      });

      // Also send the current task state to ensure client is in sync
      if (result.conflict.currentTask) {
        this.sendToClient(clientId, {
          type: 'task:move',
          payload: result.conflict.currentTask,
          clientId: 'server',
          timestamp: Date.now(),
          messageId: uuidv4(),
        });
      }
    } else {
      this.sendError(clientId, result.error || 'Failed to move task', message.messageId);
    }
  }

  /**
   * Handle task delete
   */
  private async handleTaskDelete(clientId: string, message: WSMessage): Promise<void> {
    const result = await taskService.deleteTask(message.payload);

    if (result.success && result.data) {
      // Send acknowledgment
      this.sendToClient(clientId, {
        type: 'sync:ack',
        payload: {
          messageId: message.messageId,
          taskId: result.data.id,
        },
        clientId: 'server',
        timestamp: Date.now(),
        messageId: uuidv4(),
      });

      // Broadcast to others
      this.broadcastExcept(clientId, {
        type: 'task:delete',
        payload: { id: result.data.id },
        clientId,
        timestamp: Date.now(),
        messageId: uuidv4(),
      });
    } else if (result.conflict) {
      this.sendToClient(clientId, {
        type: 'conflict:notification',
        payload: {
          messageId: message.messageId,
          conflict: result.conflict,
        },
        clientId: 'server',
        timestamp: Date.now(),
        messageId: uuidv4(),
      });
    } else {
      this.sendError(clientId, result.error || 'Failed to delete task', message.messageId);
    }
  }

  /**
   * Handle presence editing update
   */
  private handlePresenceEditing(clientId: string, message: WSMessage): void {
    const { taskId } = message.payload as { taskId?: string };
    presenceService.setEditing(clientId, taskId);

    // Broadcast presence update
    this.broadcast({
      type: 'presence:update',
      payload: {
        users: presenceService.getAllUsers(),
      },
      clientId: 'server',
      timestamp: Date.now(),
      messageId: uuidv4(),
    });
  }

  /**
   * Send message to specific client
   */
  private sendToClient(clientId: string, message: WSMessage): void {
    const client = this.clients.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast message to all clients
   */
  private broadcast(message: WSMessage): void {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  /**
   * Broadcast message to all clients except one
   */
  private broadcastExcept(excludeClientId: string, message: WSMessage): void {
    const data = JSON.stringify(message);
    this.clients.forEach((client, clientId) => {
      if (clientId !== excludeClientId && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  /**
   * Send error message to client
   */
  private sendError(clientId: string, error: string, originalMessageId?: string): void {
    this.sendToClient(clientId, {
      type: 'error',
      payload: {
        error,
        originalMessageId,
      },
      clientId: 'server',
      timestamp: Date.now(),
      messageId: uuidv4(),
    });
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.clients.forEach((client) => {
      client.close();
    });
    this.clients.clear();
    presenceService.destroy();
  }
}

export function createWebSocketHandler(wss: WebSocketServer): WebSocketHandler {
  return new WebSocketHandler(wss);
}
