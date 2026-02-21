import { Board } from './components/Board';
import { ConnectionStatus } from './components/ConnectionStatus';
import { UserPresence } from './components/UserPresence';
import { ConflictToast } from './components/ConflictToast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useTaskStore } from './store/taskStore';

function App() {
  const { currentUser } = useTaskStore();

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Collaborative Task Board
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  Real-time collaboration with conflict resolution
                </p>
              </div>
              <div className="flex items-center gap-4">
                <UserPresence />
                {currentUser && (
                  <div className="flex items-center gap-2 pl-4 border-l border-gray-200">
                    <div
                      className="user-avatar"
                      style={{ backgroundColor: currentUser.color }}
                    >
                      {currentUser.name.charAt(0)}
                    </div>
                    <span className="text-sm text-gray-600">
                      {currentUser.name}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-7xl mx-auto py-6">
          <Board />
        </main>

        {/* Status indicators */}
        <ConnectionStatus />
        <ConflictToast />
      </div>
    </ErrorBoundary>
  );
}

export default App;
