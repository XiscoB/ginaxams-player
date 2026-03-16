/**
 * LibraryFlowController — Library management orchestration.
 *
 * Coordinates:
 * - Library state loading & rendering
 * - Tab switching (library / insights / telemetry)
 * - Folder/exam CRUD
 * - File import/export
 * - Auto-load demo exam
 * - AI prompt generation & JSON import
 * - Modals & onboarding
 *
 * Delegates rendering to LibraryView.
 * No business logic — all validation/persistence stays in application layer.
 */

import type { ExamLibraryController } from "../../application/examLibraryController.js";
import { DuplicateExamError } from "../../application/examLibraryController.js";
import type {
  SettingsService,
  TabId,
} from "../../application/settingsService.js";
import type {
  ExamCardView,
  LibraryViewState,
} from "../../application/viewState.js";
import type { Translations } from "../../i18n/index.js";
import { downloadAsJson } from "../../application/exportUtils.js";
import { renderInsightsView } from "../../ui/views/InsightsView.js";
import { renderTelemetryView } from "../../ui/views/TelemetryView.js";
import {
  createViewLoading,
  createViewError,
} from "../../ui/components/ViewStatus.js";
import {
  showConfirmModal,
  showAlertModal,
} from "../../ui/components/ConfirmModal.js";
import { showInputModal } from "../../ui/components/InputModal.js";
import { showSelectModal } from "../../ui/components/SelectModal.js";
import {
  renderLibraryList,
  renderExamExportMenu,
} from "../../ui/views/LibraryView.js";
import { DEMO_EXAM } from "../demoExam.js";

type AppView = "library" | "attemptConfig" | "attemptExecution" | "results";

export interface LibraryFlowDeps {
  libraryController: ExamLibraryController;
  settingsService: SettingsService;
  getTranslations: () => Translations;
  setView: (view: AppView) => void;
  selectExam: (examId: string) => void;
}

export class LibraryFlowController {
  private deps: LibraryFlowDeps;

  // State
  private libraryState: LibraryViewState | null = null;
  activeLibraryTab: "library" | "insights" | "telemetry" = "library";

  // Onboarding
  private onboardingStep = 1;
  private readonly totalOnboardingSteps = 5;

