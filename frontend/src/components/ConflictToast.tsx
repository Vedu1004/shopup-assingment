import { useTaskStore } from '../store/taskStore';

export function ConflictToast() {
  const { conflicts, removeConflict } = useTaskStore();

  if (conflicts.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 space-y-2 z-50">
      {conflicts.map((conflict) => (
        <div key={conflict.id} className="conflict-toast">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5 text-yellow-500 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <p className="font-medium text-sm">Sync Conflict</p>
                <p className="text-sm">{conflict.message}</p>
              </div>
            </div>
            <button
              onClick={() => removeConflict(conflict.id)}
              className="text-yellow-600 hover:text-yellow-800"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
