import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  label: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Keeps a failure in one pane from blank-screening the whole workspace. */
export class PaneErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label}]`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 p-8 text-center">
          <AlertTriangle className="size-5 text-destructive" aria-hidden />
          <p className="text-sm font-medium">{this.props.label} stopped working</p>
          <p className="max-w-sm font-mono text-xs text-muted-foreground">
            {this.state.error.message.slice(0, 240)}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            Retry this pane
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
