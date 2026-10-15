"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback UI. Receives the error and a reset callback. */
  fallback?: (props: { error: Error; reset: () => void }) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Generic React Error Boundary for isolating component-level failures.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomeComponent />
 *   </ErrorBoundary>
 *
 *   <ErrorBoundary fallback={({ error, reset }) => <MyFallback ... />}>
 *     <RiskyWidget />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Sentry / global reporter will capture this automatically via the React integration.
    void error;
    void info;
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) {
        return this.props.fallback({ error, reset: this.handleReset });
      }
      return (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-6 py-8 text-center"
        >
          <p className="text-sm font-medium text-red-400">Something went wrong</p>
          <p className="max-w-md text-xs text-[var(--text-muted)]">{error.message}</p>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-2 rounded-full border border-[var(--border)] px-4 py-1.5 text-xs font-medium text-[var(--text)] transition hover:bg-[var(--surface)]"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
