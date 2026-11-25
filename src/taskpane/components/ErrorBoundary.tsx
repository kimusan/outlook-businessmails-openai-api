import * as React from "react";

/* global window */

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Keeps the taskpane usable when the React tree throws during render: without
 * this boundary an uncaught render error unmounts the whole app and the pane
 * goes blank below the static header, leaving no clue about the cause.
 */
export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ error, errorInfo });
  }

  private onReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div
        style={{
          padding: "12px",
          fontFamily: "Segoe UI, sans-serif",
          fontSize: "12px",
          color: "#d13438",
        }}
      >
        <h3 style={{ margin: "0 0 8px 0", fontSize: "14px" }}>
          The AI Assistant crashed. Please report this message.
        </h3>
        <p style={{ margin: "0 0 8px 0", fontWeight: 600 }}>{String(this.state.error)}</p>
        <pre
          style={{
            margin: "0 0 12px 0",
            padding: "8px",
            background: "#fdf3f4",
            overflow: "auto",
            maxHeight: "200px",
            whiteSpace: "pre-wrap",
            fontSize: "11px",
          }}
        >
          {this.state.errorInfo?.componentStack || this.state.error.stack || ""}
        </pre>
        <button
          type="button"
          onClick={this.onReload}
          style={{
            padding: "4px 12px",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
