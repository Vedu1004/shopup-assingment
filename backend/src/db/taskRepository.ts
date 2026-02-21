import { query, transaction } from './connection.js';
import { Task, Column, CreateTaskInput, UpdateTaskInput, MoveTaskInput } from '../types/index.js';
import { generatePositionBetween, generatePositionAfter } from '../utils/fractionalIndex.js';
import { v4 as uuidv4 } from 'uuid';

interface TaskRow {
  id: string;
  title: string;
  description: string;
  column: Column;
  position: string;
  version: number;
  created_at: Date;
  updated_at: Date;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    column: row.column,
    position: row.position,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function getAllTasks(): Promise<Task[]> {
  const result = await query<TaskRow>(
    'SELECT * FROM tasks ORDER BY column, position'
  );
  return result.rows.map(rowToTask);
}

export async function getTasksByColumn(column: Column): Promise<Task[]> {
  const result = await query<TaskRow>(
    'SELECT * FROM tasks WHERE column = $1 ORDER BY position',
    [column]
  );
  return result.rows.map(rowToTask);
}

export async function getTaskById(id: string): Promise<Task | null> {
  const result = await query<TaskRow>(
    'SELECT * FROM tasks WHERE id = $1',
    [id]
  );
  return result.rows[0] ? rowToTask(result.rows[0]) : null;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  return transaction(async (client) => {
    // Get the last position in the target column
    const lastTask = await client.query<TaskRow>(
      'SELECT position FROM tasks WHERE column = $1 ORDER BY position DESC LIMIT 1',
      [input.column]
    );

    const position = lastTask.rows[0]
      ? generatePositionAfter(lastTask.rows[0].position)
      : generatePositionBetween();

    const id = uuidv4();
    const result = await client.query<TaskRow>(
      `INSERT INTO tasks (id, title, description, column, position, version)
       VALUES ($1, $2, $3, $4, $5, 1)
       RETURNING *`,
      [id, input.title, input.description || '', input.column || 'todo', position]
    );

    return rowToTask(result.rows[0]);
  });
}

export interface UpdateResult {
  task: Task | null;
  conflict: boolean;
  currentVersion?: number;
}

export async function updateTask(input: UpdateTaskInput): Promise<UpdateResult> {
  return transaction(async (client) => {
    // Lock the row and check version
    const current = await client.query<TaskRow>(
      'SELECT * FROM tasks WHERE id = $1 FOR UPDATE',
      [input.id]
    );

    if (!current.rows[0]) {
      return { task: null, conflict: false };
    }

    const currentTask = current.rows[0];

    // Check for version conflict
    if (currentTask.version !== input.version) {
      return {
        task: rowToTask(currentTask),
        conflict: true,
        currentVersion: currentTask.version,
      };
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(input.title);
    }

    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(input.description);
    }

    // Always increment version
    updates.push(`version = version + 1`);

    values.push(input.id);

    const result = await client.query<TaskRow>(
      `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return { task: rowToTask(result.rows[0]), conflict: false };
  });
}

export interface MoveResult {
  task: Task | null;
  conflict: boolean;
  currentVersion?: number;
  conflictType?: 'version_mismatch' | 'concurrent_move';
}

export async function moveTask(input: MoveTaskInput): Promise<MoveResult> {
  return transaction(async (client) => {
    // Lock the row and check version
    const current = await client.query<TaskRow>(
      'SELECT * FROM tasks WHERE id = $1 FOR UPDATE',
      [input.id]
    );

    if (!current.rows[0]) {
      return { task: null, conflict: false };
    }

    const currentTask = current.rows[0];

    // Check for version conflict
    if (currentTask.version !== input.version) {
      return {
        task: rowToTask(currentTask),
        conflict: true,
        currentVersion: currentTask.version,
        conflictType: 'version_mismatch',
      };
    }

    // Update position and column
    const result = await client.query<TaskRow>(
      `UPDATE tasks
       SET column = $1, position = $2, version = version + 1
       WHERE id = $3
       RETURNING *`,
      [input.column, input.position, input.id]
    );

    return { task: rowToTask(result.rows[0]), conflict: false };
  });
}

export async function deleteTask(id: string, version: number): Promise<{ deleted: boolean; conflict: boolean }> {
  return transaction(async (client) => {
    // Lock and check version
    const current = await client.query<TaskRow>(
      'SELECT version FROM tasks WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (!current.rows[0]) {
      return { deleted: false, conflict: false };
    }

    if (current.rows[0].version !== version) {
      return { deleted: false, conflict: true };
    }

    await client.query('DELETE FROM tasks WHERE id = $1', [id]);
    return { deleted: true, conflict: false };
  });
}

/**
 * Get positions for reordering - returns the positions before and after the target index
 */
export async function getReorderPositions(
  column: Column,
  targetIndex: number
): Promise<{ before?: string; after?: string }> {
  const result = await query<{ position: string }>(
    'SELECT position FROM tasks WHERE column = $1 ORDER BY position',
    [column]
  );

  const positions = result.rows.map(r => r.position);

  if (positions.length === 0) {
    return {};
  }

  if (targetIndex <= 0) {
    return { after: positions[0] };
  }

  if (targetIndex >= positions.length) {
    return { before: positions[positions.length - 1] };
  }

  return {
    before: positions[targetIndex - 1],
    after: positions[targetIndex],
  };
}
