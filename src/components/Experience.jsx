import { Component, useEffect, useState } from "react";
import { ArrowLeft, Moon, RefreshCcw, Sun } from "lucide-react";

const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
const readPreference = () => {
  try {
    return localStorage.getItem("softly-color-mode") || "system";
  } catch {
    return "system";
  }
};

const resolveTheme = (preference) =>
  preference === "system"
    ? colorScheme.matches
      ? "dark"
      : "light"
    : preference;

export function ThemeToggle() {
  const [preference, setPreference] = useState(readPreference);
  const resolved = resolveTheme(preference);

  useEffect(() => {
    const applyTheme = () => {
      const theme = resolveTheme(preference);
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    };
    applyTheme();
    try {
      localStorage.setItem("softly-color-mode", preference);
    } catch {
      // The chosen theme still works for this session when storage is blocked.
    }
    colorScheme.addEventListener("change", applyTheme);
    return () => colorScheme.removeEventListener("change", applyTheme);
  }, [preference]);

  const toggle = () => setPreference(resolved === "dark" ? "light" : "dark");
  const nextLabel = resolved === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      className="themeToggle"
      onClick={toggle}
      aria-label={nextLabel}
      title={`${nextLabel}${preference === "system" ? " · following your device" : ""}`}
    >
      {resolved === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

export function AppSkeleton() {
  return (
    <main className="appSkeleton" aria-label="Loading Softly" aria-busy="true">
      <div className="skeletonNav">
        <span className="skeletonBrand" />
        <span className="skeletonPill" />
      </div>
      <div className="skeletonHero">
        <div>
          <span className="skeletonLine short" />
          <span className="skeletonLine title" />
          <span className="skeletonLine title medium" />
          <span className="skeletonLine copy" />
          <span className="skeletonButton" />
        </div>
        <span className="skeletonArtwork" />
      </div>
      <span className="srOnly">Loading stories and community features…</span>
    </main>
  );
}

export function StatusPage({ code = "404", title, message, retry = false }) {
  return (
    <main className="statusPage">
      <a className="brand" href="/" aria-label="Softly home">
        softly<span>.</span>
      </a>
      <section>
        <p className="eyebrow">ERROR {code}</p>
        <h1>{title || (code === "404" ? "This page wandered off." : "Something went quiet.")}</h1>
        <p>
          {message ||
            (code === "404"
              ? "The page you requested does not exist, but the community is still here."
              : "Softly could not finish loading this view. Your account and stories are safe.")}
        </p>
        {retry ? (
          <button className="primaryAction" onClick={() => window.location.reload()}>
            <RefreshCcw size={15} /> Try again
          </button>
        ) : (
          <a className="primaryAction" href="/">
            <ArrowLeft size={15} /> Return home
          </a>
        )}
      </section>
    </main>
  );
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) console.error("Softly render error", error);
  }

  render() {
    return this.state.failed ? <StatusPage code="500" retry /> : this.props.children;
  }
}
