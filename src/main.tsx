import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import "leaflet/dist/leaflet.css";
import "./index.css";

// Disable default webview browser context menu on right click
document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <ErrorBoundary fallbackTitle="Apollo Flight encountered an unexpected error">
            <App />
        </ErrorBoundary>
    </React.StrictMode>,
);
