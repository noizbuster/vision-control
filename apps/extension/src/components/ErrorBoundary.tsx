import type { ReactElement, ReactNode } from "react";
import { Component } from "react";

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | undefined;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: undefined };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override render(): ReactElement | null {
    const { error } = this.state;

    if (error !== undefined) {
      return (
        <div className="error-boundary" role="alert">
          <h2 className="error-boundary__title">Vision Control panel failed</h2>
          <pre className="error-boundary__message">{error.message}</pre>
          <button
            className="error-boundary__reload"
            type="button"
            onClick={() => {
              window.location.reload();
            }}
          >
            Reload panel
          </button>
        </div>
      );
    }

    return (this.props.children as ReactElement) ?? null;
  }
}
