/**
 * App — Thin Application Coordinator
 *
 * Responsibilities:
 * - Application bootstrap & dependency wiring
 * - Global navigation state machine
 * - Language management
 * - External link modal (global)
 * - Version footer
 * - Event binding
 *
 * All business operations are delegated to:
 * - AttemptFlowController (attempt lifecycle)
 * - LibraryFlowController (library management)
 *
 * The App class never imports from domain/ or storage/ directly.
 */

import { AttemptController } from "../application/attemptController.js";
import { ExamLibraryController } from "../application/examLibraryController.js";
import { SettingsService } from "../application/settingsService.js";
import { PracticeManager } from "../modes/practice.js";
import {
  getTranslations,
  detectBrowserLanguage,
  type LanguageCode,
  type Translations,
} from "../i18n/index.js";
import { APP_VERSION } from "../application/version.js";
import { updatePageText } from "../ui/updatePageText.js";
import { removeAttemptConfigScreen } from "../ui/views/AttemptConfigView.js";
import {
  showConfirmModal,
  showAlertModal,
} from "../ui/components/ConfirmModal.js";
import { AttemptFlowController } from "./controllers/AttemptFlowController.js";
import { LibraryFlowController } from "./controllers/LibraryFlowController.js";

/**
 * View state for UI routing
 */
type View = "library" | "attemptConfig" | "attemptExecution" | "results";

/**
 * Application dependencies injected from main.ts
 */
export interface AppDeps {
  attemptController: AttemptController;
  libraryController: ExamLibraryController;
  settingsService: SettingsService;
  onStorageReady: () => Promise<void>;
  onStorageError: (errorMessage: string) => void;
}

/**
 * Main Application Class — Thin Coordinator
 *
 * Owns navigation state, language, and global UI.
 * Delegates attempt flows and library management to controllers.
 */
export class App {
  // Public for index.html access
  practiceManager: PracticeManager;

  // Controllers
  private attemptFlow: AttemptFlowController;
  private libraryFlow: LibraryFlowController;

  // Core dependencies
  private libraryController: ExamLibraryController;
  private settingsService: SettingsService;
  private onStorageReady: () => Promise<void>;
  private onStorageError: (errorMessage: string) => void;

  // Language
  private translations: Translations = getTranslations("en");
  private _currentLang: LanguageCode = "en";
  get currentLang(): LanguageCode {
    return this._currentLang;
  }

