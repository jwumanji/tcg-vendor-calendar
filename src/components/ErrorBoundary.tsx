import { Component, type ReactNode } from "react";
import { Download, RotateCcw, TriangleAlert } from "lucide-react";
import { download } from "../utils";
import { BrandMark } from "./Brand";
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
      <main className="error-screen">
        <section className="error-card" aria-labelledby="error-title">
          <div className="error-brand">
            <BrandMark />
            <span>
              <strong>Holo Vault</strong>
              <span>TCG Vendor Calendar</span>
            </span>
          </div>
          <span className="error-icon" aria-hidden="true">
            <TriangleAlert size={26} />
          </span>
          <h1 id="error-title">Could not open the planner</h1>
          <p>
            Something went wrong while loading the data saved in this browser.
            Your notes and stages have not been deleted. Export your local data
            before resetting it.
          </p>
          <div className="error-actions">
            <button className="button primary" onClick={this.exportData}>
              <Download size={16} aria-hidden="true" /> Export backup
            </button>
            <button className="button" onClick={this.reset}>
              <RotateCcw size={16} aria-hidden="true" /> Reset local data
            </button>
          </div>
          <p role="alert" className="error-message">
            {this.state.error}
          </p>
        </section>
      </main>
    ) : (
      this.props.children
    );
  }
}
