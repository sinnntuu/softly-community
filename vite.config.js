import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function inlineAppStyles() {
  return {
    name: "softly-inline-app-styles",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const html = bundle["index.html"];
      if (!html || html.type !== "asset") return;

      const cssAssets = Object.values(bundle).filter(
        (asset) => asset.type === "asset" && asset.fileName.endsWith(".css"),
      );

      cssAssets.forEach((asset) => {
        const href = `/${asset.fileName}`;
        const linkPattern = new RegExp(
          `<link rel="stylesheet"(?: crossorigin)? href="${href.replaceAll("/", "\\/")}">`,
        );
        html.source = String(html.source).replace(
          linkPattern,
          `<style data-softly-styles>${asset.source}</style>`,
        );
        delete bundle[asset.fileName];
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), inlineAppStyles()],
  build: {
    sourcemap: false,
    target: "es2022",
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/firebase")) return "firebase";
          if (id.includes("node_modules/framer-motion")) return "motion";
          if (id.includes("node_modules/lucide-react")) return "icons";
          if (id.includes("node_modules/react")) return "react";
          return undefined;
        },
      },
    },
  },
});
