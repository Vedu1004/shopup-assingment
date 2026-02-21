import {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  MoveTaskInput,
  CreateTaskSchema,
  UpdateTaskSchema,
  MoveTaskSchema,
  DeleteTaskSchema,
} from '../types/index.js';
import * as taskRepo from '../db/taskRepository.js';
import { generatePositionBetween } from '../utils/fractionalIndex.js';

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  conflict?: {
    type: 'version_mismatch' | 'concurrent_move' | 'concurrent_edit';
    currentVersion?: number;
    currentTask?: Task;
    message: string;
  };
}

/**
 * Get all tasks
 */
export async function getAllTasks(): Promise<ServiceResult<Task[]>> {
  try {
    const tasks = await taskRepo.getAllTasks();
    return { success: true, data: tasks };
  } catch (error) {
    console.error('Error getting tasks:', error);
    return { success: false, error: 'Failed to retrieve tasks' };
  }
}

/**
 * Get tasks by column
 */
export async function getTasksByColumn(column: string): Promise<ServiceResult<Task[]>> {
  try {
    const tasks = await taskRepo.getTasksByColumn(column as Task['column']);
    return { success: true, data: tasks };
  } catch (error) {
    console.error('Error getting tasks by column:', error);
    return { success: false, error: 'Failed to retrieve tasks' };
  }
}

/**
 * Create a new task
 */
export async function createTask(input: unknown): Promise<ServiceResult<Task>> {
  // Validate input
  const validation = CreateTaskSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.message}`,
    };
  }

  try {
    const task = await taskRepo.createTask(validation.data);
    return { success: true, data: task };
  } catch (error) {
    console.error('Error creating task:', error);
    return { success: false, error: 'Failed to create task' };
  }
}

/**
 * Update a task (title/description)
 * Handles concurrent edit conflicts by preserving both changes when possible
 */
export async function updateTask(input: unknown): Promise<ServiceResult<Task>> {
  // Validate input
  const validation = UpdateTaskSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.message}`,
    };
  }

  try {
    const result = await taskRepo.updateTask(validation.data);

    if (!result.task) {
      return { success: false, error: 'Task not found' };
    }

    if (result.conflict) {
      return {
        success: false,
        conflict: {
          type: 'version_mismatch',
          currentVersion: result.currentVersion,
          currentTask: result.task,
          message: 'Task was modified by another user. Your changes could not be applied.',
        },
      };
    }

    return { success: true, data: result.task };
  } catch (error) {
    console.error('Error updating task:', error);
    return { success: false, error: 'Failed to update task' };
  }
}

/**
 * Move a task to a new column/position
 * Handles concurrent move conflicts with deterministic resolution
 */
export async function moveTask(input: unknown): Promise<ServiceResult<Task>> {
  // Validate input
  const validation = MoveTaskSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.message}`,
    };
  }

  try {
    const result = await taskRepo.moveTask(validation.data);

    if (!result.task) {
      return { success: false, error: 'Task not found' };
    }

    if (result.conflict) {
      return {
        success: false,
        conflict: {
          type: 'concurrent_move',
          currentVersion: result.currentVersion,
          currentTask: result.task,
          message: `Task was moved by another user to "${result.task.column}". Your move was not applied.`,
        },
      };
    }

    return { success: true, data: result.task };
  } catch (error) {
    console.error('Error moving task:', error);
    return { success: false, error: 'Failed to move task' };
  }
}

/**
 * Delete a task
 */
export async function deleteTask(input: unknown): Promise<ServiceResult<{ id: string }>> {
  // Validate input
  const validation = DeleteTaskSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error: `Validation error: ${validation.error.message}`,
    };
  }

  try {
    const result = await taskRepo.deleteTask(validation.data.id, validation.data.version);

    if (!result.deleted && !result.conflict) {
      return { success: false, error: 'Task not found' };
    }

    if (result.conflict) {
      return {
        success: false,
        conflict: {
          type: 'version_mismatch',
          message: 'Task was modified by another user and cannot be deleted.',
        },
      };
    }

    return { success: true, data: { id: validation.data.id } };
  } catch (error) {
    console.error('Error deleting task:', error);
    return { success: false, error: 'Failed to delete task' };
  }
}

/**
 * Calculate new position for a task being moved
 */
export async function calculateMovePosition(
  column: Task['column'],
  targetIndex: number
): Promise<string> {
  const { before, after } = await taskRepo.getReorderPositions(column, targetIndex);
  return generatePositionBetween(before, after);
}

/**
 * Handle concurrent move+edit scenario
 * When one user moves a task while another edits it,
 * we preserve both changes by allowing the edit on the moved task
 */
export async function handleMoveEditConflict(
  moveInput: MoveTaskInput,
  editInput: UpdateTaskInput,
  moveTimestamp: number,
  editTimestamp: number
): Promise<ServiceResult<Task>> {
  // Last-write-wins for the move, but we preserve the edit
  // The move determines the final position, the edit determines the content

  // First apply the move (if versions match)
  const moveResult = await moveTask(moveInput);

  if (moveResult.success && moveResult.data) {
    // Now apply the edit with the new version
    const editWithNewVersion = {
      ...editInput,
      version: moveResult.data.version,
    };
    return updateTask(editWithNewVersion);
  }

  // If move failed due to conflict, try to apply edit to current state
  if (moveResult.conflict?.currentTask) {
    const editWithCurrentVersion = {
      ...editInput,
      version: moveResult.conflict.currentTask.version,
    };
    return updateTask(editWithCurrentVersion);
  }

  return moveResult;
}
