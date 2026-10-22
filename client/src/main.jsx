import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { ConfigProvider } from "./context/ConfigContext.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { I18nProvider } from "./i18n/I18nContext.jsx";
import { WorkspaceProvider } from "./context/WorkspaceContext.jsx";
import { RealtimeProvider } from "./context/RealtimeContext.jsx";
import { registerServiceWorker } from "./utils/push.js";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./index.css";

const toastStyle = {
  background: "var(--color-surface)",
  color: "var(--color-stone-900)",
  border: "1px solid var(--color-stone-200)",
  fontSize: "14px",
};

// Service worker: makes the app installable (PWA) and receives push notifications.
registerServiceWorker();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
    <BrowserRouter>
      <ThemeProvider>
        <ConfigProvider>
          <AuthProvider>
            <I18nProvider>
              <WorkspaceProvider>
                <RealtimeProvider>
                  <App />
                  <Toaster position="top-right" toastOptions={{ style: toastStyle }} />
                </RealtimeProvider>
              </WorkspaceProvider>
            </I18nProvider>
          </AuthProvider>
        </ConfigProvider>
      </ThemeProvider>
    </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
