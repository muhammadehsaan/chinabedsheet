import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";

import { router } from "./app/router";
import { AuthProvider } from "./context/AuthContext";
import { ModuleProvider } from "./context/ModuleContext";
import { PreferencesProvider } from "./context/PreferencesContext";
import { ThemeProvider } from "./context/ThemeContext";
import "./styles.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <PreferencesProvider>
        <ThemeProvider>
          <ModuleProvider>
            <QueryClientProvider client={queryClient}>
              <RouterProvider router={router} future={{ v7_startTransition: true }} />
            </QueryClientProvider>
          </ModuleProvider>
        </ThemeProvider>
      </PreferencesProvider>
    </AuthProvider>
  </React.StrictMode>,
);
