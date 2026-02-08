import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleGoHome = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full mx-4 text-center">
            <div className="mx-auto mb-6 flex items-center justify-center w-20 h-20 rounded-full bg-red-100">
              <svg
                className="w-10 h-10 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                />
              </svg>
            </div>

            <h1 className="text-2xl font-semibold text-gray-900 mb-2">문제가 발생했습니다</h1>

            <p className="text-sm text-gray-500 mb-8 px-4 break-words">
              {this.state.error?.message || '알 수 없는 오류가 발생했습니다.'}
            </p>

            <div className="flex flex-col gap-3 items-center">
              <button
                onClick={this.handleRetry}
                className="font-semibold rounded-lg transition-all duration-200 bg-blue-600 hover:bg-blue-700 text-white shadow-sm px-6 py-3 text-base w-full max-w-xs"
              >
                다시 시도
              </button>
              <button
                onClick={this.handleGoHome}
                className="font-semibold rounded-lg transition-all duration-200 text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-4 py-2 text-sm"
              >
                홈으로 돌아가기
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
