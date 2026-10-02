import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Alert } from './icons';

/**
 * Last line of defence: a rendering bug shows a way back instead of a blank page.
 * Saved hours live on the server, so reloading is always safe.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('MyTime crashed', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <div className="flex items-center gap-2 text-negative">
            <Alert size={18} />
            <h1 className="text-base font-semibold text-ink">Noe gikk galt</h1>
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            Visningen krasjet. Timer som allerede er lagret, er trygge. Last inn siden på nytt for å fortsette.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:bg-accent-hover"
            >
              Last inn på nytt
            </button>
          </div>
          <details className="mt-5 text-xs text-ink-subtle">
            <summary className="cursor-pointer">Teknisk feilmelding</summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-subtle p-3 whitespace-pre-wrap">{error.message}</pre>
          </details>
        </div>
      </div>
    );
  }
}
