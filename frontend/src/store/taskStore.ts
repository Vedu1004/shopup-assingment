import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { Task, User, Column, ConnectionStatus, QueuedOperation, ConflictNotification } from '../types';

interface TaskState {
  // Data
  tasks: Task[];
  users: User[];
  currentUserId: string | null;
  currentUser: User | null;

  // Connection
  connectionStatus: ConnectionStatus;

  // Offline queue
  offlineQueue: QueuedOperation[];

  // Conflicts
  conflicts: ConflictNotification[];

  // Pending operations (for optimistic UI reconciliation)
  pendingOperations: Map<string, { type: string; originalTask?: Task }>;

  // Actions
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (task: Task) => void;
  removeTask: (taskId: string) => void;
  moveTask: (taskId: string, column: Column, newIndex: number) => void;

  setUsers: (users: User[]) => void;
  addUser: (user: User) => void;
  removeUser: (userId: string) => void;
  updateUserPresence: (users: User[]) => void;

  setCurrentUser: (userId: string, user: User) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;

  // Offline queue management
  addToQueue: (operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retryCount'>) => string;
  removeFromQueue: (operationId: string) => void;
  getQueuedOperations: () => QueuedOperation[];
  clearQueue: () => void;

  // Conflict management
  addConflict: (conflict: Omit<ConflictNotification, 'id' | 'timestamp'>) => void;
  removeConflict: (conflictId: string) => void;
  clearConflicts: () => void;

  // Optimistic updates
  setPendingOperation: (messageId: string, type: string, originalTask?: Task) => void;
  resolvePendingOperation: (messageId: string) => void;
  revertPendingOperation: (messageId: string) => void;

  // Helpers
  getTasksByColumn: (column: Column) => Task[];
  getTaskById: (taskId: string) => Task | undefined;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  users: [],
  currentUserId: null,
  currentUser: null,
  connectionStatus: 'disconnected',
  offlineQueue: [],
  conflicts: [],
  pendingOperations: new Map(),

  setTasks: (tasks) => set({ tasks: sortTasksByPosition(tasks) }),

  addTask: (task) =>
    set((state) => ({
      tasks: sortTasksByPosition([...state.tasks, task]),
    })),

  updateTask: (updatedTask) =>
    set((state) => ({
      tasks: sortTasksByPosition(
        state.tasks.map((task) =>
          task.id === updatedTask.id ? updatedTask : task
        )
      ),
    })),

  removeTask: (taskId) =>
    set((state) => ({
      tasks: state.tasks.filter((task) => task.id !== taskId),
    })),

  moveTask: (taskId, column, newIndex) =>
    set((state) => {
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) return state;

      // Remove task from current position
      const tasksWithoutMoved = state.tasks.filter((t) => t.id !== taskId);

      // Get tasks in target column
      const columnTasks = tasksWithoutMoved.filter((t) => t.column === column);

      // Calculate new position
      const beforeTask = columnTasks[newIndex - 1];
      const afterTask = columnTasks[newIndex];

      let newPosition: string;
      if (!beforeTask && !afterTask) {
        newPosition = 'Mzzzzz';
      } else if (!beforeTask) {
        newPosition = decrementPosition(afterTask.position);
      } else if (!afterTask) {
        newPosition = incrementPosition(beforeTask.position);
      } else {
        newPosition = midpoint(beforeTask.position, afterTask.position);
      }

      const movedTask: Task = {
        ...task,
        column,
        position: newPosition,
      };

      return {
        tasks: sortTasksByPosition([...tasksWithoutMoved, movedTask]),
      };
    }),

  setUsers: (users) => set({ users }),

  addUser: (user) =>
    set((state) => ({
      users: [...state.users.filter((u) => u.id !== user.id), user],
    })),

  removeUser: (userId) =>
    set((state) => ({
      users: state.users.filter((user) => user.id !== userId),
    })),

  updateUserPresence: (users) => set({ users }),

  setCurrentUser: (userId, user) =>
    set({ currentUserId: userId, currentUser: user }),

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  addToQueue: (operation) => {
    const id = uuidv4();
    const queuedOp: QueuedOperation = {
      ...operation,
      id,
      timestamp: Date.now(),
      retryCount: 0,
    };
    set((state) => ({
      offlineQueue: [...state.offlineQueue, queuedOp],
    }));
    return id;
  },

  removeFromQueue: (operationId) =>
    set((state) => ({
      offlineQueue: state.offlineQueue.filter((op) => op.id !== operationId),
    })),

