import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { CssBaseline, GlobalStyles, ThemeProvider } from "@mui/material";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AgentationDevtools } from "./components/AgentationDevtools";
import { queryClient } from "./query/queryClient";
import { theme } from "./theme";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles
        styles={{
          body: {
            backgroundColor: "#f3f6fb",
          },
          "#root": {
            minHeight: "100vh",
          },
        }}
      />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
      <AgentationDevtools />
    </ThemeProvider>
  </React.StrictMode>,
);
