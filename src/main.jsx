import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { domAnimation, LazyMotion } from "framer-motion";
import App from "./App";
import { ErrorBoundary, StatusPage } from "./components/Experience";
import "./styles.css";

function Root() {
  const validPath = window.location.pathname === "/";
  return validPath ? (
    <App />
  ) : (
    <StatusPage code="404" />
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <LazyMotion features={domAnimation} strict>
      <ErrorBoundary>
        <Root />
      </ErrorBoundary>
    </LazyMotion>
  </StrictMode>,
);

requestAnimationFrame(() => {
  document.getElementById("launch-shell")?.remove();
  document.getElementById("critical-shell-style")?.remove();
});