  getQueuedOperations: () => get().offlineQueue,

  clearQueue: () => set({ offlineQueue: [] }),

  addConflict: (conflict) => {
    const notification: ConflictNotification = {
      ...conflict,
      id: uuidv4(),
      timestamp: Date.now(),
    };
    set((state) => ({
      conflicts: [...state.conflicts, notification],
    }));

    // Auto-remove after 5 seconds
    setTimeout(() => {
      get().removeConflict(notification.id);
    }, 5000);
  },

  removeConflict: (conflictId) =>
    set((state) => ({
      conflicts: state.conflicts.filter((c) => c.id !== conflictId),
    })),

  clearConflicts: () => set({ conflicts: [] }),

  setPendingOperation: (messageId, type, originalTask) =>
    set((state) => {
      const newPending = new Map(state.pendingOperations);
      newPending.set(messageId, { type, originalTask });
      return { pendingOperations: newPending };
    }),

  resolvePendingOperation: (messageId) =>
    set((state) => {
      const newPending = new Map(state.pendingOperations);
      newPending.delete(messageId);
      return { pendingOperations: newPending };
    }),

  revertPendingOperation: (messageId) =>
    set((state) => {
      const pending = state.pendingOperations.get(messageId);
      const newPending = new Map(state.pendingOperations);
      newPending.delete(messageId);

      if (pending?.originalTask) {
        // Revert the optimistic update
        return {
          tasks: sortTasksByPosition(
            state.tasks.map((task) =>
              task.id === pending.originalTask!.id ? pending.originalTask! : task
            )
          ),
          pendingOperations: newPending,
        };
      }

      return { pendingOperations: newPending };
    }),

  getTasksByColumn: (column) =>
    get()
      .tasks.filter((task) => task.column === column)
      .sort((a, b) => a.position.localeCompare(b.position)),

  getTaskById: (taskId) => get().tasks.find((task) => task.id === taskId),
}));

// Helper functions for fractional indexing
function sortTasksByPosition(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.column !== b.column) {
      const columnOrder = { todo: 0, in_progress: 1, done: 2 };
      return columnOrder[a.column] - columnOrder[b.column];
    }
    return a.position.localeCompare(b.position);
  });
}

const BASE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const BASE = BASE_CHARS.length;

function charToIndex(char: string): number {
  const index = BASE_CHARS.indexOf(char);
  return index === -1 ? 0 : index;
}

function indexToChar(index: number): string {
  return BASE_CHARS[Math.max(0, Math.min(index, BASE - 1))];
}

function decrementPosition(pos: string): string {
  const chars = pos.split('');
  for (let i = chars.length - 1; i >= 0; i--) {
    const currentIndex = charToIndex(chars[i]);
    if (currentIndex > 0) {
      chars[i] = indexToChar(currentIndex - 1);
      for (let j = i + 1; j < chars.length; j++) {
        chars[j] = indexToChar(BASE - 1);
      }
      return chars.join('');
    }
  }
  return indexToChar(0) + pos;
}

function incrementPosition(pos: string): string {
  const chars = pos.split('');
  for (let i = chars.length - 1; i >= 0; i--) {
    const currentIndex = charToIndex(chars[i]);
    if (currentIndex < BASE - 1) {
      chars[i] = indexToChar(currentIndex + 1);
      return chars.join('');
    }
    chars[i] = indexToChar(0);
  }
  return pos + indexToChar(1);
}

function midpoint(before: string, after: string): string {
  const maxLen = Math.max(before.length, after.length);
  const paddedBefore = before.padEnd(maxLen, BASE_CHARS[0]);
  const paddedAfter = after.padEnd(maxLen, BASE_CHARS[0]);

  let result = '';
  let foundDiff = false;

  for (let i = 0; i < maxLen; i++) {
    const beforeIdx = charToIndex(paddedBefore[i]);
    const afterIdx = charToIndex(paddedAfter[i]);

    if (!foundDiff) {
      if (beforeIdx === afterIdx) {
        result += paddedBefore[i];
        continue;
      }
      foundDiff = true;
    }

    if (foundDiff) {
      const mid = Math.floor((beforeIdx + afterIdx) / 2);
      if (mid > beforeIdx) {
        result += indexToChar(mid);
        return result;
      } else {
        result += paddedBefore[i];
      }
    }
  }

  return result + indexToChar(Math.floor(BASE / 2));
}
