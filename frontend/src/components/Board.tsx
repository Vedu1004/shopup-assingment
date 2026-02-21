import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Column } from './Column';
import { DragDropErrorBoundary } from './ErrorBoundary';
import { useTaskStore } from '../store/taskStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { Task, Column as ColumnType } from '../types';

const COLUMNS: { id: ColumnType; title: string }[] = [
  { id: 'todo', title: 'To Do' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'done', title: 'Done' },
];

export function Board() {
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const { tasks, users, getTasksByColumn } = useTaskStore();
  const { createTask, editTask, moveTaskToColumn, deleteTask, setEditing } =
    useWebSocket();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = tasks.find((t) => t.id === active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Visual feedback handled by CSS
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const activeTask = tasks.find((t) => t.id === active.id);
    if (!activeTask) return;

    // Determine target column and position
    let targetColumn: ColumnType;
    let targetIndex: number;

    const overData = over.data.current;

    if (overData?.column) {
      // Dropped on column (empty area)
      targetColumn = overData.column as ColumnType;
      const columnTasks = getTasksByColumn(targetColumn);
      targetIndex = columnTasks.length;
    } else if (overData?.task) {
      // Dropped on another task
      const overTask = overData.task as Task;
      targetColumn = overTask.column;
      const columnTasks = getTasksByColumn(targetColumn);
      targetIndex = columnTasks.findIndex((t) => t.id === overTask.id);

      // If moving within same column and source is before target
      if (
        activeTask.column === targetColumn &&
        columnTasks.findIndex((t) => t.id === activeTask.id) < targetIndex
      ) {
        targetIndex--;
      }
    } else {
      // Dropped on column id directly
      targetColumn = over.id as ColumnType;
      const columnTasks = getTasksByColumn(targetColumn);
      targetIndex = columnTasks.length;
    }

    // Skip if no actual change
    if (
      activeTask.column === targetColumn &&
      getTasksByColumn(targetColumn).findIndex((t) => t.id === activeTask.id) ===
        targetIndex
    ) {
      return;
    }

    moveTaskToColumn(activeTask, targetColumn, targetIndex);
  };

  const handleCreateTask = (title: string, column: ColumnType) => {
    createTask(title, '', column);
  };

  const handleEditTask = (task: Task, title: string, description: string) => {
    editTask(task, title, description);
  };

  const handleDeleteTask = (task: Task) => {
    if (window.confirm('Are you sure you want to delete this task?')) {
      deleteTask(task);
    }
  };

  const handleEditingChange = (taskId: string | undefined) => {
    setEditing(taskId);
  };

  return (
    <DragDropErrorBoundary>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-3 gap-4 p-4">
          {COLUMNS.map((column) => (
            <Column
              key={column.id}
              id={column.id}
              title={column.title}
              tasks={getTasksByColumn(column.id)}
              users={users}
              onCreateTask={handleCreateTask}
              onEditTask={handleEditTask}
              onDeleteTask={handleDeleteTask}
              onEditingChange={handleEditingChange}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask ? (
            <div className="task-card shadow-xl opacity-90 rotate-3">
              <h4 className="font-medium text-gray-800 text-sm">
                {activeTask.title}
              </h4>
              {activeTask.description && (
                <p className="text-gray-500 text-xs mt-1 line-clamp-2">
                  {activeTask.description}
                </p>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </DragDropErrorBoundary>
  );
}
