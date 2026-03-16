/**
 * LibraryView — Exam library list rendering.
 *
 * Renders the library exam list: folders, exam cards, export menus.
 * All data is pre-computed; this module only does DOM manipulation.
 */

import type { Translations } from "../../i18n/index.js";
import { showAlertModal } from "../components/ConfirmModal.js";
import type {
  ExamCardView,
  LibraryViewState,
  FolderView,
} from "../../application/viewState.js";
import {
  downloadAsJson,
  copyJsonToClipboard,
  shareJson,
  canShareFiles,
} from "../../application/exportUtils.js";

export interface LibraryCallbacks {
  onSelectExam: (examId: string) => void;
  onDeleteExam: (examId: string) => void;
  onRenameExam: (examId: string) => void;
  onMoveExam: (examId: string) => void;
  onExportExam: (examId: string, event: MouseEvent) => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onImportDemo: () => void;
}

/**
 * Render the full library list into the given container element.
 */
export function renderLibraryList(
  listEl: HTMLElement,
  state: LibraryViewState,
  T: Translations,
  callbacks: LibraryCallbacks,
): void {
  const { exams, folders } = state;

  // Group exams by folder
  const map: Record<string, ExamCardView[]> = {};
  let hasAnyExams = false;

  exams.forEach((exam) => {
    const fid = exam.folderId || "uncategorized";
    if (!map[fid]) map[fid] = [];
    map[fid].push(exam);
    hasAnyExams = true;
  });

  // Empty state
  if (!hasAnyExams && folders.length === 0) {
    listEl.innerHTML = `
      <div class="no-exams">
        <p>${T.noExamsFound}</p>
        <p style="font-size: 0.9em; margin-top: 10px; color: #888;">${T.importFirst}</p>
        <button id="btnLoadExample" style="margin-top:15px; padding:8px 16px; cursor:pointer;" class="mode-btn">${T.loadExampleExam}</button>
      </div>
    `;
    listEl
      .querySelector("#btnLoadExample")
      ?.addEventListener("click", () => callbacks.onImportDemo());
    return;
  }

  // Render folders and exams
  listEl.innerHTML = "";
  for (const [folderId, folderExams] of Object.entries(map)) {
    if (
      folderId === "uncategorized" &&
      folderExams.length === 0 &&
      folders.length > 0
    ) {
      continue;
    }

    let folderName =
      folders.find((f: FolderView) => f.id === folderId)?.name || folderId;
    if (folderId === "uncategorized") {
      folderName = T.uncategorized;
    }

    listEl.appendChild(
      renderFolderSection(folderId, folderName, folderExams, T, callbacks),
    );
  }
}

/**
 * Render a folder section with its exam cards.
 */
function renderFolderSection(
  folderId: string,
  folderName: string,
  exams: ExamCardView[],
  T: Translations,
  callbacks: LibraryCallbacks,
): HTMLElement {
  const icon = folderId === "uncategorized" ? "📂" : "📁";
  const isUncat = folderId === "uncategorized";

  const section = document.createElement("div");
  section.className = "category-section";
  section.id = `cat-${folderId}`;
  section.dataset.folderId = folderId;

  // Header
  const header = document.createElement("div");
  header.className = "category-header";

  const headerLeft = document.createElement("div");
  headerLeft.style.display = "flex";
  headerLeft.style.alignItems = "center";
  headerLeft.style.flex = "1";
  headerLeft.style.cursor = "pointer";

  const iconSpan = document.createElement("span");
  iconSpan.className = "category-icon";
  iconSpan.textContent = icon;

  const nameSpan = document.createElement("span");
  nameSpan.className = "category-name";
  nameSpan.textContent = folderName;

  const countSpan = document.createElement("span");
  countSpan.className = "category-count";
  countSpan.textContent = String(exams.length);

  headerLeft.appendChild(iconSpan);
  headerLeft.appendChild(nameSpan);
  headerLeft.appendChild(countSpan);
  header.appendChild(headerLeft);

  if (!isUncat) {
    const renameBtn = document.createElement("button");
    renameBtn.className = "icon-btn";
    renameBtn.title = T.rename;
    renameBtn.textContent = "✏️";
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      callbacks.onRenameFolder(folderId);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "icon-btn";
    deleteBtn.title = T.delete;
    deleteBtn.textContent = "🗑️";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      callbacks.onDeleteFolder(folderId);
    });

    header.appendChild(renameBtn);
    header.appendChild(deleteBtn);
  }

  section.appendChild(header);

  // Exam list
  const examsContainer = document.createElement("div");
  examsContainer.className = "category-exams";

  for (const exam of exams) {
    examsContainer.appendChild(renderExamCard(exam, T, callbacks));
  }

  section.appendChild(examsContainer);
  return section;
}

/**
 * Render a single exam card.
 */
