import { useTaskStore } from '../store/taskStore';

export function ConnectionStatus() {
  const { connectionStatus, offlineQueue } = useTaskStore();

  const statusConfig = {
    connected: {
      className: 'connected',
      text: 'Connected',
      icon: (
        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
      ),
    },
    disconnected: {
      className: 'disconnected',
      text: 'Offline',
      icon: <span className="w-2 h-2 bg-red-500 rounded-full" />,
    },
    reconnecting: {
      className: 'reconnecting',
      text: 'Reconnecting...',
      icon: (
        <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
      ),
    },
  };

  const config = statusConfig[connectionStatus];

  return (
    <div className={`connection-indicator ${config.className}`}>
      {config.icon}
      <span>{config.text}</span>
      {offlineQueue.length > 0 && (
        <span className="ml-2 px-2 py-0.5 bg-yellow-200 text-yellow-800 rounded-full text-xs">
          {offlineQueue.length} pending
        </span>
      )}
    </div>
  );
}
