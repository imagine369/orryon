'use client';

import * as Sentry from '@sentry/nextjs';
import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    Sentry.captureException(error, {
      extra: {
        componentStack: errorInfo.componentStack,
      },
    });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-center">
          <p className="text-white/30 text-xs uppercase tracking-widest mb-4">Something went wrong</p>
          <h2 className="text-xl font-semibold text-white mb-3">
            We hit an unexpected error.
          </h2>
          <p className="text-white/40 text-sm mb-8 max-w-xs">
            We&apos;ve been notified and are looking into it.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-full border border-white/15 text-sm text-white/70 hover:text-white hover:border-white/30 transition-colors"
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
