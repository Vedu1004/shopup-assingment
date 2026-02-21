export type Column = 'todo' | 'in_progress' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string;
  column: Column;
  position: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  color: string;
  editingTaskId?: string;
  lastSeen: number;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

export interface WSMessage<T = unknown> {
  type: string;
  payload: T;
  clientId: string;
  timestamp: number;
  messageId: string;
}

export interface QueuedOperation {
  id: string;
  type: 'create' | 'update' | 'move' | 'delete';
  payload: unknown;
  timestamp: number;
  retryCount: number;
}

export interface ConflictNotification {
  id: string;
  type: 'version_mismatch' | 'concurrent_move' | 'concurrent_edit';
  message: string;
  timestamp: number;
}

export interface SyncState {
  tasks: Task[];
  users: User[];
  yourId: string;
  yourUser: User;
}
