import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <h3 className="text-red-700 font-semibold mb-2">Something went wrong</h3>
          <p className="text-red-600 text-sm mb-3">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export function DragDropErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
          <p className="text-yellow-700">
            Drag and drop encountered an error. Please refresh the page.
          </p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

export function WebSocketErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg text-center">
          <p className="text-orange-700">
            Connection error. Trying to reconnect...
          </p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
