import "./boot-marker";
import App from "./components/App";
import ErrorBoundary from "./components/ErrorBoundary";
import { AppContainer } from "react-hot-loader";
import { initializeIcons } from "@fluentui/font-icons-mdl2";
import { ThemeProvider } from "@fluentui/react/lib/utilities/ThemeProvider";
import * as React from "react";
import * as ReactDOM from "react-dom";

/* global document, Office, module, require */

declare const __TASKPANE_BUILD_ID__: string;

(window as any).__taskpaneEntryRan = "entry-ran";

initializeIcons();

let isOfficeInitialized = false;

const title = "Outlook AI Assistant by Kim Schulz";

// --- Boot diagnostics -------------------------------------------------------
// React only renders inside Office.onReady. If office.js never loads (CSP,
// offline CDN) or the host handshake stalls, the pane would be a blank gray
// area with no console visible to the user. Report the startup stage in the
// boot placeholder instead so failures cannot stay silent.
const bootStatus = document.getElementById("boot-status");
let reactMounted = false;

// Route startup messages through the boot-report probe when present so the
// probe's log and the bundle's messages form one timeline in the placeholder.
const showBootStatus = (message: string) => {
  const bootReport = (window as any).__bootReport;
  if (typeof bootReport === "function") {
    bootReport(message);
  } else if (bootStatus && !reactMounted) {
    bootStatus.textContent = message;
  }
};

showBootStatus(`Starting\u2026 (build ${__TASKPANE_BUILD_ID__})`);

// Script/resource load failures (e.g. office.js blocked or unreachable) do
// not bubble, so capture them on the window phase.
window.addEventListener(
  "error",
  (event) => {
    const target = event.target as HTMLElement | null;
    const src = target ? (target as HTMLScriptElement).src : undefined;
    if (src) {
      showBootStatus(`Failed to load ${src}`);
    } else if (event.message) {
      showBootStatus(`Startup error: ${event.message}`);
    }
  },
  true
);

window.addEventListener("unhandledrejection", (event) => {
  const reason = (event as PromiseRejectionEvent).reason;
  const message = reason && reason.message ? reason.message : String(reason);
  showBootStatus(`Startup error: ${message}`);
});

window.setTimeout(() => {
  if (!reactMounted) {
    showBootStatus(
      `Office.js did not finish initializing (build ${__TASKPANE_BUILD_ID__}). ` +
        `Office API present: ${typeof Office !== "undefined"}. ` +
        "Close and reopen this pane, or restart Outlook."
    );
  }
}, 15000);
// -----------------------------------------------------------------------------

const render = (Component) => {
  ReactDOM.render(
    <AppContainer>
      <ThemeProvider>
        <ErrorBoundary>
          <Component title={title} isOfficeInitialized={isOfficeInitialized} />
        </ErrorBoundary>
      </ThemeProvider>
    </AppContainer>,
    document.getElementById("container")
  );
  reactMounted = true;
  (window as any).__taskpaneMounted = true;
};

/* Render application after Office initializes */
Office.onReady(() => {
  isOfficeInitialized = true;
  render(App);
});

if ((module as any).hot) {
  (module as any).hot.accept("./components/App", () => {
    const NextApp = require("./components/App").default;
    render(NextApp);
  });
}
