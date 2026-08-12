import { Component, useEffect, useState } from "react";
import {
  ArrowLeft,
  Box,
  Layers,
  Monitor,
  Moon,
  Palette,
  RefreshCcw,
  Sun,
} from "lucide-react";

const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
const readPreference = () => {
  try {
    const saved = localStorage.getItem("softly-color-mode") || "system";
    return ["system", "light", "dark", "clay", "glass", "skeuo"].includes(saved)
      ? saved
      : "system";
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
  const modes = [
    { value: "system", label: "System", icon: Monitor },
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "clay", label: "Clay", icon: Box },
    { value: "glass", label: "Glass", icon: Layers },
    { value: "skeuo", label: "Skeuo", icon: Palette },
  ];
  const activeMode = modes.find((mode) => mode.value === preference) || modes[0];
  const ActiveIcon = activeMode.icon;

  useEffect(() => {
    const applyTheme = () => {
      const theme = resolveTheme(preference);
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme === "dark" ? "dark" : "light";
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

  return (
    <label
      className="themeToggle themePicker"
      title={`Appearance: ${activeMode.label}${preference === "system" ? ` (${resolved})` : ""}`}
    >
      <ActiveIcon size={16} aria-hidden="true" />
      <span className="srOnly">Choose appearance</span>
      <select
        value={preference}
        onChange={(event) => setPreference(event.target.value)}
        aria-label="Choose appearance mode"
      >
        {modes.map((mode) => (
          <option key={mode.value} value={mode.value}>{mode.label}</option>
        ))}
      </select>
    </label>
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
