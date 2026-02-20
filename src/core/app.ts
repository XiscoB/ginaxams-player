/**
 * Main Application Logic
 * 
 * The App class coordinates all functionality:
 * - Exam library management
 * - File import/export
 * - Language switching
 * - UI navigation
 */

import type {
  StoredExam,
  Exam,
  Folder,
  ExamProgress,
  ExportData,
  Translations,
} from "../domain/types.js";
import { storage } from "../storage/db.js";
import { validateExam } from "../domain/validation.js";
import { PracticeManager } from "../modes/practice.js";
import { getTranslations, detectBrowserLanguage, type LanguageCode } from "../i18n/index.js";
import { calculatePercentage } from "../domain/scoring.js";

/**
 * Main Application Class
 */
export class App {
  // Core components - practiceManager is public for inline event handlers (Tarjeta Roja)
  practiceManager: PracticeManager;
  private storage = storage;

  // State
  private exams: StoredExam[] = [];
  private folders: Folder[] = [];
  private translations: Translations = getTranslations("en");
  private currentLang: LanguageCode = "en";
  private templateJSON: Record<string, unknown> | null = null;

  // UI State
  private currentOnboardingStep = 1;
  private totalOnboardingSteps = 5;
  private pendingExternalLink: string | null = null;

  constructor() {
    // Initialize PracticeManager with callbacks
    this.practiceManager = new PracticeManager({
      getQuestionResult: (examId: string, questionNum: number) => {
        return this.getQuestionResult(examId, questionNum);
      },
      saveProgress: async (examId: string, questionNum: number, wasCorrect: boolean) => {
        await this.saveProgress(examId, questionNum, wasCorrect);
      },
      saveScore: async (examId: string, score: number) => {
        return await this.saveScore(examId, score);
      },
      incrementAttempt: async (examId: string) => {
        await this.incrementAttempt(examId);
      },
      onShowFileScreen: () => this.showFileScreen(),
      onShowModeScreen: () => this.showModeScreen(),
      getTranslations: () => this.translations,
    });

    this.init();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  private async init(): Promise<void> {
    try {
      await this.storage.ready();

      // Load Language Preference
      const savedLang = localStorage.getItem("ginaxams_lang") as LanguageCode | null;
      const detectedLang = detectBrowserLanguage();
      this.setLanguage(savedLang || detectedLang);

      // Load template JSON for display
      await this.loadTemplateJSON();

      // Initial Load
      await this.refreshLibrary();

      this.bindEvents();
      this.showFileScreen();

      // Show onboarding for first-time users
      this.checkOnboarding();
    } catch (e) {
      console.error("App Init Error:", e);
    }
  }

  // ============================================================================
  // Onboarding
  // ============================================================================

  private checkOnboarding(): void {
    const hasSeenOnboarding = localStorage.getItem("ginaxams_onboarding_seen");
    if (!hasSeenOnboarding) {
      this.showOnboarding();
    }
  }

  showOnboarding(): void {
    this.currentOnboardingStep = 1;

    const overlay = document.getElementById("onboardingOverlay");
    if (overlay) {
      overlay.classList.remove("hidden");
      setTimeout(() => {
        overlay.classList.add("active");
        this.updateOnboardingUI();
      }, 10);
    }
  }

  private updateOnboardingUI(): void {
    // Update step visibility
    document.querySelectorAll<HTMLElement>(".onboarding-step-content").forEach((el) => {
      const step = parseInt(el.dataset.step ?? "1", 10);
      el.classList.toggle("hidden", step !== this.currentOnboardingStep);
    });

    // Update step indicators
    document.querySelectorAll<HTMLElement>(".onboarding-step").forEach((el) => {
      const step = parseInt(el.dataset.step ?? "1", 10);
      el.classList.toggle("active", step === this.currentOnboardingStep);
    });

    // Update buttons
    const prevBtn = document.getElementById("onboardingPrevBtn");
    const nextBtn = document.getElementById("onboardingNextBtn");

    if (prevBtn) {
      prevBtn.classList.toggle("hidden", this.currentOnboardingStep === 1);
    }

    if (nextBtn) {
      const isLastStep = this.currentOnboardingStep === this.totalOnboardingSteps;
      const nextText = nextBtn.querySelector("span");
      if (nextText) {
        nextText.textContent = isLastStep
          ? this.translations.onboardingFinish
          : this.translations.onboardingNext;
      }
    }
  }

  nextOnboardingStep(): void {
    if (this.currentOnboardingStep < this.totalOnboardingSteps) {
      this.currentOnboardingStep++;
      this.updateOnboardingUI();
    } else {
      this.finishOnboardingAndShowAIPrompt();
    }
  }

  prevOnboardingStep(): void {
    if (this.currentOnboardingStep > 1) {
      this.currentOnboardingStep--;
      this.updateOnboardingUI();
    }
  }

  skipOnboarding(): void {
    this.finishOnboarding();
  }

  finishOnboarding(): void {
    localStorage.setItem("ginaxams_onboarding_seen", "true");
    const overlay = document.getElementById("onboardingOverlay");
    if (overlay) {
      overlay.classList.remove("active");
      overlay.classList.add("hidden");
    }
  }

  finishOnboardingAndShowAIPrompt(): void {
    this.finishOnboarding();
    setTimeout(() => this.showAIPromptGenerator(), 100);
  }

  finishOnboardingAndShowTemplate(): void {
    this.finishOnboarding();
    setTimeout(() => this.showTemplateModal(), 100);
  }

  // ============================================================================
  // Template & AI Prompt
  // ============================================================================

  private async loadTemplateJSON(): Promise<void> {
    try {
      const response = await fetch("practice/examples/example_exam.json");
      if (!response.ok) return;

      const json = (await response.json()) as Record<string, unknown>;
      this.templateJSON = json;

      // Display formatted JSON
      const codeEl = document.getElementById("templateCode");
      if (codeEl) {
        codeEl.innerHTML = this.syntaxHighlightJSON(json);
      }
    } catch (e) {
      console.error("Failed to load template JSON:", e);
    }
  }

  private syntaxHighlightJSON(json: Record<string, unknown>): string {
    const str = JSON.stringify(json, null, 2);
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/(".*?"):/g, '<span class="key">$1</span>:')
      .replace(/: "(.*?)"/g, ': <span class="string">"$1"</span>')
      .replace(/: (true|false)/g, ': <span class="boolean">$1</span>')
      .replace(/: ([0-9]+)/g, ': <span class="number">$1</span>');
  }