  // AI prompt / JSON paste
  private lastValidatedExamJson: unknown = null;
  private examNameCheckTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: LibraryFlowDeps) {
    this.deps = deps;
  }

  // ==========================================================================
  // Library State
  // ==========================================================================

  getExam(examId: string): ExamCardView | undefined {
    return this.libraryState?.exams.find((e) => e.id === examId);
  }

  async refreshLibrary(): Promise<void> {
    try {
      this.libraryState =
        await this.deps.libraryController.getLibraryViewState();
      this.renderLibrary();
    } catch (e) {
      console.error("Failed to refresh library:", e);
    }
  }

  private renderLibrary(): void {
    const listEl = document.getElementById("examList");
    if (!listEl || !this.libraryState) return;

    const T = this.deps.getTranslations();
    renderLibraryList(listEl, this.libraryState, T, {
      onSelectExam: (id) => this.deps.selectExam(id),
      onDeleteExam: (id) => this.deleteExam(id),
      onRenameExam: (id) => this.promptRenameExam(id),
      onMoveExam: (id) => this.promptMoveExam(id),
      onExportExam: (id, ev) => this.showExamExportMenu(id, ev),
      onRenameFolder: (id) => this.promptRenameFolder(id),
      onDeleteFolder: (id) => this.deleteFolder(id),
      onImportDemo: () => this.importDemoData(),
    });
  }

  // ==========================================================================
  // Tab Navigation
  // ==========================================================================

  async showLibraryTab(
    tab: "library" | "insights" | "telemetry",
  ): Promise<void> {
    this.activeLibraryTab = tab;
    this.updateTabButtons();

    this.deps.settingsService
      .setLastOpenedTab(tab as TabId)
      .catch((e: unknown) => console.warn("Failed to persist tab setting:", e));

    const examListEl = document.getElementById("examList");
    const fileInputArea = document.querySelector(
      ".file-input-area",
    ) as HTMLElement | null;
    const libraryHeader = document.getElementById("libraryHeaderBar");

    if (tab === "library") {
      if (fileInputArea) fileInputArea.style.display = "";
      if (libraryHeader) libraryHeader.style.display = "";
      await this.refreshLibrary();
    } else {
      if (fileInputArea) fileInputArea.style.display = "none";
      if (libraryHeader) libraryHeader.style.display = "none";

      if (examListEl) {
        const T = this.deps.getTranslations();
        const loadingKey =
          tab === "insights"
            ? ("loadingInsights" as const)
            : ("loadingTelemetry" as const);
        examListEl.innerHTML = "";
        examListEl.appendChild(createViewLoading(loadingKey, T));

        try {
          let view: HTMLElement;
          if (tab === "insights") {
            view = await renderInsightsView(
              this.deps.libraryController,
              undefined,
              T,
            );
          } else {
            view = await renderTelemetryView(this.deps.libraryController, T);
          }
          examListEl.innerHTML = "";
          examListEl.appendChild(view);
        } catch (e) {
          console.error(`Failed to load ${tab} view:`, e);
          examListEl.innerHTML = "";
          examListEl.appendChild(
            createViewError(() => this.showLibraryTab(tab), T),
          );
        }
      }
    }
  }

  private updateTabButtons(): void {
    const tabs = document.querySelectorAll(".library-tab-btn");
    tabs.forEach((btn) => {
      const tabId = (btn as HTMLElement).dataset.tab;
      btn.classList.toggle("active", tabId === this.activeLibraryTab);
    });
  }

  // ==========================================================================
  // Folder Management
  // ==========================================================================

  async promptCreateFolder(): Promise<void> {
    const T = this.deps.getTranslations();
    const name = await showInputModal({
      title: T.newFolder ?? "New Folder",
      label: T.folderName ?? "Folder Name:",
      placeholder: T.newFolder ?? "New Folder",
      confirmLabel: T.create ?? "Create",
      cancelLabel: T.cancel ?? "Cancel",
      icon: "📁",
    });
    if (!name) return;

    try {
      await this.deps.libraryController.createFolder(name.trim());
      await this.refreshLibrary();
    } catch {
      showAlertModal(
        T.error ?? "Error",
        T.errorCreatingFolder ?? "Failed to create folder",
        "danger",
        "❌",
      );
    }
  }

  async promptRenameFolder(folderId: string): Promise<void> {
    if (!this.libraryState) return;
    const folder = this.libraryState.folders.find((f) => f.id === folderId);
    if (!folder) return;

    const T = this.deps.getTranslations();
    const name = await showInputModal({
      title: T.rename ?? "Rename",
      label: T.newName ?? "New name:",
      defaultValue: folder.name,
      confirmLabel: T.save ?? "Save",
      cancelLabel: T.cancel ?? "Cancel",
      icon: "✏️",
    });
    if (!name) return;

    try {
      await this.deps.libraryController.renameFolder(folderId, name);
      await this.refreshLibrary();
    } catch {
      showAlertModal(
        T.error ?? "Error",
        T.errorRenaming || "Error renaming folder",
        "danger",
        "❌",
      );
    }
  }

  async deleteFolder(folderId: string): Promise<void> {
    if (!this.libraryState) return;
    const folder = this.libraryState.folders.find((f) => f.id === folderId);
    if (!folder) return;

    const T = this.deps.getTranslations();
    const confirmed = await showConfirmModal({
      title: T.confirmDeleteFolder ?? "Delete folder?",
      message: `${T.confirmDeleteFolder ?? "Exams will be moved to Uncategorized. Continue?"} "${folder.name}"?`,
      confirmLabel: T.delete ?? "Delete",
      cancelLabel: T.cancel ?? "Cancel",
      variant: "danger",
      icon: "🗑️",
    });
    if (!confirmed) return;

    try {
      await this.deps.libraryController.deleteFolder(folderId);
      await this.refreshLibrary();
    } catch {
      showAlertModal(
        T.error ?? "Error",
        T.errorDeletingFolder ?? "Failed to delete folder",
        "danger",
        "❌",
      );
    }
  }

  // ==========================================================================
  // Exam Management
  // ==========================================================================

  async promptRenameExam(examId: string): Promise<void> {
    if (!this.libraryState) return;
    const exam = this.libraryState.exams.find((e) => e.id === examId);
    if (!exam) return;

    const T = this.deps.getTranslations();
    const name = await showInputModal({
      title: T.rename ?? "Rename",
      label: T.newName ?? "New name:",
      defaultValue: exam.title,
      confirmLabel: T.save ?? "Save",
      cancelLabel: T.cancel ?? "Cancel",
      icon: "✏️",
    });
    if (!name) return;

    try {
      await this.deps.libraryController.renameExam(examId, name);
      await this.refreshLibrary();
    } catch {
      showAlertModal(
        T.error ?? "Error",
        T.errorRenaming || "Error renaming exam",
        "danger",
        "❌",
      );
    }
  }

  async promptMoveExam(examId: string): Promise<void> {
    if (!this.libraryState) return;
    const exam = this.libraryState.exams.find((e) => e.id === examId);
    if (!exam) return;

    const T = this.deps.getTranslations();
    const folderOptions = this.libraryState.folders.map((f) => ({
      label: f.name,
      value: f.id,
      icon: "📁",
    }));
    if (folderOptions.length === 0) {
      showAlertModal(
        T.newFolder ?? "New Folder",
        T.createFolderFirst ?? "Create a folder first to move exams into it.",
        "info",
        "📁",
      );
      return;
    }
    const targetFolderId = await showSelectModal({
      title: T.moveToFolder ?? "Move to folder",
      options: folderOptions,
      cancelLabel: T.cancel ?? "Cancel",
      icon: "📂",
    });
    if (!targetFolderId) return;

    try {
      await this.deps.libraryController.moveExam(examId, targetFolderId);
      await this.refreshLibrary();
    } catch {
      showAlertModal(
        T.error ?? "Error",
        T.errorMovingExam || "Error moving exam",
        "danger",
        "❌",
      );
    }
  }

  async deleteExam(examId: string): Promise<void> {
    if (!this.libraryState) return;
    const exam = this.libraryState.exams.find((e) => e.id === examId);
    if (!exam) return;

    const T = this.deps.getTranslations();
    const confirmed = await showConfirmModal({
      title: T.confirmDelete ?? "Delete exam?",
      message: `${T.confirmDelete ?? "Delete exam?"} "${exam.title}"?`,
      confirmLabel: T.delete ?? "Delete",
      cancelLabel: T.cancel ?? "Cancel",
      variant: "danger",
      icon: "🗑️",
    });
    if (!confirmed) return;

    try {
      await this.deps.libraryController.deleteExam(examId);
      await this.refreshLibrary();
    } catch {
      showAlertModal(
        T.error ?? "Error",
        T.errorDeletingExam ?? "Failed to delete exam",
        "danger",
        "❌",
      );
    }
  }

  // ==========================================================================
  // File Import/Export
  // ==========================================================================

  async handleFileImport(file: File): Promise<void> {
    const T = this.deps.getTranslations();
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const examId = await this.deps.libraryController.importExam(data);
      await this.refreshLibrary();

      const imported = this.libraryState?.exams.find((e) => e.id === examId);
      const title = imported?.title ?? "Exam";
      showAlertModal(
        T.importSuccessful || "Import successful",
        `${T.importSuccessful || "Import successful"}: ${title}`,
        "success",
        "✅",
      );
    } catch (e) {
      if (e instanceof DuplicateExamError) {
        const msg = (
          T.confirmOverwriteExam ||
          'An exam with ID "{examId}" already exists ("{title}"). Do you want to overwrite it?'
        )
          .replace("{examId}", e.examId)
          .replace("{title}", e.existingTitle);
        const overwrite = await showConfirmModal({
          title: T.confirmOverwriteExam
            ? (T.importFailed ?? "Duplicate")
            : "Duplicate Exam",
          message: msg,
          confirmLabel: T.overwrite ?? "Overwrite",
          cancelLabel: T.cancel ?? "Cancel",
          variant: "warning",
          icon: "⚠️",
        });
        if (overwrite) {
          try {
            const text = await file.text();
            const data = JSON.parse(text);
            const examId = await this.deps.libraryController.importExam(
              data,
              "uncategorized",
              true,
            );
            await this.refreshLibrary();
            const imported = this.libraryState?.exams.find(
              (ex) => ex.id === examId,
            );
            const title = imported?.title ?? "Exam";
            showAlertModal(
              T.importSuccessful || "Import successful",
              `${T.importSuccessful || "Import successful"}: ${title}`,
              "success",
              "✅",
            );
          } catch (e2) {
            console.error("Import failed:", e2);
            const message = e2 instanceof Error ? e2.message : "Unknown error";
            showAlertModal(
              T.importFailed ?? "Import failed",
              `${T.importFailed}: ${message}`,
              "danger",
              "❌",
            );
          }
        }
        return;
      }
      console.error("Import failed:", e);
      const message = e instanceof Error ? e.message : "Unknown error";
      showAlertModal(
        T.importFailed ?? "Import failed",
        `${T.importFailed}: ${message}`,
        "danger",
        "❌",
      );
    }
  }

  async exportLibrary(): Promise<void> {
    const T = this.deps.getTranslations();
    try {
      const snapshot = await this.deps.libraryController.createBackup();
      const filename = `ginaxams_backup_${new Date().toISOString().split("T")[0]}.json`;
      downloadAsJson(snapshot, filename);
      showAlertModal(
        T.backupCreated ?? "Backup downloaded!",
        T.backupCreated ?? "Backup downloaded!",
        "success",
        "💾",
      );
    } catch (e) {
      console.error("Export failed:", e);
      showAlertModal(
        T.error ?? "Error",
        T.exportFailed ?? "Export failed",
        "danger",
        "❌",
      );
    }
  }

  async restoreLibrary(): Promise<void> {
    const T = this.deps.getTranslations();

    const confirmed = await showConfirmModal({
      title: T.restore ?? "Restore",
      message: T.restoreWarning ?? "This will replace ALL your data. Continue?",
      confirmLabel: T.restore ?? "Restore",
      cancelLabel: T.cancel ?? "Cancel",
      variant: "warning",
      icon: "📥",
      doubleConfirm: true,
      doubleConfirmLabel: "⚠️ " + (T.restore ?? "Yes, restore"),
    });
    if (!confirmed) return;

    const restoreInput = document.getElementById(
      "restoreFileInput",
    ) as HTMLInputElement | null;
    if (!restoreInput) return;

    restoreInput.value = "";

    const handleFile = async (e: Event): Promise<void> => {
      restoreInput.removeEventListener("change", handleFile);
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      try {
        const text = await files[0].text();
        const data = JSON.parse(text);
        await this.deps.libraryController.restoreBackup(data);
        await this.refreshLibrary();
        showAlertModal(
          T.restoreSuccess ?? "Backup restored!",
          T.restoreSuccess ?? "Backup restored successfully!",
          "success",
          "✅",
        );
      } catch (err) {
        console.error("Restore failed:", err);
        const msg = err instanceof Error ? err.message : "Unknown error";
        showAlertModal(
          T.restoreFailed ?? "Restore failed",
          `${T.restoreFailed ?? "Restore failed"}: ${msg}`,
          "danger",
          "❌",
        );
      }
    };

    restoreInput.addEventListener("change", handleFile);
    restoreInput.click();
  }

  // ==========================================================================
  // Per-Exam Export
  // ==========================================================================

  async showExamExportMenu(examId: string, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    const T = this.deps.getTranslations();

    let examData;
    try {
      examData = await this.deps.libraryController.exportExamJson(examId);
    } catch {
      showAlertModal(
        T.error ?? "Error",
        T.exportFailed ?? "Export failed",
        "danger",
        "❌",
      );
      return;
    }

    renderExamExportMenu(examData, event, T);
  }

  // ==========================================================================
  // Auto-Load & Demo Data
  // ==========================================================================

  async autoLoadExampleExam(): Promise<void> {
    if (!this.libraryState) return;
    if (this.libraryState.exams.length > 0) return;

    try {
      await this.importDemoData();
    } catch (e) {
      console.error("Failed to auto-load example exam:", e);
    }
  }

  async importDemoData(): Promise<void> {
    try {
      await this.deps.libraryController.importExam(DEMO_EXAM);
      await this.refreshLibrary();
    } catch (e) {
      console.error("Failed to import demo data:", e);
    }
  }

  // ==========================================================================
  // Onboarding
  // ==========================================================================

  checkOnboarding(): void {
    const completed = localStorage.getItem("ginaxams_onboarding_completed");
    if (!completed) {
      this.showOnboarding();
    }
  }

  showOnboarding(): void {
    const onboarding = document.getElementById("onboardingOverlay");
    if (onboarding) {
      this.onboardingStep = 1;
      onboarding.classList.add("active");
      this.updateOnboardingStep();
    }
  }

  private hideOnboarding(): void {
    const onboarding = document.getElementById("onboardingOverlay");
    if (onboarding) {
      onboarding.classList.remove("active");
    }
    localStorage.setItem("ginaxams_onboarding_completed", "true");
  }

  private updateOnboardingStep(): void {
    const steps = document.querySelectorAll(".onboarding-step-content");
    steps.forEach((step) => {
      const stepNum = parseInt((step as HTMLElement).dataset.step || "0", 10);
      step.classList.toggle("hidden", stepNum !== this.onboardingStep);
    });

    const dots = document.querySelectorAll(
      ".onboarding-steps .onboarding-step",
    );
    dots.forEach((dot) => {
      const dotNum = parseInt((dot as HTMLElement).dataset.step || "0", 10);
      dot.classList.toggle("active", dotNum === this.onboardingStep);
    });

    const prevBtn = document.getElementById("onboardingPrevBtn");
    const nextBtn = document.getElementById("onboardingNextBtn");
    const T = this.deps.getTranslations();

    if (prevBtn) {
      prevBtn.classList.toggle("hidden", this.onboardingStep <= 1);
    }

    if (nextBtn) {
      if (this.onboardingStep >= this.totalOnboardingSteps) {
        nextBtn.classList.add("hidden");
      } else {
        nextBtn.classList.remove("hidden");
        nextBtn.querySelector("span")!.textContent = T.onboardingNext || "Next";
      }
    }
  }

  skipOnboarding(): void {
    this.hideOnboarding();
  }

  nextOnboardingStep(): void {
    if (this.onboardingStep < this.totalOnboardingSteps) {
      this.onboardingStep++;
      this.updateOnboardingStep();
    }
  }

  prevOnboardingStep(): void {
    if (this.onboardingStep > 1) {
      this.onboardingStep--;
      this.updateOnboardingStep();
    }
  }

  finishOnboardingAndShowAIPrompt(): void {
    this.hideOnboarding();
    this.showAIPromptGenerator();
  }

  finishOnboardingAndShowTemplate(): void {
    this.hideOnboarding();
    this.showTemplateModal();
  }

  // ==========================================================================
  // Help Menu
  // ==========================================================================

  toggleHelpMenu(): void {
    const menu = document.getElementById("helpMenuPopup");
    const btn = document.getElementById("helpToggleBtn");
    if (menu) {
      menu.classList.toggle("hidden");
      btn?.classList.toggle("active");
    }
  }

  // ==========================================================================
  // Template Modal
  // ==========================================================================

  showTemplateModal(): void {
    const modal = document.getElementById("templateModal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("active");
      this.loadTemplateCode();
    }
  }

  closeTemplateModal(): void {
    const modal = document.getElementById("templateModal");
    if (modal) {
      modal.classList.remove("active");
      modal.classList.add("hidden");
    }
  }

  private loadTemplateCode(): void {
    const code = document.getElementById("templateCode");
    if (!code) return;

    const template = {
      schema_version: "2.0",
      exam_id: "my-exam-1",
      title: "My Exam Title",
      categorias: ["Category1", "Category2"],
      total_questions: 1,
      questions: [
        {
          number: 1,
          text: "Question text here?",
          categoria: ["Category1"],
          articulo_referencia: "Art. 1",
          feedback: {
            cita_literal: "The literal citation from source",
            explicacion_fallo: "Explanation of why the wrong answer is wrong",
          },
          answers: [
            { letter: "A", text: "Correct answer", isCorrect: true },
            { letter: "B", text: "Wrong answer 1", isCorrect: false },
            { letter: "C", text: "Wrong answer 2", isCorrect: false },
            { letter: "D", text: "Wrong answer 3", isCorrect: false },
          ],
        },
      ],
    };

    code.textContent = JSON.stringify(template, null, 2);
  }

  async copyTemplate(): Promise<void> {
    const code = document.getElementById("templateCode");
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code.textContent || "");
      showAlertModal(
        this.deps.getTranslations().copied || "Copied!",
        this.deps.getTranslations().copied || "Copied to clipboard!",
        "success",
        "📋",
      );
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = code.textContent || "";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      showAlertModal(
        this.deps.getTranslations().copied || "Copied!",
        this.deps.getTranslations().copied || "Copied to clipboard!",
        "success",
        "📋",
      );
    }
  }

  downloadTemplate(): void {
    const code = document.getElementById("templateCode");
    if (!code) return;

    try {
      const templateData = JSON.parse(code.textContent || "{}");
      downloadAsJson(templateData, "exam_template.json");
    } catch {
      const blob = new Blob([code.textContent || ""], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "exam_template.json";
      a.click();
      URL.revokeObjectURL(url);
    }
    showAlertModal(
      this.deps.getTranslations().templateDownloaded || "Downloaded!",
      this.deps.getTranslations().templateDownloaded || "Template downloaded!",
      "success",
      "💾",
    );
  }

  // ==========================================================================
  // Choice Modal
  // ==========================================================================

  showChoiceModal(): void {
    const modal = document.getElementById("choiceModal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("active");
    }
  }

  closeChoiceModal(): void {
    const modal = document.getElementById("choiceModal");
    if (modal) {
      modal.classList.remove("active");
      modal.classList.add("hidden");
    }
  }

  // ==========================================================================
  // AI Prompt Generator
  // ==========================================================================

  showAIPromptGenerator(): void {
    const modal = document.getElementById("aiPromptModal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("active");
      const result = document.getElementById("aiPromptResult");
      if (result) result.classList.add("hidden");
      const destinations = document.getElementById("aiDestinations");
      if (destinations) destinations.classList.add("hidden");
      const pasteSection = document.getElementById("aiJsonPasteSection");
      if (pasteSection) pasteSection.classList.add("hidden");
      const importBtn = document.getElementById("aiJsonImportBtn");
      if (importBtn) importBtn.classList.add("hidden");
      const preview = document.getElementById("aiJsonPreview");
      if (preview) preview.classList.add("hidden");
      const pasteStatus = document.getElementById("aiJsonPasteStatus");
      if (pasteStatus) pasteStatus.classList.add("hidden");
      const pasteInput = document.getElementById(
        "aiJsonPasteInput",
      ) as HTMLTextAreaElement | null;
      if (pasteInput) pasteInput.value = "";
      const nameStatus = document.getElementById("aiExamNameStatus");
      if (nameStatus) {
        nameStatus.classList.add("hidden");
        nameStatus.className = "ai-exam-name-status hidden";
      }
    }
  }

  closeAIPromptGenerator(): void {
    const modal = document.getElementById("aiPromptModal");
    if (modal) {
      modal.classList.remove("active");
      modal.classList.add("hidden");
    }
  }

  generateAIPrompt(): void {
    const T = this.deps.getTranslations();
    const examName =
      (
        document.getElementById("aiExamName") as HTMLInputElement
      )?.value?.trim() || "";
    const numQuestions =
      (document.getElementById("aiNumQuestions") as HTMLInputElement)?.value ||
      "10";
    const numAnswers =
      (document.getElementById("aiNumAnswers") as HTMLInputElement)?.value ||
      "4";
    const difficulty =
      (document.getElementById("aiDifficulty") as HTMLSelectElement)?.value ||
      "medium";

    if (!examName) {
      showAlertModal(
        T.error ?? "Error",
        T.aiPromptExamNameRequired || "Please enter an exam name.",
        "warning",
        "⚠️",
      );
      return;
    }

    const difficultyText: Record<string, string> = {
      easy: T.difficultyEasy || "Easy",
      medium: T.difficultyMedium || "Medium",
      hard: T.difficultyHard || "Hard",
      mixed: T.difficultyMixed || "Mixed",
    };

    const numAns = parseInt(numAnswers, 10) || 4;
    const letters = Array.from({ length: numAns }, (_, i) =>
      String.fromCharCode(65 + i),
    );
    const lettersStr = letters.join(", ");

    const body = (T.aiPromptBody || "")
      .replace("{numQuestions}", numQuestions)
      .replace("{numAnswers}", numAnswers)
      .replace("{letters}", lettersStr);

    const diffLabel = difficultyText[difficulty] || difficulty;
    const lang = T.aiPromptLanguage || "English";

    const exampleAnswers = letters
      .map(
        (l, i) =>
          `        {"letter": "${l}", "text": "[${lang === "español" ? "Texto de respuesta" : "Answer text"}]", "isCorrect": ${i === 0}}`,
      )
      .join(",\n");

    const safeExamId = examName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const schemaNote =
      T.aiPromptSchemaNote ||
      "Please generate a JSON object in this exact format:";
    const rules = (T.aiPromptRules || "").replace("{difficulty}", diffLabel);

    const prompt = `${body}

NIVEL DE DIFICULTAD / DIFFICULTY: ${diffLabel}
IDIOMA / LANGUAGE: ${lang}

${schemaNote}

{
  "schema_version": "2.0",
  "exam_id": "${safeExamId}",
  "title": "${examName}",
  "categorias": ["${lang === "español" ? "Categoría1" : "Category1"}", "${lang === "español" ? "Categoría2" : "Category2"}"],
  "total_questions": ${numQuestions},
  "questions": [
    {
      "number": 1,
      "text": "[${lang === "español" ? "Texto de la pregunta aquí" : "Question text here"}]",
      "categoria": ["${lang === "español" ? "Categoría1" : "Category1"}"],
      "articulo_referencia": "${lang === "español" ? "Artículo de referencia" : "Reference article"}",
      "feedback": {
        "cita_literal": "${lang === "español" ? "Cita literal de la fuente" : "Literal citation from source"}",
        "explicacion_fallo": "${lang === "español" ? "Explicación de por qué las respuestas incorrectas son erróneas" : "Explanation of why wrong answers are wrong"}"
      },
      "answers": [
${exampleAnswers}
      ]
    }
  ]
}

IMPORTANT: Use "${safeExamId}" as the "exam_id" and "${examName}" as the "title". Do NOT change these values.
IMPORTANT: The "categorias" array at the exam level MUST list EVERY category that appears in any question's "categoria" field. Every question "categoria" value MUST exist in the top-level "categorias" array.

${rules}`;

    const output = document.getElementById(
      "aiGeneratedPrompt",
    ) as HTMLTextAreaElement;
    if (output) output.value = prompt;

    const result = document.getElementById("aiPromptResult");
    if (result) result.classList.remove("hidden");
  }

  async copyGeneratedPrompt(): Promise<void> {
    const output = document.getElementById(
      "aiGeneratedPrompt",
    ) as HTMLTextAreaElement;
    if (!output) return;

    try {
      await navigator.clipboard.writeText(output.value);
    } catch {
      output.select();
      document.execCommand("copy");
    }

    const destinations = document.getElementById("aiDestinations");
    if (destinations) destinations.classList.remove("hidden");
  }

  // ==========================================================================
  // Exam Name Duplicate Check
  // ==========================================================================

  checkExamNameAvailability(): void {
    if (this.examNameCheckTimeout) {
      clearTimeout(this.examNameCheckTimeout);
    }
    this.examNameCheckTimeout = setTimeout(() => {
      this.doCheckExamName();
    }, 300);
  }

  private async doCheckExamName(): Promise<void> {
    const T = this.deps.getTranslations();
    const nameInput = document.getElementById(
      "aiExamName",
    ) as HTMLInputElement | null;
    const statusEl = document.getElementById("aiExamNameStatus");
    if (!nameInput || !statusEl) return;

    const name = nameInput.value.trim();
    if (!name) {
      statusEl.classList.add("hidden");
      statusEl.className = "ai-exam-name-status hidden";
      return;
    }

    try {
      const exams = await this.deps.libraryController.getExams();
      const safeId = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const duplicate = exams.find(
        (e) => e.data.exam_id === safeId || e.data.exam_id === name,
      );
      if (duplicate) {
        statusEl.textContent =
          T.aiPromptExamNameDuplicate ||
          "An exam with this name already exists. It will be overwritten if you import.";
        statusEl.className = "ai-exam-name-status warning";
      } else {
        statusEl.classList.add("hidden");
        statusEl.className = "ai-exam-name-status hidden";
      }
    } catch {
      // Silently ignore check failures
    }
  }

  // ==========================================================================
  // JSON Paste, Validate & Import
  // ==========================================================================

  toggleJsonPasteSection(): void {
    const section = document.getElementById("aiJsonPasteSection");
    if (section) section.classList.toggle("hidden");
  }

  async pasteFromClipboard(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      const input = document.getElementById(
        "aiJsonPasteInput",
      ) as HTMLTextAreaElement | null;
      if (input) {
        input.value = text;
        input.focus();
      }
    } catch {
      // Clipboard access denied — ignore
    }
  }

  validatePastedJson(): void {
    const T = this.deps.getTranslations();
    const input = document.getElementById(
      "aiJsonPasteInput",
    ) as HTMLTextAreaElement | null;
    const statusEl = document.getElementById("aiJsonPasteStatus");
    const previewEl = document.getElementById("aiJsonPreview");
    const importBtn = document.getElementById("aiJsonImportBtn");

    if (!input || !statusEl || !previewEl || !importBtn) return;

    const raw = input.value.trim();
    if (!raw) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      statusEl.textContent =
        T.aiJsonInvalidJson || "Invalid JSON: could not parse the text.";
      statusEl.className = "ai-json-paste-status error";
      previewEl.classList.add("hidden");
      importBtn.classList.add("hidden");
      this.lastValidatedExamJson = null;
      return;
    }

    try {
      const validated = this.deps.libraryController.validateExamJson(parsed);

      this.lastValidatedExamJson = parsed;
      statusEl.textContent = `✅ ${T.aiJsonValid || "Valid exam JSON!"}`;
      statusEl.className = "ai-json-paste-status success";

      const titleVal = document.getElementById("aiPreviewTitleValue");
      const questionsVal = document.getElementById("aiPreviewQuestionsValue");
      const categoriesVal = document.getElementById("aiPreviewCategoriesValue");
      if (titleVal) titleVal.textContent = validated.title;
      if (questionsVal)
        questionsVal.textContent = String(validated.questions.length);
      if (categoriesVal)
        categoriesVal.textContent = validated.categorias.join(", ");

      previewEl.classList.remove("hidden");
      importBtn.classList.remove("hidden");
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Unknown validation error";
      statusEl.textContent = `${T.aiJsonInvalidSchema || "Invalid exam format"}: ${message}`;
      statusEl.className = "ai-json-paste-status error";
      previewEl.classList.add("hidden");
      importBtn.classList.add("hidden");
      this.lastValidatedExamJson = null;
    }
  }

  async importPastedJson(): Promise<void> {
    const T = this.deps.getTranslations();
    if (!this.lastValidatedExamJson) return;

    try {
      const examId = await this.deps.libraryController.importExam(
        this.lastValidatedExamJson,
      );
      await this.refreshLibrary();

      const imported = this.libraryState?.exams.find((e) => e.id === examId);
      const title = imported?.title ?? "Exam";
      showAlertModal(
        T.aiImportSuccess || "Exam imported!",
        `${T.aiImportSuccess || "Exam imported successfully!"}: ${title}`,
        "success",
        "✅",
      );

      this.closeAIPromptGenerator();
      this.lastValidatedExamJson = null;
    } catch (e) {
      if (e instanceof DuplicateExamError) {
        const msg = (
          T.confirmOverwriteExam ||
          'An exam with ID "{examId}" already exists ("{title}"). Do you want to overwrite it?'
        )
          .replace("{examId}", e.examId)
          .replace("{title}", e.existingTitle);
        const overwrite = await showConfirmModal({
          title: T.importFailed ?? "Duplicate Exam",
          message: msg,
          confirmLabel: T.overwrite ?? "Overwrite",
          cancelLabel: T.cancel ?? "Cancel",
          variant: "warning",
          icon: "⚠️",
        });
        if (overwrite) {
          try {
            const examId = await this.deps.libraryController.importExam(
              this.lastValidatedExamJson!,
              "uncategorized",
              true,
            );
            await this.refreshLibrary();
            const imported = this.libraryState?.exams.find(
              (ex) => ex.id === examId,
            );
            const title = imported?.title ?? "Exam";
            showAlertModal(
              T.aiImportSuccess || "Exam imported!",
              `${T.aiImportSuccess || "Exam imported successfully!"}: ${title}`,
              "success",
              "✅",
            );
            this.closeAIPromptGenerator();
            this.lastValidatedExamJson = null;
          } catch (e2) {
            console.error("Import failed:", e2);
            const message = e2 instanceof Error ? e2.message : "Unknown error";
            showAlertModal(
              T.importFailed ?? "Import failed",
              `${T.importFailed || "Import failed"}: ${message}`,
              "danger",
              "❌",
            );
          }
        }
        return;
      }
      console.error("Import failed:", e);
      const message = e instanceof Error ? e.message : "Unknown error";
      showAlertModal(
        T.importFailed ?? "Import failed",
        `${T.importFailed || "Import failed"}: ${message}`,
        "danger",
        "❌",
      );
    }
  }
}
