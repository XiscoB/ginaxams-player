/**
 * Main entry point for the GinaXams Player application
 *
 * This module wires up the application layers:
 *   Storage → Controllers → App (UI)
 *
 * The App class receives pre-constructed controllers and never
 * touches domain/ or storage/ directly.
 */

import { storage, deleteDatabase, retryPendingDelete } from "./storage/db.js";
import { AttemptController } from "./application/attemptController.js";
import { ExamLibraryController } from "./application/examLibraryController.js";
import { SettingsService } from "./application/settingsService.js";
import { App } from "./core/app.js";

/** Timeout (ms) for IndexedDB to become ready before showing recovery UI */
const DB_READY_TIMEOUT_MS = 8000;

/**
 * Wrap storage.ready() with a timeout so the app doesn't hang forever
 * when IndexedDB is blocked or corrupted.
 */
function storageReadyWithTimeout(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Database initialization timed out"));
    }, DB_READY_TIMEOUT_MS);

    storage
      .ready()
      .then(() => {
        clearTimeout(timer);
        resolve();
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Show the database error recovery UI and wire up its buttons.
 */
function showDatabaseErrorRecovery(errorMessage: string): void {
  const overlay = document.getElementById("dbErrorOverlay");
  const msgEl = document.getElementById("dbErrorMessage");
  const deleteBtn = document.getElementById("dbErrorDeleteBtn");
  const confirmBtn = document.getElementById("dbErrorConfirmBtn");
  const cancelBtn = document.getElementById("dbErrorCancelBtn");

  if (!overlay) return;

  // Translate overlay using localStorage lang (storage may be broken)
  const lang = localStorage.getItem("ginaxams_lang") || "en";
  const isEs = lang === "es";
  const titleEl = document.getElementById("dbErrorTitle");
  if (titleEl)
    titleEl.textContent = isEs ? "Error de Base de Datos" : "Database Error";
  if (msgEl) msgEl.textContent = errorMessage;
  if (deleteBtn)
    deleteBtn.textContent = isEs
      ? "Borrar todos los datos y recargar"
      : "Delete All Data & Reload";

  const confirmText = isEs
    ? "⚠️ Sí, eliminar todo permanentemente"
    : "⚠️ Yes, permanently delete everything";
  if (confirmBtn) confirmBtn.textContent = confirmText;

  const cancelText = isEs ? "Cancelar" : "Cancel";
  if (cancelBtn) cancelBtn.textContent = cancelText;

  overlay.classList.remove("hidden");

  // Step 1: first click shows confirmation
  deleteBtn?.addEventListener("click", () => {
    if (deleteBtn) deleteBtn.classList.add("hidden");
    if (confirmBtn) confirmBtn.classList.remove("hidden");
    if (cancelBtn) cancelBtn.classList.remove("hidden");
  });

  // Step 2: cancel goes back
  cancelBtn?.addEventListener("click", () => {
    if (confirmBtn) confirmBtn.classList.add("hidden");
    if (cancelBtn) cancelBtn.classList.add("hidden");
    if (deleteBtn) deleteBtn.classList.remove("hidden");
  });

  // Step 2: confirm actually deletes
  confirmBtn?.addEventListener("click", async () => {
    if (confirmBtn) {
      confirmBtn.textContent = isEs ? "Eliminando..." : "Deleting...";
      confirmBtn.setAttribute("disabled", "true");
    }
    try {
      await deleteDatabase();
      window.location.reload();
    } catch {
      if (confirmBtn)
        confirmBtn.textContent = isEs
          ? "Fallo — borra los datos del sitio manualmente"
          : "Failed — please clear site data manually";
    }
  });
}

// Create app instance on DOM ready
let app: App;

window.addEventListener("DOMContentLoaded", async () => {
  // If a prior deleteDatabase was interrupted, retry on this fresh page load
  await retryPendingDelete();

  // Wire up controllers with the shared storage instance
  const attemptController = new AttemptController(storage);
  const libraryController = new ExamLibraryController(storage);
  const settingsService = new SettingsService(storage);

  app = new App({
    attemptController,
    libraryController,
    settingsService,
    onStorageReady: storageReadyWithTimeout,
    onStorageError: showDatabaseErrorRecovery,
  });

  // Expose to window for inline event handlers
  (window as unknown as { app: App }).app = app;
});

// Re-export for any module imports
export { App };
