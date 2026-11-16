import { Component, type ReactNode } from "react";
import { download } from "../utils";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; error: string }
> {
  state = { failed: false, error: "" };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  exportData = () => {
    try {
      const data = Object.fromEntries(
        Object.keys(localStorage)
          .filter((key) => key.startsWith("tcg-"))
          .map((key) => [key, localStorage.getItem(key)]),
      );
      download(
        JSON.stringify(data, null, 2),
        "tcg-local-recovery.json",
        "application/json",
      );
    } catch {
      this.setState({ error: "Browser storage is unavailable." });
    }
  };
  reset = () => {
    if (
      !window.confirm(
        "Reset planner data on this device? Export a backup first if you need your notes.",
      )
    )
      return;
    try {
      for (const key of Object.keys(localStorage))
        if (
          key.startsWith("tcg-") &&
          !key.includes("-corrupt-") &&
          !key.includes("-before-replace-")
        )
          localStorage.removeItem(key);
      window.location.reload();
    } catch {
      this.setState({ error: "Browser storage could not be reset." });
    }
  };
  render() {
    return this.state.failed ? (
      <main>
        <h1>Could not open the planner</h1>
        <p>Export your local data before resetting it.</p>
        <button className="button" onClick={this.exportData}>
          Export backup
        </button>
        <button className="button" onClick={this.reset}>
          Reset local data
        </button>
        <p role="alert">{this.state.error}</p>
      </main>
    ) : (
      this.props.children
    );
  }
}
