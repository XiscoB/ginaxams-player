/**
 * Main entry point for the GinaXams Player application
 * 
 * This module initializes the application and exposes
 * the necessary globals for inline event handlers in HTML.
 */

import { App } from "./core/app.js";

// Create app instance on DOM ready
let app: App;

window.addEventListener("DOMContentLoaded", () => {
  app = new App();
  
  // Expose to window for inline event handlers
  (window as unknown as { app: App }).app = app;
});

// Re-export for any module imports
export { App };
