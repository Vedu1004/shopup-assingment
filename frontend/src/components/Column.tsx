import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Task, User, Column as ColumnType } from '../types';
import { TaskCard } from './TaskCard';

interface ColumnProps {
  id: ColumnType;
  title: string;
  tasks: Task[];
  users: User[];
  onCreateTask: (title: string, column: ColumnType) => void;
  onEditTask: (task: Task, title: string, description: string) => void;
  onDeleteTask: (task: Task) => void;
  onEditingChange: (taskId: string | undefined) => void;
}

const COLUMN_COLORS: Record<ColumnType, string> = {
  todo: 'bg-gray-100',
  in_progress: 'bg-blue-50',
  done: 'bg-green-50',
};

const COLUMN_HEADER_COLORS: Record<ColumnType, string> = {
  todo: 'text-gray-700',
  in_progress: 'text-blue-700',
  done: 'text-green-700',
};

export function Column({
  id,
  title,
  tasks,
  users,
  onCreateTask,
  onEditTask,
  onDeleteTask,
  onEditingChange,
}: ColumnProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { column: id },
  });

  const handleAddTask = () => {
    if (newTaskTitle.trim()) {
      onCreateTask(newTaskTitle.trim(), id);
      setNewTaskTitle('');
      setIsAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddTask();
    } else if (e.key === 'Escape') {
      setIsAdding(false);
      setNewTaskTitle('');
    }
  };

  const getEditingUsersForTask = (taskId: string): User[] => {
    return users.filter((user) => user.editingTaskId === taskId);
  };

  return (
    <div
      ref={setNodeRef}
      className={`column ${COLUMN_COLORS[id]} ${
        isOver ? 'ring-2 ring-blue-400 ring-opacity-50' : ''
      }`}
    >
      <div className="column-header">
        <span className={COLUMN_HEADER_COLORS[id]}>
          {title}
          <span className="ml-2 text-sm font-normal text-gray-500">
            ({tasks.length})
          </span>
        </span>
      </div>

      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2 min-h-[100px]">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={onEditTask}
              onDelete={onDeleteTask}
              onEditingChange={onEditingChange}
              editingUsers={getEditingUsersForTask(task.id)}
            />
          ))}
        </div>
      </SortableContext>

      {isAdding ? (
        <div className="mt-2">
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (!newTaskTitle.trim()) {
                setIsAdding(false);
              }
            }}
            autoFocus
            placeholder="Enter task title..."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleAddTask}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Add
            </button>
            <button
              onClick={() => {
                setIsAdding(false);
                setNewTaskTitle('');
              }}
              className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="add-task-btn mt-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add task
        </button>
      )}
    </div>
  );
}
