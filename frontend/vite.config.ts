import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "scheduler"],
          "router-vendor": ["react-router", "react-router-dom"],
          "mui-vendor": [
            "@emotion/react",
            "@emotion/styled",
            "@mui/icons-material",
            "@mui/material",
            "@popperjs/core",
            "react-transition-group",
          ],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
