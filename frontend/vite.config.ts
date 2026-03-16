import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

function manualChunks(id: string) {
  if (!id.includes("node_modules")) {
    return undefined;
  }

  if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) {
    return "react-vendor";
  }

  if (id.includes("/react-router/") || id.includes("/react-router-dom/")) {
    return "router-vendor";
  }

  if (
    id.includes("/@emotion/react/") ||
    id.includes("/@emotion/styled/") ||
    id.includes("/@mui/icons-material/") ||
    id.includes("/@mui/material/") ||
    id.includes("/@popperjs/core/") ||
    id.includes("/react-transition-group/")
  ) {
    return "mui-vendor";
  }

  return undefined;
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
