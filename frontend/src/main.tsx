import React from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline, GlobalStyles, ThemeProvider } from "@mui/material";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AgentationDevtools } from "./components/AgentationDevtools";
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
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <AgentationDevtools />
    </ThemeProvider>
  </React.StrictMode>,
);
