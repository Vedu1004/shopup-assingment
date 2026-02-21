import { z } from 'zod';

// Column types
export const ColumnSchema = z.enum(['todo', 'in_progress', 'done']);
export type Column = z.infer<typeof ColumnSchema>;

// Task schema
export const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).default(''),
  column: ColumnSchema,
  position: z.string(), // Fractional index for O(1) ordering
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Task = z.infer<typeof TaskSchema>;

// Create task input
export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional().default(''),
  column: ColumnSchema.optional().default('todo'),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

// Update task input
export const UpdateTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  version: z.number().int().positive(), // Required for conflict detection
});

export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

// Move task input
export const MoveTaskSchema = z.object({
  id: z.string().uuid(),
  column: ColumnSchema,
  position: z.string(), // New fractional index
  version: z.number().int().positive(),
});

export type MoveTaskInput = z.infer<typeof MoveTaskSchema>;

// Delete task input
export const DeleteTaskSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
});

export type DeleteTaskInput = z.infer<typeof DeleteTaskSchema>;

// User presence
export interface User {
  id: string;
  name: string;
  color: string;
  editingTaskId?: string;
  lastSeen: number;
}

// WebSocket message types
export type WSMessageType =
  | 'task:create'
  | 'task:update'
  | 'task:move'
  | 'task:delete'
  | 'sync:full'
  | 'sync:ack'
  | 'conflict:notification'
  | 'presence:update'
  | 'presence:editing'
  | 'user:join'
  | 'user:leave'
  | 'error';

export interface WSMessage<T = unknown> {
  type: WSMessageType;
  payload: T;
  clientId: string;
  timestamp: number;
  messageId: string;
}

// Conflict resolution result
export interface ConflictResult {
  resolved: boolean;
  winner?: 'local' | 'remote';
  mergedTask?: Task;
  notification?: string;
}

// Operation for offline queue
export interface QueuedOperation {
  id: string;
  type: 'create' | 'update' | 'move' | 'delete';
  payload: unknown;
  timestamp: number;
  retryCount: number;
}