function renderExamCard(
  exam: ExamCardView,
  T: Translations,
  callbacks: LibraryCallbacks,
): HTMLElement {
  const attempts = exam.stats?.attemptCount ?? 0;
  const bestScore = exam.stats?.bestScore ?? 0;

  const item = document.createElement("div");
  item.className = "exam-item";
  item.dataset.id = exam.id;
  item.addEventListener("click", () => callbacks.onSelectExam(exam.id));

  // Info section
  const info = document.createElement("div");
  info.className = "exam-item-info";

  const title = document.createElement("div");
  title.className = "exam-item-title";
  title.textContent = exam.title || exam.id;

  const statsDiv = document.createElement("div");
  statsDiv.className = "exam-item-stats";

  if (attempts > 0) {
    const statsInner = document.createElement("div");
    statsInner.className = "exam-stats";

    const attemptsSpan = document.createElement("span");
    attemptsSpan.textContent = `${attempts} ${attempts === 1 ? T.attempt : T.attempts}`;

    const bestSpan = document.createElement("span");
    bestSpan.textContent = `${T.bestScore}: ${bestScore}%`;

    statsInner.appendChild(attemptsSpan);
    statsInner.appendChild(bestSpan);
    statsDiv.appendChild(statsInner);
  } else {
    const meta = document.createElement("span");
    meta.className = "exam-item-meta";
    meta.textContent = `${exam.questionCount ?? "?"} ${T.questions}`;
    statsDiv.appendChild(meta);
  }

  info.appendChild(title);
  info.appendChild(statsDiv);
  item.appendChild(info);

  // Actions
  const actions = document.createElement("div");
  actions.className = "exam-actions";

  const exportBtn = document.createElement("button");
  exportBtn.className = "icon-btn";
  exportBtn.title = T.exportExam;
  exportBtn.textContent = "📤";
  exportBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    callbacks.onExportExam(exam.id, e);
  });

  const renameBtn = document.createElement("button");
  renameBtn.className = "icon-btn";
  renameBtn.title = T.rename;
  renameBtn.textContent = "✏️";
  renameBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    callbacks.onRenameExam(exam.id);
  });

  const moveBtn = document.createElement("button");
  moveBtn.className = "icon-btn";
  moveBtn.title = T.move;
  moveBtn.textContent = "📁";
  moveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    callbacks.onMoveExam(exam.id);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "icon-btn";
  deleteBtn.title = T.delete;
  deleteBtn.textContent = "🗑️";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    callbacks.onDeleteExam(exam.id);
  });

  actions.appendChild(exportBtn);
  actions.appendChild(renameBtn);
  actions.appendChild(moveBtn);
  actions.appendChild(deleteBtn);
  item.appendChild(actions);

  return item;
}

/**
 * Render the per-exam export popup menu.
 */
export function renderExamExportMenu(
  examData: { title: string },
  event: MouseEvent,
  T: Translations,
): void {
  // Remove any existing menu
  document.getElementById("examExportMenu")?.remove();

  const menu = document.createElement("div");
  menu.id = "examExportMenu";
  menu.className = "exam-export-menu";
  menu.innerHTML = `
    <button class="exam-export-option" data-action="download">
      <span>⬇️</span> ${T.downloadJson ?? "Download JSON"}
    </button>
    <button class="exam-export-option" data-action="copy">
      <span>📋</span> ${T.copyJson ?? "Copy JSON"}
    </button>
    ${
      canShareFiles()
        ? `
      <button class="exam-export-option" data-action="share">
        <span>🔗</span> ${T.shareExam ?? "Share"}
      </button>
    `
        : ""
    }
  `;

  // Position near the button
  const rect = (event.target as HTMLElement).getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;
  menu.style.zIndex = "1000";

  // Handle actions
  menu.addEventListener("click", async (e) => {
    const btn = (e.target as HTMLElement).closest(
      "[data-action]",
    ) as HTMLElement | null;
    if (!btn) return;

    const action = btn.dataset.action;
    menu.remove();

    const examTitle = examData.title;

    if (action === "download") {
      const filename = `${examTitle.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
      downloadAsJson(examData, filename);
      showAlertModal(
        T.exportExamSuccess ?? "Exported!",
        T.exportExamSuccess ?? "Exam exported!",
        "success",
        "💾",
      );
    } else if (action === "copy") {
      const ok = await copyJsonToClipboard(examData);
      showAlertModal(
        ok ? (T.copiedToClipboard ?? "Copied!") : (T.exportFailed ?? "Error"),
        ok
          ? (T.copiedToClipboard ?? "Copied to clipboard!")
          : (T.exportFailed ?? "Export failed"),
        ok ? "success" : "danger",
        ok ? "📋" : "❌",
      );
    } else if (action === "share") {
      const filename = `${examTitle.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
      const ok = await shareJson(examData, examTitle, filename);
      if (!ok)
        showAlertModal(
          T.error ?? "Error",
          T.shareNotSupported ?? "Sharing not supported on this device",
          "warning",
          "⚠️",
        );
    }
  });

  document.body.appendChild(menu);

  // Close menu on click outside
  const closeMenu = (e: MouseEvent): void => {
    if (!menu.contains(e.target as Node)) {
      menu.remove();
      document.removeEventListener("click", closeMenu);
    }
  };
  setTimeout(() => document.addEventListener("click", closeMenu), 0);
}
