import * as React from "react";
import * as ReactDOM from "react-dom/client";
import App from "./App";
import "./i18n/config";

import "./index.css";
import { AuthProvider } from "./components/AuthProvider";
import { FacilityProfileProvider } from "./components/FacilityProfileProvider";

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function updateDarkClass(event?: MediaQueryListEvent) {
  const isDark = event?.matches ?? darkQuery.matches;
  document.documentElement.classList.toggle("dark", isDark);
}

updateDarkClass();
darkQuery.addEventListener("change", updateDarkClass);

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AuthProvider>
      <FacilityProfileProvider>
        <App />
      </FacilityProfileProvider>
    </AuthProvider>
  </React.StrictMode>,
);
