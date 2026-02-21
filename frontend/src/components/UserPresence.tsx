import { useTaskStore } from '../store/taskStore';

export function UserPresence() {
  const { users, currentUserId } = useTaskStore();

  const otherUsers = users.filter((u) => u.id !== currentUserId);

  if (otherUsers.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500">Online:</span>
      <div className="flex -space-x-2">
        {otherUsers.slice(0, 5).map((user) => (
          <div
            key={user.id}
            className="user-avatar ring-2 ring-white relative"
            style={{ backgroundColor: user.color }}
            title={user.name}
          >
            {user.name.charAt(0)}
            {user.editingTaskId && (
              <span className="presence-indicator bg-blue-500" />
            )}
          </div>
        ))}
        {otherUsers.length > 5 && (
          <div className="user-avatar bg-gray-400 ring-2 ring-white">
            +{otherUsers.length - 5}
          </div>
        )}
      </div>
    </div>
  );
}
