/**
 * Main entry point for the GinaXams Player application
 *
 * This module wires up the application layers:
 *   Storage → Controllers → App (UI)
 *
 * The App class receives pre-constructed controllers and never
 * touches domain/ or storage/ directly.
 */

import { storage } from "./storage/db.js";
import { AttemptController } from "./application/attemptController.js";
import { ExamLibraryController } from "./application/examLibraryController.js";
import { App } from "./core/app.js";

// Create app instance on DOM ready
let app: App;

window.addEventListener("DOMContentLoaded", () => {
  // Wire up controllers with the shared storage instance
  const attemptController = new AttemptController(storage);
  const libraryController = new ExamLibraryController(storage);

  app = new App({
    attemptController,
    libraryController,
    onStorageReady: () => storage.ready().then(() => {}),
  });

  // Expose to window for inline event handlers
  (window as unknown as { app: App }).app = app;
});

// Re-export for any module imports
export { App };
