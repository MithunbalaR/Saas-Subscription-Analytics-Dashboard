import { Component } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

// Catches rendering errors in part of the page so one broken component shows a message
// instead of turning the whole app into a blank screen.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("UI error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card mx-auto my-10 max-w-lg p-6 text-center">
        <AlertTriangle className="mx-auto size-8 text-amber-700" />
        <h2 className="mt-3 text-lg font-semibold">Something went wrong on this page</h2>
        <p className="mt-1 text-sm text-stone-500">The rest of SubTrack still works. Try again, or go back to the dashboard.</p>
        <p className="mt-3 rounded bg-stone-100 px-3 py-2 font-mono text-xs text-stone-600">{String(this.state.error.message || this.state.error)}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>
            <RotateCcw className="size-4" /> Try again
          </button>
          <a href="/" className="btn btn-secondary">Dashboard</a>
        </div>
      </div>
    );
  }
}
