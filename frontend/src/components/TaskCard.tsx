import React, { useState, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task, User } from '../types';
import { useTaskStore } from '../store/taskStore';

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task, title: string, description: string) => void;
  onDelete: (task: Task) => void;
  onEditingChange: (taskId: string | undefined) => void;
  editingUsers: User[];
}

export function TaskCard({
  task,
  onEdit,
  onDelete,
  onEditingChange,
  editingUsers,
}: TaskCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const currentUserId = useTaskStore((state) => state.currentUserId);
  const otherEditingUsers = editingUsers.filter((u) => u.id !== currentUserId);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  useEffect(() => {
    if (isEditing && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    // Update local state when task changes (e.g., from server sync)
    if (!isEditing) {
      setTitle(task.title);
      setDescription(task.description);
    }
  }, [task.title, task.description, isEditing]);

  const handleStartEdit = () => {
    setIsEditing(true);
    onEditingChange(task.id);
  };

  const handleSave = () => {
    if (title.trim()) {
      onEdit(task, title.trim(), description.trim());
    }
    setIsEditing(false);
    onEditingChange(undefined);
  };

  const handleCancel = () => {
    setTitle(task.title);
    setDescription(task.description);
    setIsEditing(false);
    onEditingChange(undefined);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="task-card bg-blue-50 border-blue-300"
      >
        <input
          ref={titleInputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Task title"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="Description (optional)"
          rows={2}
        />
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Save
          </button>
          <button
            onClick={handleCancel}
            className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-card group relative ${isDragging ? 'dragging' : ''}`}
      {...attributes}
      {...listeners}
    >
      {/* Editing users indicators */}
      {otherEditingUsers.length > 0 && (
        <div className="absolute -top-2 -right-2 flex -space-x-2">
          {otherEditingUsers.map((user) => (
            <div
              key={user.id}
              className="user-avatar w-6 h-6 text-[10px] ring-2 ring-white"
              style={{ backgroundColor: user.color }}
              title={`${user.name} is editing`}
            >
              {user.name.charAt(0)}
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between items-start">
        <h4 className="font-medium text-gray-800 text-sm flex-1 pr-2">
          {task.title}
        </h4>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleStartEdit();
            }}
            className="p-1 text-gray-400 hover:text-blue-500"
            title="Edit"
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
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task);
            }}
            className="p-1 text-gray-400 hover:text-red-500"
            title="Delete"
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
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>

      {task.description && (
        <p className="text-gray-500 text-xs mt-1 line-clamp-2">
          {task.description}
        </p>
      )}

      {otherEditingUsers.length > 0 && (
        <div className="editing-indicator">
          <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          {otherEditingUsers.map((u) => u.name).join(', ')} editing...
        </div>
      )}
    </div>
  );
}
