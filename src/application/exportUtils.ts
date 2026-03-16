/**
 * Export Utilities — File Download, Clipboard & Web Share API
 *
 * Provides platform-agnostic helpers for exporting data as JSON.
 * Used by both single-exam export and full backup operations.
 *
 * No DOM rendering. No i18n. No storage access.
 */

/**
 * Download a JSON-serializable value as a `.json` file.
 *
 * Uses the Blob + Object URL + hidden anchor pattern.
 */
export function downloadAsJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

/**
 * Copy a JSON-serializable value to the clipboard as formatted JSON text.
 *
 * @returns `true` if the copy succeeded, `false` otherwise.
 */
export async function copyJsonToClipboard(data: unknown): Promise<boolean> {
  try {
    const json = JSON.stringify(data, null, 2);
    await navigator.clipboard.writeText(json);
    return true;
  } catch {
    return false;
  }
}

/**
 * Share a JSON file via the Web Share API (mobile-friendly).
 *
 * Falls back to `false` if the browser does not support sharing files.
 *
 * @returns `true` if the share completed, `false` if unsupported or cancelled.
 */
export async function shareJson(
  data: unknown,
  title: string,
  filename: string,
): Promise<boolean> {
  if (!canShareFiles()) return false;

  try {
    const json = JSON.stringify(data, null, 2);
    const file = new File([json], filename, { type: "application/json" });
    const shareData: ShareData = { title, files: [file] };

    if (!navigator.canShare(shareData)) return false;

    await navigator.share(shareData);
    return true;
  } catch {
    // User cancelled or share failed
    return false;
  }
}

/**
 * Feature-detect whether the browser supports sharing files via Web Share API.
 */
export function canShareFiles(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function"
  );
}