  toggleHelpMenu(): void {
    const menu = document.getElementById("helpMenuPopup");
    const btn = document.getElementById("helpToggleBtn");

    if (menu && btn) {
      const isHidden = menu.classList.contains("hidden");
      if (isHidden) {
        menu.classList.remove("hidden");
        btn.classList.add("active");
      } else {
        menu.classList.add("hidden");
        btn.classList.remove("active");
      }
    }
  }

  toggleHelpSection(): void {
    this.showChoiceModal();
  }

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
      setTimeout(() => modal.classList.add("hidden"), 300);
    }
  }

  showTemplateModal(): void {
    const modal = document.getElementById("templateModal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("active");
    }
  }

  closeTemplateModal(): void {
    const modal = document.getElementById("templateModal");
    if (modal) {
      modal.classList.remove("active");
      setTimeout(() => modal.classList.add("hidden"), 300);
    }
  }

  openExternalLink(url: string, _name: string): void {
    this.pendingExternalLink = url;
    const modal = document.getElementById("externalLinkModal");
    const urlEl = document.getElementById("externalLinkUrl");
    if (modal && urlEl) {
      urlEl.textContent = url;
      modal.classList.remove("hidden");
      modal.classList.add("active");
    }
  }

  closeExternalLinkModal(): void {
    const modal = document.getElementById("externalLinkModal");
    if (modal) {
      modal.classList.remove("active");
      setTimeout(() => modal.classList.add("hidden"), 300);
    }
    this.pendingExternalLink = null;
  }

  confirmExternalLink(): void {
    if (this.pendingExternalLink) {
      window.open(this.pendingExternalLink, "_blank");
      this.closeExternalLinkModal();
    }
  }

  async copyTemplate(): Promise<void> {
    if (!this.templateJSON) {
      await this.loadTemplateJSON();
    }

    const jsonStr = JSON.stringify(this.templateJSON, null, 2);

    try {
      await navigator.clipboard.writeText(jsonStr);

      // Show feedback
      const btn = document.querySelector<HTMLElement>(".template-copy-btn");
      if (btn) {
        const originalText = btn.innerHTML;
        btn.classList.add("copied");
        btn.innerHTML = "✓ " + this.translations.copied;

        setTimeout(() => {
          btn.classList.remove("copied");
          btn.innerHTML = originalText;
        }, 2000);
      }
    } catch (e) {
      console.error("Failed to copy:", e);
      alert("Failed to copy to clipboard");
    }
  }

  // ============================================================================
  // AI Prompt Generator
  // ============================================================================

  showAIPromptGenerator(): void {
    const modal = document.getElementById("aiPromptModal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("active");

      // Reset form
      const numQuestions = document.getElementById("aiNumQuestions") as HTMLInputElement | null;
      const numAnswers = document.getElementById("aiNumAnswers") as HTMLInputElement | null;
      const difficulty = document.getElementById("aiDifficulty") as HTMLSelectElement | null;
      const material = document.getElementById("aiMaterial") as HTMLTextAreaElement | null;
      const materialInChat = document.getElementById("aiMaterialInChat") as HTMLInputElement | null;
      const materialField = document.getElementById("aiMaterialField");
      const result = document.getElementById("aiPromptResult");

      if (numQuestions) numQuestions.value = "10";
      if (numAnswers) numAnswers.value = "4";
      if (difficulty) difficulty.value = "medium";
      if (material) material.value = "";
      if (materialInChat) materialInChat.checked = false;
      materialField?.classList.remove("hidden");
      result?.classList.add("hidden");
    }
  }

  toggleMaterialField(): void {
    const checkbox = document.getElementById("aiMaterialInChat") as HTMLInputElement | null;
    const field = document.getElementById("aiMaterialField");
    if (checkbox && field) {
      field.classList.toggle("hidden", checkbox.checked);
    }
  }

  closeAIPromptGenerator(): void {
    const modal = document.getElementById("aiPromptModal");
    if (modal) {
      modal.classList.remove("active");
      setTimeout(() => modal.classList.add("hidden"), 300);
    }
  }

  generateAIPrompt(): void {
    const numQuestions = (document.getElementById("aiNumQuestions") as HTMLInputElement | null)?.value || "10";
    const numAnswers = (document.getElementById("aiNumAnswers") as HTMLInputElement | null)?.value || "4";
    const difficulty = (document.getElementById("aiDifficulty") as HTMLSelectElement | null)?.value || "medium";
    const materialInChat = (document.getElementById("aiMaterialInChat") as HTMLInputElement | null)?.checked ?? false;
    const material = (document.getElementById("aiMaterial") as HTMLTextAreaElement | null)?.value.trim() ?? "";

    if (!materialInChat && !material) {
      alert(this.translations.aiPromptNoMaterial);
      return;
    }

    const examId = this.generateExamId(material || "in-chat", numQuestions, difficulty);

    const difficultyText = {
      easy: this.translations.difficultyEasy,
      medium: this.translations.difficultyMedium,
      hard: this.translations.difficultyHard,
      mixed: this.translations.difficultyMixed,
    }[difficulty] ?? this.translations.difficultyMedium;

    const langText = this.currentLang === "es" ? "español" : "English";

    const prompt = this.currentLang === "es"
      ? this.generateSpanishPrompt(numQuestions, numAnswers, difficultyText, material, examId, langText, materialInChat)
      : this.generateEnglishPrompt(numQuestions, numAnswers, difficultyText, material, examId, langText, materialInChat);

    const generatedPrompt = document.getElementById("aiGeneratedPrompt") as HTMLTextAreaElement | null;
    const result = document.getElementById("aiPromptResult");

    if (generatedPrompt) generatedPrompt.value = prompt;
    result?.classList.remove("hidden");

    setTimeout(() => {
      result?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }

  private generateEnglishPrompt(
    numQuestions: string,
    numAnswers: string,
    difficulty: string,
    material: string,
    examId: string,
    lang: string,
    materialInChat: boolean
  ): string {
    const materialSection = materialInChat
      ? `I'll paste the study material in the chat below this prompt.`
      : `STUDY MATERIAL:
"""
${material}
"""`;

    const extraAnswers = numAnswers >= "4" ? ',\n        {"letter": "D", "text": "[Answer text]", "isCorrect": false}' : "";
    const extraAnswers2 = numAnswers >= "5" ? ',\n        {"letter": "E", "text": "[Answer text]", "isCorrect": false}' : "";
    const extraAnswers3 = numAnswers >= "6" ? ',\n        {"letter": "F", "text": "[Answer text]", "isCorrect": false}' : "";

    return `Based on the following study material, create a multiple-choice exam with ${numQuestions} questions. Each question must have ${numAnswers} possible answers (labeled A, B, C${numAnswers >= "4" ? ", D" : ""}${numAnswers >= "5" ? ", E" : ""}${numAnswers >= "6" ? ", F" : ""}), with only ONE correct answer per question.

DIFFICULTY LEVEL: ${difficulty}
LANGUAGE: ${lang}
SCHEMA VERSION: 2.0 (STRICT)

${materialSection}

Please generate a JSON object following this EXACT schema:

{
  "schema_version": "2.0",
  "exam_id": "${examId}",
  "title": "[Descriptive exam title based on the material]",
  "categorias": ["[Category 1]", "[Category 2]"],
  "total_questions": ${numQuestions},
  "questions": [
    {
      "number": 1,
      "text": "[Question text here]",
      "categoria": ["[Category from categorias array]"],
      "articulo_referencia": "[Reference to relevant article/section]",
      "feedback": {
        "cita_literal": "[Direct quote or citation from source material]",
        "explicacion_fallo": "[Explanation of why other answers are wrong and why the correct one is right]"
      },
      "answers": [
        {"letter": "A", "text": "[Answer text]", "isCorrect": true},
        {"letter": "B", "text": "[Answer text]", "isCorrect": false},
        {"letter": "C", "text": "[Answer text]", "isCorrect": false}${extraAnswers}${extraAnswers2}${extraAnswers3}
      ]
    }
    // ... repeat for all ${numQuestions} questions
  ]
}

STRICT REQUIREMENTS (Schema 2.0):
1. schema_version MUST be exactly "2.0"
2. categorias array must have at least one category, referenced by questions
3. Each question MUST have: number, text, categoria, articulo_referencia, feedback, answers
4. feedback MUST have: cita_literal (direct quote), explicacion_fallo (detailed explanation)
5. Each question's categoria values must exist in the exam's categorias array
6. Each question must have exactly ONE answer with "isCorrect": true
7. Each question must have at least 2 answers
8. Questions should test understanding, not just memorization
9. Distractors (wrong answers) should be plausible
10. Return ONLY the JSON, no markdown formatting or explanations`;
  }

  private generateSpanishPrompt(
    numQuestions: string,
    numAnswers: string,
    difficulty: string,
    material: string,
    examId: string,
    lang: string,
    materialInChat: boolean
  ): string {
    const materialSection = materialInChat
      ? `Pegaré el material de estudio en el chat debajo de este prompt.`
      : `MATERIAL DE ESTUDIO:
"""
${material}
"""`;

    const extraAnswers = numAnswers >= "4" ? ',\n        {"letter": "D", "text": "[Texto de respuesta]", "isCorrect": false}' : "";
    const extraAnswers2 = numAnswers >= "5" ? ',\n        {"letter": "E", "text": "[Texto de respuesta]", "isCorrect": false}' : "";
    const extraAnswers3 = numAnswers >= "6" ? ',\n        {"letter": "F", "text": "[Texto de respuesta]", "isCorrect": false}' : "";

    return `Basándome en el siguiente material de estudio, quiero que me generes un examen de opción múltiple con ${numQuestions} preguntas. Cada pregunta debe tener ${numAnswers} respuestas posibles (etiquetadas A, B, C${numAnswers >= "4" ? ", D" : ""}${numAnswers >= "5" ? ", E" : ""}${numAnswers >= "6" ? ", F" : ""}), con UNA sola respuesta correcta por pregunta.

NIVEL DE DIFICULTAD: ${difficulty}
IDIOMA: ${lang}
VERSIÓN DE ESQUEMA: 2.0 (ESTRICTO)

${materialSection}

Por favor genera un objeto JSON siguiendo este esquema EXACTO:

{
  "schema_version": "2.0",
  "exam_id": "${examId}",
  "title": "[Título descriptivo del examen basado en el material]",
  "categorias": ["[Categoría 1]", "[Categoría 2]"],
  "total_questions": ${numQuestions},
  "questions": [
    {
      "number": 1,
      "text": "[Texto de la pregunta aquí]",
      "categoria": ["[Categoría del array categorias]"],
      "articulo_referencia": "[Referencia al artículo/sección relevante]",
      "feedback": {
        "cita_literal": "[Cita directa del material fuente]",
        "explicacion_fallo": "[Explicación de por qué otras respuestas son incorrectas y por qué la correcta es la adecuada]"
      },
      "answers": [
        {"letter": "A", "text": "[Texto de respuesta]", "isCorrect": true},
        {"letter": "B", "text": "[Texto de respuesta]", "isCorrect": false},
        {"letter": "C", "text": "[Texto de respuesta]", "isCorrect": false}${extraAnswers}${extraAnswers2}${extraAnswers3}
      ]
    }
    // ... repetir para las ${numQuestions} preguntas
  ]
}

REQUISITOS ESTRICTOS (Esquema 2.0):
1. schema_version DEBE ser exactamente "2.0"
2. El array categorias debe tener al menos una categoría, referenciada por las preguntas
3. Cada pregunta DEBE tener: number, text, categoria, articulo_referencia, feedback, answers
4. feedback DEBE tener: cita_literal (cita directa), explicacion_fallo (explicación detallada)
5. Los valores de categoria de cada pregunta deben existir en el array categorias del examen
6. Cada pregunta debe tener exactamente UNA respuesta con "isCorrect": true
7. Cada pregunta debe tener al menos 2 respuestas
8. Las preguntas deben evaluar comprensión, no solo memorización
9. Los distractores (respuestas incorrectas) deben ser plausibles
10. Devuelve SOLO el JSON, sin formato markdown ni explicaciones`;
  }

  private generateExamId(material: string, numQuestions: string, difficulty: string): string {
    const str = material + numQuestions + difficulty;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    const hashStr = Math.abs(hash).toString(36).substring(0, 8);
    const timestamp = Date.now().toString(36).substring(0, 4);
    return `exam_${difficulty.charAt(0)}_${hashStr}_${timestamp}`;
  }

  async copyGeneratedPrompt(): Promise<void> {
    const textarea = document.getElementById("aiGeneratedPrompt") as HTMLTextAreaElement | null;
    if (!textarea) return;

    try {
      await navigator.clipboard.writeText(textarea.value);
      const btn = document.querySelector<HTMLElement>(".ai-prompt-copy-btn");
      if (btn) {
        const originalText = btn.innerHTML;
        btn.innerHTML = "✅ " + this.translations.copied;
        btn.style.background = "var(--accent-secondary)";
        btn.style.color = "var(--bg-primary)";
        btn.style.borderColor = "var(--accent-secondary)";

        const destinations = document.getElementById("aiDestinations");
        if (destinations) {
          destinations.classList.remove("hidden");
          destinations.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }

        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.style.background = "";
          btn.style.color = "";
          btn.style.borderColor = "";
        }, 2000);
      }
    } catch (e) {
      console.error("Failed to copy:", e);
      alert("Failed to copy to clipboard");
    }
  }

  // ============================================================================
  // Events
  // ============================================================================

  private bindEvents(): void {
    // Import File Input
    const fileInput = document.getElementById("fileInput");
    if (fileInput) {
      fileInput.addEventListener("change", (e) => this.handleFileSelect(e as Event & { target: HTMLInputElement }));
    }

    // Drag & Drop
    this.setupDragAndDrop();

    // Refresh
    document.getElementById("txtRefresh")?.parentElement?.addEventListener("click", () => {
      this.refreshLibrary();
    });

    // Language Switcher
    document.getElementById("langEn")?.addEventListener("click", () => this.setLanguage("en"));
    document.getElementById("langEs")?.addEventListener("click", () => this.setLanguage("es"));

    // Close help menu when clicking outside
    document.addEventListener("click", (e) => {
      const menu = document.getElementById("helpMenuPopup");
      const btn = document.getElementById("helpToggleBtn");
      if (
        menu &&
        !menu.classList.contains("hidden") &&
        !menu.contains(e.target as Node) &&
        btn &&
        !btn.contains(e.target as Node)
      ) {
        this.toggleHelpMenu();
      }
    });

    // Close modals when clicking outside
    document.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;

      const aiPromptModal = document.getElementById("aiPromptModal");
      if (aiPromptModal?.classList.contains("active") && target === aiPromptModal) {
        this.closeAIPromptGenerator();
      }

      const choiceModal = document.getElementById("choiceModal");
      if (choiceModal?.classList.contains("active") && target === choiceModal) {
        this.closeChoiceModal();
      }

      const templateModal = document.getElementById("templateModal");
      if (templateModal?.classList.contains("active") && target === templateModal) {
        this.closeTemplateModal();
      }
    });
  }

  private setupDragAndDrop(): void {
    const dropArea = document.querySelector<HTMLElement>(".file-input-area");
    const fileInput = document.getElementById("fileInput") as HTMLInputElement | null;
    if (!dropArea || !fileInput) return;

    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      dropArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      dropArea.addEventListener(eventName, () => {
        dropArea.style.borderColor = "#00d4ff";
        dropArea.style.background = "#1a264a";
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropArea.addEventListener(eventName, () => {
        dropArea.style.borderColor = "";
        dropArea.style.background = "";
      });
    });

    dropArea.addEventListener("drop", (e: DragEvent) => {
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        // Simulate file input change
        const dt = new DataTransfer();
        dt.items.add(files[0]);
        fileInput.files = dt.files;
        this.handleFileSelect({ target: fileInput } as unknown as Event & { target: HTMLInputElement });
      }
    });
  }

  // ============================================================================
  // Internationalization
  // ============================================================================

  setLanguage(lang: LanguageCode): void {
    this.currentLang = lang;
    this.translations = getTranslations(lang);
    localStorage.setItem("ginaxams_lang", lang);

    document.getElementById("langEn")?.classList.toggle("active", lang === "en");
    document.getElementById("langEs")?.classList.toggle("active", lang === "es");

    this.updateReflections();
    this.renderLibrary();
  }

  private updateReflections(): void {
    const T = this.translations;
    const map: Record<string, keyof Translations> = {
      appTitle: "appTitle",
      examTitle: "practiceModeSubtitle",
      txtAvailableExams: "availableExams",
      txtRefresh: "refresh",
      txtLoadExamFile: "loadExamFile",
      txtClickToSelect: "clickToSelect",
      txtDragAndDrop: "dragAndDrop",
      txtOrLoadManually: "orLoadManually",
      txtLoading: "loading",
      txtOptions: "options",
      txtShuffleQuestions: "shuffleQuestions",
      txtShuffleAnswers: "shuffleAnswers",
      txtShowFeedback: "showFeedback",
      btnPracticeMode: "practiceMode",
      btnReviewMode: "reviewMode",
      txtPrevious: "previous",
      txtNext: "next",
      txtReviewPrevious: "previous",
      txtReviewNext: "next",
      txtResults: "results",
      btnTryAgain: "tryAgain",
      btnReviewAnswers: "reviewAnswers",
      txtFilterAll: "filterAll",
      txtFilterWrong: "filterWrong",
      txtCorrectAnswer: "correctAnswer",
      txtBackToMenu: "mainMenu",
      txtResultsMenu: "mainMenu",
      txtExitReview: "menu",
      txtBackReview: "back",
      txtExamFormat: "examFormat",
      txtExamFormatDesc: "examFormatDesc",
      txtDownloadTemplate: "downloadTemplate",
      txtCopyTemplate: "copyTemplate",
      txtUseWithAI: "useWithAI",
      txtAIHelpText: "aiHelpText",
      txtCopyInstead: "copyInstead",
      txtBackToLibraryBtn: "backToLibrary",
      txtLastScore: "lastScore",
      txtBestScore: "bestScore",
      txtReviewSummaryTitle: "reviewSummary",
      txtOnboardingSkip: "onboardingSkip",
      txtOnboardingBack: "onboardingBack",
      txtOnboardingNext: "onboardingNext",
      txtOnboardingWelcomeTitle: "onboardingWelcomeTitle",
      txtOnboardingWelcomeText: "onboardingWelcomeText",
      txtOnboardingStorageTitle: "onboardingStorageTitle",
      txtOnboardingStorageText: "onboardingStorageText",
      txtOnboardingCreateTitle: "onboardingCreateTitle",
      txtOnboardingCreateText: "onboardingCreateText",
      txtOnboardingEasyTitle: "onboardingEasyTitle",
      txtOnboardingEasyDesc: "onboardingEasyDesc",
      txtOnboardingAdvancedTitle: "onboardingAdvancedTitle",
      txtOnboardingAdvancedDesc: "onboardingAdvancedDesc",
      txtOnboardingImportTitle: "onboardingImportTitle",
      txtOnboardingImportText: "onboardingImportText",
      txtOnboardingPracticeTitle: "onboardingPracticeTitle",
      txtOnboardingPracticeText: "onboardingPracticeText",
      txtOnboardingOrganizeTitle: "onboardingOrganizeTitle",
      txtOnboardingOrganizeText: "onboardingOrganizeText",
      txtShowOnboarding: "showOnboarding",
      txtOrGeneratePrompt: "orGeneratePrompt",
      txtGenerateAIPrompt: "generateAIPrompt",
      txtAIPromptTitle: "aiPromptTitle",
      txtAIPromptSubtitle: "aiPromptSubtitle",
      txtNumQuestionsLabel: "numQuestionsLabel",
      txtNumAnswersLabel: "numAnswersLabel",
      txtDifficultyLabel: "difficultyLabel",
      txtDifficultyEasy: "difficultyEasy",
      txtDifficultyMedium: "difficultyMedium",
      txtDifficultyHard: "difficultyHard",
      txtDifficultyMixed: "difficultyMixed",
      txtMaterialLabel: "materialLabel",
      txtGeneratePromptBtn: "generatePromptBtn",
      txtYourPrompt: "yourPrompt",
      txtCopyAndPaste: "copyAndPaste",
      txtCopyGeneratedPrompt: "copyGeneratedPrompt",
      txtMaterialInChatLabel: "materialInChatLabel",
      txtKimiSuggestion: "kimiSuggestion",
      txtHowToCreate: "howToCreate",
      txtEasyWay: "easyWay",
      txtEasyWayDesc: "easyWayDesc",
      txtAdvancedWay: "advancedWay",
      txtAdvancedWayDesc: "advancedWayDesc",
      txtLeavingSite: "leavingSite",
      txtExternalLinkConfirm: "externalLinkConfirm",
      txtStayHere: "stayHere",
      txtContinue: "continue",
      txtNowPaste: "nowPaste",
    };

    for (const [id, key] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (el && T[key]) {
        // Use innerHTML for elements that contain HTML tags
        if (
          [
            "txtMaterialInChatLabel",
            "txtKimiSuggestion",
            "txtEasyWayDesc",
            "txtAdvancedWayDesc",
          ].includes(id)
        ) {
          el.innerHTML = T[key];
        } else {
          el.textContent = T[key];
        }
      }
    }

    // Update placeholders
    document.querySelectorAll<HTMLElement>("[data-placeholder]").forEach((el) => {
      const key = el.dataset.placeholder as keyof Translations;
      if (key && T[key]) {
        (el as HTMLInputElement | HTMLTextAreaElement).placeholder = T[key];
      }
    });

    // Update select options
    const difficultySelect = document.getElementById("aiDifficulty") as HTMLSelectElement | null;
    if (difficultySelect) {
      const options: Record<string, keyof Translations> = {
        txtDifficultyEasy: "difficultyEasy",
        txtDifficultyMedium: "difficultyMedium",
        txtDifficultyHard: "difficultyHard",
        txtDifficultyMixed: "difficultyMixed",
      };
      difficultySelect.querySelectorAll("option").forEach((opt) => {
        const key = options[opt.id];
        if (key && T[key]) {
          opt.textContent = T[key];
        }
      });
    }

    // Nav buttons update
    const nextBtn = document.getElementById("nextBtn");
    const nextBtnSpan = document.getElementById("txtNext");
    if (nextBtnSpan && nextBtn) {
      const isFinish = nextBtn.classList.contains("finish");
      nextBtnSpan.textContent = isFinish ? T.finish : T.next;
    }

    // Update all prev buttons that don't have specific IDs
    document.querySelectorAll<HTMLElement>(".nav-btn.prev").forEach((btn) => {
      const span = btn.querySelector("span");
      if (span && !span.id) {
        span.textContent = T.back;
      }
    });
  }

  // ============================================================================
  // Library Management
  // ============================================================================

  async refreshLibrary(): Promise<void> {
    const listEl = document.getElementById("examList");
    if (listEl) {
      listEl.innerHTML = `<div class="no-exams">${this.translations.loading}</div>`;
    }

    try {
      this.exams = await this.storage.getExams();
      this.folders = await this.storage.getFolders();
      this.renderLibrary();
    } catch (e) {
      console.error("Load Error:", e);
      if (listEl) {
        listEl.innerHTML = `<div class="no-exams">Error loading library.</div>`;
      }
    }
  }

  private async renderLibrary(): Promise<void> {
    const listEl = document.getElementById("examList");
    if (!listEl) return;

    // Build folder map including all folders (even empty ones)
    const map: Record<string, StoredExam[]> = { uncategorized: [] };
    this.folders.forEach((f) => (map[f.id] = []));

    const hasAnyExams = this.exams.length > 0;

    // Distribute exams into folders
    this.exams.forEach((exam) => {
      const fid = exam.folderId || "uncategorized";
      if (!map[fid]) map[fid] = [];
      map[fid].push(exam);
    });

    // If truly empty (no exams and no folders), show the empty state
    if (!hasAnyExams && this.folders.length === 0) {
      listEl.innerHTML = `
        <div class="no-exams">
          <p>${this.translations.noExamsFound}</p>
          <p style="font-size: 0.9em; margin-top: 10px; color: #888;">${this.translations.importFirst}</p>
          <button onclick="window.app.importDemoData()" style="margin-top:15px; padding:8px 16px; cursor:pointer;" class="mode-btn">${this.translations.loadExampleExam}</button>
        </div>
      `;
      this.renderLibraryControls(listEl);
      return;
    }

    // Load all progress data
    const progressMap: Record<string, ExamProgress | undefined> = {};
    for (const exam of this.exams) {
      progressMap[exam.id] = await this.storage.getProgress(exam.id);
    }

    let html = "";

    const renderExam = (exam: StoredExam): string => {
      const progress = progressMap[exam.id];
      const attempts = progress?.attempts ?? 0;
      const lastScore = progress?.lastScore;
      const bestScore = progress?.bestScore;

      let statsHtml = "";
      if (attempts > 0) {
        const displayBestScore = bestScore ?? 0;
        const bestScoreColor =
          displayBestScore >= 70
            ? "var(--accent-secondary)"
            : displayBestScore >= 50
              ? "#ffd700"
              : "#ff6b6b";
        statsHtml = `
          <div class="exam-stats-container">
            <div class="exam-stats-row">
              <div class="stat-item attempts-stat">
                <span class="stat-icon">🎯</span>
                <span class="stat-value">${attempts}</span>
                <span class="stat-label">${attempts === 1 ? this.translations.attempt : this.translations.attempts}</span>
              </div>
              <div class="stat-item last-stat">
                <span class="stat-icon">⏱️</span>
                <span class="stat-value">${lastScore ?? 0}%</span>
                <span class="stat-label">${this.translations.lastScore}</span>
              </div>
              <div class="stat-item best-stat">
                <span class="stat-icon">🏆</span>
                <span class="stat-value" style="color: ${bestScoreColor}">${displayBestScore}%</span>
                <span class="stat-label">${this.translations.bestScore}</span>
              </div>
            </div>
            <div class="best-score-bar">
              <div class="best-score-fill" style="width: ${displayBestScore}%; background: ${bestScoreColor}"></div>
            </div>
          </div>
        `;
      } else {
        statsHtml = `<span class="exam-item-meta">${exam.data.total_questions ?? "?"} ${this.translations.questions}</span>`;
      }

      return `
        <div class="exam-item" data-id="${exam.id}" draggable="true" 
             ondragstart="window.app.handleDragStart(event, '${exam.id}')" 
             ondragend="window.app.handleDragEnd(event)">
          <div class="exam-item-info" onclick="window.app.loadExam('${exam.id}')">
            <div class="exam-item-title">${exam.title || exam.id}</div>
            <div class="exam-item-stats">
              ${statsHtml}
            </div>
          </div>
          <div class="exam-actions">
            <button class="icon-btn" onclick="event.stopPropagation(); window.app.promptRenameExam('${exam.id}')" title="${this.translations.rename}">✏️</button>
            <button class="icon-btn" onclick="event.stopPropagation(); window.app.promptMoveExam('${exam.id}')" title="${this.translations.move}">📁</button>
            <button class="icon-btn" onclick="event.stopPropagation(); window.app.deleteExam('${exam.id}')" title="${this.translations.delete}">🗑️</button>
          </div>
        </div>
      `;
    };

    // Render Folders
    for (const [folderId, exams] of Object.entries(map)) {
      if (folderId === "uncategorized" && exams.length === 0 && this.folders.length > 0) {
        continue;
      }

      let folderName = this.folders.find((f) => f.id === folderId)?.name || folderId;
      if (folderId === "uncategorized") {
        folderName = this.translations.uncategorized;
      }

      const icon = folderId === "uncategorized" ? "📂" : "📁";
      const isUncat = folderId === "uncategorized";

      html += `
        <div class="category-section" id="cat-${folderId}" data-folder-id="${folderId}"
             ondragover="window.app.handleDragOver(event, '${folderId}')" 
             ondragleave="window.app.handleDragLeave(event, '${folderId}')"
             ondrop="window.app.handleDrop(event, '${folderId}')">
          <div class="category-header">
            <div style="display:flex; align-items:center; flex:1; cursor:pointer;" onclick="document.getElementById('cat-${folderId}').classList.toggle('collapsed')">
              <span class="category-icon">${icon}</span>
              <span class="category-name">${folderName}</span>
              <span class="category-count">${exams.length}</span>
              <span class="category-toggle">▼</span>
            </div>
            ${!isUncat
          ? `
              <button class="icon-btn" onclick="event.stopPropagation(); window.app.promptRenameFolder('${folderId}')" title="${this.translations.rename}">✏️</button>
              <button class="icon-btn" onclick="event.stopPropagation(); window.app.deleteFolder('${folderId}')" title="${this.translations.delete}">🗑️</button>
            `
          : ""
        }
          </div>
          <div class="category-exams">
            ${exams.map((e) => renderExam(e)).join("")}
          </div>
        </div>
      `;
    }

    listEl.innerHTML = html;
    this.renderLibraryControls(listEl);
  }

  private renderLibraryControls(container: HTMLElement): void {
    const div = document.createElement("div");
    div.className = "library-controls";
    div.style.marginTop = "20px";
    div.style.display = "flex";
    div.style.gap = "10px";
    div.style.justifyContent = "center";
    div.style.flexWrap = "wrap";

    const hasData = this.exams.length > 0 || this.folders.length > 0;

    div.innerHTML = `
      <button class="mode-btn" onclick="window.app.promptCreateFolder()" style="padding:10px 20px; font-size:0.9em;">
        + ${this.translations.newFolder}
      </button>
      <button class="mode-btn" onclick="window.app.exportLibrary()" style="padding:10px 20px; font-size:0.9em;">
        ⬇ ${this.translations.export}
      </button>
      <button class="mode-btn" onclick="document.getElementById('backupInput').click()" style="padding:10px 20px; font-size:0.9em;">
        ⬆ ${this.translations.import}
      </button>
      ${hasData
        ? `<button class="mode-btn" onclick="window.app.clearAllData()" style="padding:10px 20px; font-size:0.9em; color: #ff4757; border-color: #ff4757;">
             🗑 ${this.translations.clearData}
           </button>`
        : ""
      }
      <input type="file" id="backupInput" accept=".json" class="hidden" onchange="window.app.handleBackupImport(event)" />
    `;

    container.appendChild(div);
  }

  // ============================================================================
  // Actions
  // ============================================================================

  async handleFileSelect(event: Event & { target: HTMLInputElement }): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        // Parse as unknown first, then validate strictly
        const json = JSON.parse(e.target?.result as string) as unknown;
        // Strict v2.0 validation
        const validatedExam = validateExam(json);
        await this.importExam(validatedExam);
      } catch (err) {
        // Show user-friendly error message
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        alert(`${this.translations.invalidExamFormat}: ${errorMsg}`);
      }
    };
    reader.readAsText(file);
  }

  async importExam(exam: Exam, folderId = "uncategorized"): Promise<void> {
    // Create StoredExam wrapper for validated Exam
    const storedExam: StoredExam = {
      id: exam.exam_id,
      title: exam.title,
      data: exam,
      addedAt: new Date().toISOString(),
      folderId: folderId,
    };

    try {
      await this.storage.saveExam(storedExam);
      this.refreshLibrary();
    } catch (e) {
      console.error(e);
      alert("Failed to save exam.");
    }
  }

  async importDemoData(): Promise<void> {
    try {
      const response = await fetch("practice/examples/example_exam.json");
      if (!response.ok) throw new Error("Failed to load example exam");

      // Parse as unknown and validate strictly
      const json = (await response.json()) as unknown;
      const validatedExam = validateExam(json);

      // Create a folder for the example
      const exampleFolderId = "example-folder";
      const existingFolder = this.folders.find((f) => f.id === exampleFolderId);
      if (!existingFolder) {
        await this.storage.saveFolder({
          id: exampleFolderId,
          name: this.currentLang === "es" ? "Ejemplo" : "Example",
          order: 0,
        });
      }

      // Import the validated exam
      await this.importExam(validatedExam, exampleFolderId);
    } catch (e) {
      console.error("Failed to load example exam:", e);
      alert(this.translations.errorLoadingExample);
    }
  }

  async loadExam(id: string): Promise<void> {
    try {
      const examWrapper = await this.storage.getExam(id);
      if (!examWrapper) {
        alert(this.translations.examNotFound);
        return;
      }

      const examData = examWrapper.data;
      examData.exam_id = examWrapper.id;

      this.practiceManager.startPractice(examData, {
        shuffleQuestions: (document.getElementById("shuffleQuestions") as HTMLInputElement | null)?.checked ?? false,
        shuffleAnswers: (document.getElementById("shuffleAnswers") as HTMLInputElement | null)?.checked ?? false,
        showFeedback: (document.getElementById("showFeedback") as HTMLInputElement | null)?.checked ?? true,
      });
    } catch (e) {
      console.error(e);
      alert("Failed to load exam.");
    }
  }

  // ============================================================================
  // Management
  // ============================================================================

  async promptCreateFolder(): Promise<void> {
    const name = prompt(this.translations.folderName);
    if (name && name.trim()) {
      try {
        await this.storage.saveFolder({ id: crypto.randomUUID(), name: name.trim(), order: 0 });
        this.refreshLibrary();
      } catch (e) {
        alert(this.translations.errorCreatingFolder);
      }
    }
  }

  async deleteFolder(id: string): Promise<void> {
    const folder = this.folders.find((f) => f.id === id);
    const folderName = folder ? folder.name : id;

    if (!confirm(`${this.translations.delete} "${folderName}"? ${this.translations.confirmDeleteFolder}`)) {
      return;
    }

    try {
      await this.storage.deleteFolder(id);
      this.refreshLibrary();
    } catch (e) {
      alert(this.translations.errorDeletingFolder);
    }
  }

  async deleteExam(id: string): Promise<void> {
    const exam = this.exams.find((e) => e.id === id);
    const examTitle = exam ? exam.title || exam.id : id;

    if (!confirm(`${this.translations.confirmDelete}\n"${examTitle}"`)) {
      return;
    }

    try {
      await this.storage.deleteExam(id);
      this.refreshLibrary();
    } catch (e) {
      alert(this.translations.errorDeletingExam);
    }
  }

  async promptRenameExam(examId: string): Promise<void> {
    const exam = await this.storage.getExam(examId);
    if (!exam) return;

    const newName = prompt(
      `${this.translations.newName}\n${exam.title || exam.id}`,
      exam.title || exam.id
    );

    if (newName && newName.trim() && newName.trim() !== exam.title) {
      exam.title = newName.trim();
      try {
        await this.storage.saveExam(exam);
        this.refreshLibrary();
      } catch (e) {
        alert(this.translations.errorRenaming);
      }
    }
  }

  async promptRenameFolder(folderId: string): Promise<void> {
    const folder = this.folders.find((f) => f.id === folderId);
    if (!folder) return;

    const newName = prompt(
      `${this.translations.newName}\n${folder.name}`,
      folder.name
    );

    if (newName && newName.trim() && newName.trim() !== folder.name) {
      folder.name = newName.trim();
      try {
        await this.storage.saveFolder(folder);
        this.refreshLibrary();
      } catch (e) {
        alert(this.translations.errorRenaming);
      }
    }
  }

  async promptMoveExam(examId: string): Promise<void> {
    const folders = [
      { id: "uncategorized", name: this.translations.uncategorized },
      ...this.folders,
    ];

    let msg = `${this.translations.moveToFolder}:\n`;
    folders.forEach((f, i) => (msg += `${i + 1}. ${f.name}\n`));

    const input = prompt(msg);
    if (input) {
      const idx = parseInt(input, 10) - 1;
      if (idx >= 0 && idx < folders.length) {
        const folderId = folders[idx].id;
        try {
          const exam = await this.storage.getExam(examId);
          if (exam) {
            exam.folderId = folderId;
            await this.storage.saveExam(exam);
            this.refreshLibrary();
          }
        } catch (e) {
          alert("Failed to move exam");
        }
      }
    }
  }

  async exportLibrary(): Promise<void> {
    try {
      const data = await this.storage.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ginaxams_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(this.translations.exportFailed);
    }
  }

  async handleBackupImport(event: Event & { target: HTMLInputElement }): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as ExportData;
        if (!data.exams && !data.version) {
          throw new Error("Invalid backup format");
        }
        await this.storage.importData(data);
        alert("Import successful!");
        this.refreshLibrary();
      } catch (e) {
        alert(`${this.translations.importFailed}: ${(e as Error).message}`);
      }
    };
    reader.readAsText(file);
  }

  async clearAllData(): Promise<void> {
    if (!confirm(this.translations.confirmClearData)) {
      return;
    }

    try {
      await this.storage.clearAll();
      this.exams = [];
      this.folders = [];
      this.refreshLibrary();
    } catch (e) {
      alert("Failed to clear data: " + (e as Error).message);
    }
  }

  async downloadTemplate(): Promise<void> {
    try {
      const response = await fetch("practice/examples/example_exam.json");
      if (!response.ok) throw new Error("Failed to load template");

      const json = (await response.json()) as Record<string, unknown>;

      const template = {
        _comment:
          "This is an example exam for Ginaxams. You can use this as a template to create your own exams.",
        _ai_tip:
          "Tip: Paste this into NotebookLM, ChatGPT or Claude and ask: 'Create an exam about [YOUR TOPIC] in this exact JSON format'",
        ...json,
      };

      const blob = new Blob([JSON.stringify(template, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ginaxams_template_example.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to download template:", e);
      alert(this.translations.errorLoadingExample);
    }
  }

  // ============================================================================
  // Drag and Drop
  // ============================================================================

  handleDragStart(event: DragEvent, examId: string): void {
    if (event.dataTransfer) {
      event.dataTransfer.setData("text/plain", examId);
      event.dataTransfer.effectAllowed = "move";
    }
    document.body.classList.add("dragging");
  }

  handleDragEnd(_event: DragEvent): void {
    document.body.classList.remove("dragging");
    document.querySelectorAll(".category-section").forEach((el) => {
      el.classList.remove("drop-target");
    });
  }

  handleDragOver(event: DragEvent, folderId: string): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    const section = document.getElementById(`cat-${folderId}`);
    section?.classList.add("drop-target");
  }

  handleDragLeave(_event: DragEvent, folderId: string): void {
    const section = document.getElementById(`cat-${folderId}`);
    section?.classList.remove("drop-target");
  }

  async handleDrop(event: DragEvent, targetFolderId: string): Promise<void> {
    event.preventDefault();
    document.body.classList.remove("dragging");

    const examId = event.dataTransfer?.getData("text/plain");
    if (!examId) return;

    const exam = await this.storage.getExam(examId);
    if (!exam || exam.folderId === targetFolderId) {
      document.querySelectorAll(".category-section").forEach((el) => {
        el.classList.remove("drop-target");
      });
      return;
    }

    exam.folderId = targetFolderId;
    try {
      await this.storage.saveExam(exam);
      this.refreshLibrary();
    } catch (e) {
      alert(this.translations.errorMovingExam);
    }
  }

  // ============================================================================
  // Progress
  // ============================================================================

  async saveProgress(examId: string, questionNum: number, wasCorrect: boolean): Promise<void> {
    try {
      let p = await this.storage.getProgress(examId);
      if (!p) {
        p = {
          examId,
          questions: {},
          correct: 0,
          total: 0,
          lastPractice: null,
          maxCorrect: 0,
          attempts: 0,
          lastScore: null,
          bestScore: null,
        };
      }

      p.questions[questionNum] = {
        wasCorrect,
        lastAttempt: new Date().toISOString(),
      };

      const qs = Object.values(p.questions);
      p.correct = qs.filter((x) => x.wasCorrect).length;
      p.total = qs.length;

      if (p.correct > p.maxCorrect) p.maxCorrect = p.correct;
      p.lastPractice = new Date().toISOString();

      await this.storage.saveProgress(p);
    } catch (e) {
      console.warn("Progress save failed", e);
    }
  }

  async incrementAttempt(examId: string): Promise<void> {
    try {
      const p = await this.storage.getProgress(examId);
      if (!p) {
        // Create new progress with initial attempt
        const newProgress: ExamProgress = {
          examId,
          questions: {},
          correct: 0,
          total: 0,
          lastPractice: null,
          maxCorrect: 0,
          attempts: 1,
          lastScore: null,
          bestScore: null,
        };
        await this.storage.saveProgress(newProgress);
        return;
      }

      p.attempts = (p.attempts ?? 0) + 1;
      await this.storage.saveProgress(p);
    } catch (e) {
      console.warn("Increment attempt failed", e);
    }
  }

  async saveScore(examId: string, score: number): Promise<{ lastScore: number | null; bestScore: number | null }> {
    try {
      let p = await this.storage.getProgress(examId);
      if (!p) {
        p = {
          examId,
          questions: {},
          correct: 0,
          total: 0,
          lastPractice: null,
          maxCorrect: 0,
          attempts: 0,
          lastScore: null,
          bestScore: null,
        };
      }

      p.lastScore = score;

      if (p.bestScore === null || score > p.bestScore) {
        p.bestScore = score;
      }

      await this.storage.saveProgress(p);

      return { lastScore: p.lastScore, bestScore: p.bestScore };
    } catch (e) {
      console.warn("Save score failed", e);
      return { lastScore: score, bestScore: score };
    }
  }

  getQuestionResult(_examId: string, _questionNum: number): boolean | null {
    // This is a synchronous wrapper - actual implementation would need async
    // For now, return null to maintain compatibility
    return null;
  }

  // ============================================================================
  // Navigation
  // ============================================================================

  private hideAllScreens(): void {
    document.querySelectorAll('[id$="Screen"]').forEach((el) => {
      el.classList.add("hidden");
    });
  }

  showFileScreen(): void {
    this.hideAllScreens();
    const fileScreen = document.getElementById("fileScreen");
    if (fileScreen) {
      fileScreen.classList.remove("hidden");
    }
    const examTitle = document.getElementById("examTitle");
    if (examTitle) {
      examTitle.textContent = "";
    }
    this.refreshLibrary();
  }

  showModeScreen(): void {
    this.hideAllScreens();
    const modeScreen = document.getElementById("modeScreen");
    if (modeScreen) {
      modeScreen.classList.remove("hidden");
    }

    const examData = this.practiceManager.getExamData();
    if (examData) {
      const examTitle = document.getElementById("examTitle");
      if (examTitle) {
        examTitle.textContent = examData.title;
      }

      this.storage.getProgress(examData.exam_id).then((p) => {
        const el = document.getElementById("examStats");
        if (!el) return;

        const total = examData.total_questions ?? 0;
        if (p) {
          const pct = calculatePercentage(p.correct, total);
          el.textContent = `${total} ${this.translations.questions} | ${this.translations.bestScore}: ${p.correct}/${total} (${pct}%)`;
        } else {
          el.textContent = `${total} ${this.translations.questions}`;
        }
      });
    }
  }
}
