import { useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useTaskStore } from '../store/taskStore';
import { Task, Column, WSMessage, SyncState } from '../types';

const getWebSocketURL = () => {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  // Auto-detect protocol based on page protocol
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (import.meta.env.VITE_API_URL) {
    const host = new URL(import.meta.env.VITE_API_URL).host;
    return `${protocol}//${host}/ws`;
  }
  // Local development fallback
  return `${protocol}//${window.location.hostname}:${window.location.port || '3001'}/ws`;
};

const WS_URL = getWebSocketURL();
const RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectDelayRef = useRef(RECONNECT_DELAY);

  const {
    setTasks,
    addTask,
    updateTask,
    removeTask,
    setUsers,
    addUser,
    removeUser,
    updateUserPresence,
    setCurrentUser,
    setConnectionStatus,
    connectionStatus,
    addConflict,
    removeFromQueue,
    addToQueue,
    resolvePendingOperation,
    revertPendingOperation,
  } = useTaskStore();

  const sendMessage = useCallback((message: Omit<WSMessage, 'clientId' | 'timestamp' | 'messageId'>) => {
    const fullMessage: WSMessage = {
      ...message,
      clientId: useTaskStore.getState().currentUserId || 'unknown',
      timestamp: Date.now(),
      messageId: uuidv4(),
    };

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(fullMessage));
      return fullMessage.messageId;
    } else {
      // Queue for offline
      addToQueue({
        type: message.type as 'create' | 'update' | 'move' | 'delete',
        payload: fullMessage,
      });
      return fullMessage.messageId;
    }
  }, [addToQueue]);

  const handleMessage = useCallback((event: MessageEvent) => {
    const message: WSMessage = JSON.parse(event.data);

    switch (message.type) {
      case 'sync:full': {
        const syncState = message.payload as SyncState;
        setTasks(syncState.tasks);
        setUsers(syncState.users);
        setCurrentUser(syncState.yourId, syncState.yourUser);
        break;
      }

      case 'sync:ack': {
        const { messageId, task } = message.payload as { messageId: string; task?: Task };
        resolvePendingOperation(messageId);
        if (task) {
          // Check if task exists - if not, add it (for newly created tasks)
          const existingTask = useTaskStore.getState().getTaskById(task.id);
          if (existingTask) {
            updateTask(task);
          } else {
            addTask(task);
          }
        }
        break;
      }

      case 'task:create': {
        const task = message.payload as Task;
        addTask(task);
        break;
      }

      case 'task:update': {
        const task = message.payload as Task;
        updateTask(task);
        break;
      }

      case 'task:move': {
        const task = message.payload as Task;
        updateTask(task);
        break;
      }

      case 'task:delete': {
        const { id } = message.payload as { id: string };
        removeTask(id);
        break;
      }

      case 'user:join': {
        const user = message.payload as { id: string; name: string; color: string };
        addUser({ ...user, lastSeen: Date.now() });
        break;
      }

      case 'user:leave': {
        const { userId } = message.payload as { userId: string };
        removeUser(userId);
        break;
      }

      case 'presence:update': {
        const { users } = message.payload as { users: SyncState['users'] };
        updateUserPresence(users);
        break;
      }

      case 'conflict:notification': {
        const { messageId, conflict } = message.payload as {
          messageId: string;
          conflict: { type: string; message: string; currentTask?: Task };
        };
        revertPendingOperation(messageId);
        addConflict({
          type: conflict.type as 'version_mismatch' | 'concurrent_move' | 'concurrent_edit',
          message: conflict.message,
        });
        // Update with server's current state
        if (conflict.currentTask) {
          updateTask(conflict.currentTask);
        }
        break;
      }

      case 'error': {
        const { error, originalMessageId } = message.payload as {
          error: string;
          originalMessageId?: string;
        };
        console.error('Server error:', error);
        if (originalMessageId) {
          revertPendingOperation(originalMessageId);
        }
        break;
      }
    }
  }, [
    setTasks,
    addTask,
    updateTask,
    removeTask,
    setUsers,
    addUser,
    removeUser,
    updateUserPresence,
    setCurrentUser,
    resolvePendingOperation,
    revertPendingOperation,
    addConflict,
  ]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionStatus('reconnecting');

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnectionStatus('connected');
      reconnectDelayRef.current = RECONNECT_DELAY;

      // Replay offline queue
      const queue = useTaskStore.getState().offlineQueue;
      queue.forEach((operation) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(operation.payload));
          removeFromQueue(operation.id);
        }
      });
    };

    ws.onmessage = handleMessage;

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnectionStatus('disconnected');

      // Attempt reconnect with exponential backoff
      reconnectTimeoutRef.current = window.setTimeout(() => {
        reconnectDelayRef.current = Math.min(
          reconnectDelayRef.current * 2,
          MAX_RECONNECT_DELAY
        );
        connect();
      }, reconnectDelayRef.current);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, [handleMessage, setConnectionStatus, removeFromQueue]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Task operations
  const createTask = useCallback((title: string, description: string = '', column: Column = 'todo') => {
    const messageId = sendMessage({
      type: 'task:create',
      payload: { title, description, column },
    });
    return messageId;
  }, [sendMessage]);

  const editTask = useCallback((task: Task, title: string, description: string) => {
    const store = useTaskStore.getState();
    const originalTask = store.getTaskById(task.id);

    // Optimistic update
    const optimisticTask: Task = {
      ...task,
      title,
      description,
      version: task.version, // Keep same version for optimistic update
    };
    updateTask(optimisticTask);

    const messageId = sendMessage({
      type: 'task:update',
      payload: {
        id: task.id,
        title,
        description,
        version: task.version,
      },
    });

    store.setPendingOperation(messageId!, 'update', originalTask);
    return messageId;
  }, [sendMessage, updateTask]);

  const moveTaskToColumn = useCallback((task: Task, column: Column, targetIndex: number) => {
    const store = useTaskStore.getState();
    const originalTask = store.getTaskById(task.id);

    // Optimistic update
    store.moveTask(task.id, column, targetIndex);

    const messageId = sendMessage({
      type: 'task:move',
      payload: {
        id: task.id,
        column,
        targetIndex,
        version: task.version,
      },
    });

    store.setPendingOperation(messageId!, 'move', originalTask);
    return messageId;
  }, [sendMessage]);

  const deleteTask = useCallback((task: Task) => {
    const store = useTaskStore.getState();
    const originalTask = store.getTaskById(task.id);

    // Optimistic update
    removeTask(task.id);

    const messageId = sendMessage({
      type: 'task:delete',
      payload: {
        id: task.id,
        version: task.version,
      },
    });

    store.setPendingOperation(messageId!, 'delete', originalTask);
    return messageId;
  }, [sendMessage, removeTask]);

  const setEditing = useCallback((taskId: string | undefined) => {
    sendMessage({
      type: 'presence:editing',
      payload: { taskId },
    });
  }, [sendMessage]);

  // Connect on mount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    connectionStatus,
    createTask,
    editTask,
    moveTaskToColumn,
    deleteTask,
    setEditing,
    reconnect: connect,
  };
}