  constructor(deps: AppDeps) {
    this.libraryController = deps.libraryController;
    this.settingsService = deps.settingsService;
    this.onStorageReady = deps.onStorageReady;
    this.onStorageError = deps.onStorageError;

    // Initialize PracticeManager as dumb renderer
    this.practiceManager = new PracticeManager({
      onAnswer: (answerIndex: number) =>
        this.attemptFlow.handleAnswer(answerIndex),
      onNext: () => this.attemptFlow.handleNext(),
      onPrevious: () => this.attemptFlow.handlePrevious(),
      onGoTo: (index: number) => this.attemptFlow.handleGoTo(index),
      onFlag: () => this.attemptFlow.handleFlag(),
      onFinish: () => this.attemptFlow.handleFinishRequest(),
      getTranslations: () => this.translations,
      getFlaggedQuestions: () => this.attemptFlow.getFlaggedQuestions(),
      getAnsweredIndices: () => this.attemptFlow.getAnsweredIndices(),
    });

    // Create controllers
    this.attemptFlow = new AttemptFlowController({
      attemptController: deps.attemptController,
      practiceManager: this.practiceManager,
      getTranslations: () => this.translations,
      getLibraryExam: (id) => this.libraryFlow.getExam(id),
      refreshLibrary: () => this.libraryFlow.refreshLibrary(),
      setView: (view) => this.setView(view),
      hideAllScreens: () => this.hideAllScreens(),
    });

    this.libraryFlow = new LibraryFlowController({
      libraryController: deps.libraryController,
      settingsService: deps.settingsService,
      getTranslations: () => this.translations,
      setView: (view) => this.setView(view),
      selectExam: (id) => this.attemptFlow.selectExam(id),
    });

    this.init();
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  private async init(): Promise<void> {
    // Bind language buttons early so they work even before storage is ready
    this.bindLanguageButtons();

    // Apply language from localStorage / browser detection immediately
    const earlyLang = (localStorage.getItem("ginaxams_lang") ||
      null) as LanguageCode | null;
    this.setLanguageVisualOnly(earlyLang || detectBrowserLanguage());

    try {
      await this.onStorageReady();

      const settings = await this.settingsService.load();

      // Language (may override early detection with DB-persisted value)
      const savedLang = (settings.language ||
        localStorage.getItem("ginaxams_lang") ||
        null) as LanguageCode | null;
      const detectedLang = detectBrowserLanguage();
      this.setLanguage(savedLang || detectedLang);

      // Restore tab
      this.libraryFlow.activeLibraryTab = settings.lastOpenedTab || "library";

      await this.loadTemplateJSON();
      await this.libraryFlow.refreshLibrary();
      await this.libraryFlow.autoLoadExampleExam();

      this.bindEvents();
      this.setView("library");

      this.libraryFlow.checkOnboarding();
      this.renderVersionFooter();
    } catch (e) {
      console.error("App Init Error:", e);
      const msg = e instanceof Error ? e.message : "Unknown database error";
      const isEs = this._currentLang === "es";
      this.onStorageError(
        isEs
          ? `Error al inicializar la base de datos: ${msg}. Puedes eliminar todos los datos guardados para solucionarlo.`
          : `Failed to initialize database: ${msg}. You can delete all saved data to fix this.`,
      );
    }
  }

  // ==========================================================================
  // Navigation State Machine
  // ==========================================================================

  private setView(view: View): void {
    this.hideAllScreens();

    switch (view) {
      case "library":
        this.showLibraryScreen();
        break;
      case "attemptConfig":
        this.attemptFlow.showAttemptConfigScreen();
        break;
      case "attemptExecution":
        this.attemptFlow.showAttemptExecutionScreen();
        break;
      case "results":
        this.attemptFlow.showResultsScreenFlow();
        break;
    }
  }

  private hideAllScreens(): void {
    document.querySelectorAll('[id$="Screen"]').forEach((el) => {
      el.classList.add("hidden");
    });
  }

  private showLibraryScreen(): void {
    const fileScreen = document.getElementById("fileScreen");
    if (fileScreen) fileScreen.classList.remove("hidden");
    const examTitle = document.getElementById("examTitle");
    if (examTitle) examTitle.textContent = "";
    this.libraryFlow.showLibraryTab(this.libraryFlow.activeLibraryTab);
  }

  // ==========================================================================
  // Language
  // ==========================================================================

  /**
   * Apply language visually (translations + page text) without persisting.
   * Used during early init before storage is ready.
   */
  private setLanguageVisualOnly(lang: LanguageCode): void {
    this._currentLang = lang;
    this.translations = getTranslations(lang);

    const langEn = document.getElementById("langEn");
    const langEs = document.getElementById("langEs");
    langEn?.classList.toggle("active", lang === "en");
    langEs?.classList.toggle("active", lang === "es");

    updatePageText(this.translations);
  }

  private setLanguage(lang: LanguageCode): void {
    this._currentLang = lang;
    this.translations = getTranslations(lang);
    localStorage.setItem("ginaxams_lang", lang);

    this.settingsService
      .setLanguage(lang)
      .catch((e: unknown) =>
        console.warn("Failed to persist language setting:", e),
      );

    const langEn = document.getElementById("langEn");
    const langEs = document.getElementById("langEs");
    langEn?.classList.toggle("active", lang === "en");
    langEs?.classList.toggle("active", lang === "es");

    updatePageText(this.translations);

    // Recreate config screen for new language
    removeAttemptConfigScreen();

    // Re-render library for new translations
    this.libraryFlow.refreshLibrary();
  }

  // ==========================================================================
  // Event Binding
  // ==========================================================================

  /**
   * Bind language buttons early (before storage ready) so the UI
   * language can be switched even while the DB is loading/failing.
   */
  private bindLanguageButtons(): void {
    document
      .getElementById("langEn")
      ?.addEventListener("click", () => this.setLanguage("en"));
    document
      .getElementById("langEs")
      ?.addEventListener("click", () => this.setLanguage("es"));
  }

  private bindEvents(): void {
    const fileInput = document.getElementById(
      "fileInput",
    ) as HTMLInputElement | null;
    fileInput?.addEventListener("change", (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        this.libraryFlow.handleFileImport(files[0]);
      }
    });

    const dropZone = document.getElementById("dropZone");
    dropZone?.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("drag-over");
    });
    dropZone?.addEventListener("dragleave", () => {
      dropZone.classList.remove("drag-over");
    });
    dropZone?.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        this.libraryFlow.handleFileImport(files[0]);
      }
    });

    // Language buttons are bound earlier in bindLanguageButtons()

    document
      .getElementById("aiExamName")
      ?.addEventListener("input", () =>
        this.libraryFlow.checkExamNameAvailability(),
      );

    this.bindOverlayClose();
  }

  private bindOverlayClose(): void {
    const overlays: Array<{ id: string; closeFn: () => void }> = [
      {
        id: "aiPromptModal",
        closeFn: () => this.libraryFlow.closeAIPromptGenerator(),
      },
      {
        id: "templateModal",
        closeFn: () => this.libraryFlow.closeTemplateModal(),
      },
      {
        id: "choiceModal",
        closeFn: () => this.libraryFlow.closeChoiceModal(),
      },
    ];

    for (const { id, closeFn } of overlays) {
      const overlay = document.getElementById(id);
      overlay?.addEventListener("click", (e) => {
        if (e.target === overlay) closeFn();
      });
    }

    document.addEventListener("click", (e) => {
      const helpMenu = document.getElementById("helpMenuPopup");
      const helpBtn = document.getElementById("helpToggleBtn");
      if (
        helpMenu &&
        !helpMenu.classList.contains("hidden") &&
        !helpMenu.contains(e.target as Node) &&
        !helpBtn?.contains(e.target as Node)
      ) {
        helpMenu.classList.add("hidden");
      }
    });
  }

  // ==========================================================================
  // External Link Modal
  // ==========================================================================

  openExternalLink(url: string, name: string): void {
    const T = this.translations;
    showConfirmModal({
      title: `${T.leavingSite || "You're about to leave GinaXams Player"} → ${name}`,
      message: `${T.externalLinkConfirm || "You'll be redirected to:"}\n\n${url}`,
      confirmLabel: T.continue || "Continue",
      cancelLabel: T.stayHere || "Stay Here",
      variant: "info",
      icon: "🚀",
    }).then((confirmed) => {
      if (confirmed) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    });
  }

  // ==========================================================================
  // Version Footer
  // ==========================================================================

  private renderVersionFooter(): void {
    if (document.getElementById("versionFooter")) return;

    const footer = document.createElement("footer");
    footer.id = "versionFooter";
    footer.style.textAlign = "center";
    footer.style.padding = "12px 0";
    footer.style.fontSize = "0.75rem";
    footer.style.color = "var(--text-secondary, #666)";
    footer.style.opacity = "0.6";

    const versionText = document.createElement("span");
    versionText.textContent = (
      this.translations.appVersionLabel ?? "GinaXams Player v{version}"
    ).replace("{version}", APP_VERSION);

    const separator = document.createTextNode(" · ");

    const clearBtn = document.createElement("button");
    clearBtn.textContent = this.translations.clearData ?? "Clear All Data";
    clearBtn.style.cssText =
      "background:none; border:none; color:inherit; font-size:inherit; cursor:pointer; text-decoration:underline; opacity:0.8; padding:0;";
    clearBtn.addEventListener("click", () => this.clearAllData());

    footer.appendChild(versionText);
    footer.appendChild(separator);
    footer.appendChild(clearBtn);

    const container = document.querySelector(".container");
    if (container) container.appendChild(footer);
  }

  private async clearAllData(): Promise<void> {
    const T = this.translations;
    const confirmed = await showConfirmModal({
      title: T.clearData ?? "Clear All Data",
      message:
        T.confirmClearData ??
        "This will delete ALL exams, folders and progress. This cannot be undone. Are you sure?",
      confirmLabel: T.clearData ?? "Clear All Data",
      cancelLabel: T.cancel ?? "Cancel",
      variant: "danger",
      icon: "🗑️",
      doubleConfirm: true,
      doubleConfirmLabel: T.confirmClearData
        ? "⚠️ " + (T.clearData ?? "Clear All Data")
        : "⚠️ Yes, delete everything",
    });
    if (!confirmed) return;

    try {
      await this.libraryController.clearAllData();
      window.location.reload();
    } catch (e) {
      console.error("Failed to clear data:", e);
      await showAlertModal(
        T.error ?? "Error",
        T.clearDataFailed ?? "Failed to clear data. Please try again.",
        "danger",
        "❌",
      );
    }
  }

  // ==========================================================================
  // Template Loading
  // ==========================================================================

  private async loadTemplateJSON(): Promise<void> {
    try {
      const response = await fetch("./template.json");
      if (response.ok) {
        await response.json();
      }
    } catch {
      console.log("No template.json found");
    }
  }

  // ==========================================================================
  // Legacy Compatibility (window.app.* API)
  // ==========================================================================

  showModeScreen(): void {
    this.setView("library");
  }

  showFileScreen(): void {
    this.attemptFlow.abortAttempt();
    this.libraryFlow.activeLibraryTab = "library";
    this.setView("library");
  }

  loadExam(examId: string): void {
    this.attemptFlow.selectExam(examId);
  }

  getQuestionResult(_examId: string, _questionNum: number): boolean | null {
    return null;
  }

  // ==========================================================================
  // Delegation — AttemptFlowController
  // ==========================================================================

  toggleTimerVisibility(): void {
    this.attemptFlow.toggleTimerVisibility();
  }

  backToResults(): void {
    this.attemptFlow.backToResults();
  }

  reviewPrevQuestion(): void {
    this.attemptFlow.reviewPrevQuestion();
  }

  reviewNextQuestion(): void {
    this.attemptFlow.reviewNextQuestion();
  }

  reviewNextWrong(): void {
    this.attemptFlow.reviewNextWrong();
  }

  reviewNextBlank(): void {
    this.attemptFlow.reviewNextBlank();
  }

  // ==========================================================================
  // Delegation — LibraryFlowController
  // ==========================================================================

  async showLibraryTab(
    tab: "library" | "insights" | "telemetry",
  ): Promise<void> {
    await this.libraryFlow.showLibraryTab(tab);
  }

  async exportLibrary(): Promise<void> {
    await this.libraryFlow.exportLibrary();
  }

  async restoreLibrary(): Promise<void> {
    await this.libraryFlow.restoreLibrary();
  }

  async promptCreateFolder(): Promise<void> {
    await this.libraryFlow.promptCreateFolder();
  }

  async importDemoData(): Promise<void> {
    await this.libraryFlow.importDemoData();
  }

  // Onboarding
  showOnboarding(): void {
    this.libraryFlow.showOnboarding();
  }
  skipOnboarding(): void {
    this.libraryFlow.skipOnboarding();
  }
  nextOnboardingStep(): void {
    this.libraryFlow.nextOnboardingStep();
  }
  prevOnboardingStep(): void {
    this.libraryFlow.prevOnboardingStep();
  }
  finishOnboardingAndShowAIPrompt(): void {
    this.libraryFlow.finishOnboardingAndShowAIPrompt();
  }
  finishOnboardingAndShowTemplate(): void {
    this.libraryFlow.finishOnboardingAndShowTemplate();
  }

  // Help & modals
  toggleHelpMenu(): void {
    this.libraryFlow.toggleHelpMenu();
  }
  showTemplateModal(): void {
    this.libraryFlow.showTemplateModal();
  }
  closeTemplateModal(): void {
    this.libraryFlow.closeTemplateModal();
  }
  copyTemplate(): Promise<void> {
    return this.libraryFlow.copyTemplate();
  }
  downloadTemplate(): void {
    this.libraryFlow.downloadTemplate();
  }
  showChoiceModal(): void {
    this.libraryFlow.showChoiceModal();
  }
  closeChoiceModal(): void {
    this.libraryFlow.closeChoiceModal();
  }

  // AI Prompt
  showAIPromptGenerator(): void {
    this.libraryFlow.showAIPromptGenerator();
  }
  closeAIPromptGenerator(): void {
    this.libraryFlow.closeAIPromptGenerator();
  }
  generateAIPrompt(): void {
    this.libraryFlow.generateAIPrompt();
  }
  copyGeneratedPrompt(): Promise<void> {
    return this.libraryFlow.copyGeneratedPrompt();
  }

  // JSON paste
  toggleJsonPasteSection(): void {
    this.libraryFlow.toggleJsonPasteSection();
  }
  pasteFromClipboard(): Promise<void> {
    return this.libraryFlow.pasteFromClipboard();
  }
  validatePastedJson(): void {
    this.libraryFlow.validatePastedJson();
  }
  importPastedJson(): Promise<void> {
    return this.libraryFlow.importPastedJson();
  }
}
