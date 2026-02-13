/**
 * Main Application Logic
 */
class App {
  constructor() {
    this.storage = window.storage;
    // PracticeManager needs access to App for navigation and T
    this.practiceManager = new window.PracticeManager(this);
    this.exams = [];
    this.folders = [];
    this.T = window.LANG_EN || {}; // Default fallback
    this.currentLang = "en";

    this.init();
  }

  async init() {
    try {
      await this.storage.ready();

      // Load Language Preference - detect from browser if not set
      const savedLang = localStorage.getItem("ginaxams_lang");
      const detectedLang = this.detectBrowserLanguage();
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

  detectBrowserLanguage() {
    // Get browser language (handles both 'es' and 'es-ES', 'es-MX', etc.)
    const browserLang = navigator.language || navigator.userLanguage || "en";
    const langCode = browserLang.toLowerCase().split("-")[0];

    // Spanish variants -> 'es', everything else -> 'en'
    return langCode === "es" ? "es" : "en";
  }

  // --- Onboarding ---

  checkOnboarding() {
    const hasSeenOnboarding = localStorage.getItem("ginaxams_onboarding_seen");
    if (!hasSeenOnboarding) {
      this.showOnboarding();
    }
  }

  showOnboarding() {
    this.currentOnboardingStep = 1;
    const totalSteps = 5;
    this.totalOnboardingSteps = totalSteps;

    const overlay = document.getElementById("onboardingOverlay");
    if (overlay) {
      overlay.classList.remove("hidden");
      // Small delay to allow display:block to apply before adding active for animation
      setTimeout(() => {
        overlay.classList.add("active");
        this.updateOnboardingUI();
      }, 10);
    }
  }

  updateOnboardingUI() {
    // Update step visibility
    document.querySelectorAll(".onboarding-step-content").forEach((el) => {
      const step = parseInt(el.dataset.step);
      el.classList.toggle("hidden", step !== this.currentOnboardingStep);
    });

    // Update step indicators
    document.querySelectorAll(".onboarding-step").forEach((el) => {
      const step = parseInt(el.dataset.step);
      el.classList.toggle("active", step === this.currentOnboardingStep);
    });

    // Update buttons
    const prevBtn = document.getElementById("onboardingPrevBtn");
    const nextBtn = document.getElementById("onboardingNextBtn");

    if (prevBtn) {
      prevBtn.classList.toggle("hidden", this.currentOnboardingStep === 1);
    }

    if (nextBtn) {
      const isLastStep =
        this.currentOnboardingStep === this.totalOnboardingSteps;
      const nextText = nextBtn.querySelector("span");
      if (nextText) {
        nextText.textContent = isLastStep
          ? this.T?.onboardingFinish || "Get Started"
          : this.T?.onboardingNext || "Next";
      }
    }
  }

  nextOnboardingStep() {
    if (this.currentOnboardingStep < this.totalOnboardingSteps) {
      this.currentOnboardingStep++;
      this.updateOnboardingUI();
    } else {
      // On last step, clicking "Comenzar/Get Started" opens AI Prompt Generator by default
      this.finishOnboardingAndShowAIPrompt();
    }
  }

  prevOnboardingStep() {
    if (this.currentOnboardingStep > 1) {
      this.currentOnboardingStep--;
      this.updateOnboardingUI();
    }
  }

  skipOnboarding() {
    this.finishOnboarding();
  }

  finishOnboarding() {
    localStorage.setItem("ginaxams_onboarding_seen", "true");
    const overlay = document.getElementById("onboardingOverlay");
    if (overlay) {
      overlay.classList.remove("active");
      // Add hidden class immediately to allow reopening
      overlay.classList.add("hidden");
    }
  }

  finishOnboardingAndShowAIPrompt() {
    this.finishOnboarding();
    // Small delay to allow transition to complete
    setTimeout(() => {
      this.showAIPromptGenerator();
    }, 100);
  }

  finishOnboardingAndShowTemplate() {
    this.finishOnboarding();
    // Small delay to allow transition to complete
    setTimeout(() => {
      this.showTemplateModal();
    }, 100);
  }

  async loadTemplateJSON() {
    try {
      const response = await fetch("practice/examples/example_exam.json");
      if (!response.ok) return;

      const json = await response.json();
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

  syntaxHighlightJSON(json) {
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

  toggleHelpMenu() {
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

  toggleHelpSection() {
    this.showChoiceModal();
  }

  // --- Choice Modal (Easy vs Advanced) ---

  showChoiceModal() {
    const modal = document.getElementById("choiceModal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("active");
    }
  }

  closeChoiceModal() {
    const modal = document.getElementById("choiceModal");
    if (modal) {
      modal.classList.remove("active");
      setTimeout(() => modal.classList.add("hidden"), 300);
    }
  }

  // --- Template Modal ---

  showTemplateModal() {
    const modal = document.getElementById("templateModal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("active");
    }
  }

  closeTemplateModal() {
    const modal = document.getElementById("templateModal");
    if (modal) {
      modal.classList.remove("active");
      setTimeout(() => modal.classList.add("hidden"), 300);
    }
  }

  // --- External Link Handling ---

  openExternalLink(url, name) {
    this.pendingExternalLink = url;
    const modal = document.getElementById("externalLinkModal");
    const urlEl = document.getElementById("externalLinkUrl");
    if (modal && urlEl) {
      urlEl.textContent = url;
      modal.classList.remove("hidden");
      modal.classList.add("active");
    }
  }

  closeExternalLinkModal() {
    const modal = document.getElementById("externalLinkModal");
    if (modal) {
      modal.classList.remove("active");
      setTimeout(() => modal.classList.add("hidden"), 300);
    }
    this.pendingExternalLink = null;
  }

  confirmExternalLink() {
    if (this.pendingExternalLink) {
      window.open(this.pendingExternalLink, "_blank");
      this.closeExternalLinkModal();
    }
  }

  async copyTemplate() {
    if (!this.templateJSON) {
      await this.loadTemplateJSON();
    }

    const jsonStr = JSON.stringify(this.templateJSON, null, 2);

    try {
      await navigator.clipboard.writeText(jsonStr);

      // Show feedback
      const btn = document.querySelector(".template-copy-btn");
      if (btn) {
        const originalText = btn.innerHTML;
        btn.classList.add("copied");
        btn.innerHTML = "✓ " + (this.T.copied || "Copied!");

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

  // --- AI Prompt Generator ---

  showAIPromptGenerator() {
    const modal = document.getElementById("aiPromptModal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("active");
      // Reset form
      document.getElementById("aiNumQuestions").value = "10";
      document.getElementById("aiNumAnswers").value = "4";
      document.getElementById("aiDifficulty").value = "medium";
      document.getElementById("aiMaterial").value = "";
      document.getElementById("aiMaterialInChat").checked = false;
      document.getElementById("aiMaterialField").classList.remove("hidden");
      document.getElementById("aiPromptResult").classList.add("hidden");
    }
  }

  toggleMaterialField() {
    const checkbox = document.getElementById("aiMaterialInChat");
    const field = document.getElementById("aiMaterialField");
    if (checkbox && field) {
      field.classList.toggle("hidden", checkbox.checked);
    }
  }

  closeAIPromptGenerator() {
    const modal = document.getElementById("aiPromptModal");
    if (modal) {
      modal.classList.remove("active");
      setTimeout(() => modal.classList.add("hidden"), 300);
    }
  }

  generateAIPrompt() {
    const numQuestions =
      document.getElementById("aiNumQuestions").value || "10";
    const numAnswers = document.getElementById("aiNumAnswers").value || "4";
    const difficulty = document.getElementById("aiDifficulty").value;
    const materialInChat = document.getElementById("aiMaterialInChat").checked;
    const material = document.getElementById("aiMaterial").value.trim();

    // Only require material if not using the "in chat" option
    if (!materialInChat && !material) {
      alert(
        this.T?.aiPromptNoMaterial || "Please enter your study material first!",
      );
      return;
    }

    // Generate unique exam ID based on content hash + settings
    const examId = this.generateExamId(
      material || "in-chat",
      numQuestions,
      difficulty,
    );

    const difficultyText = {
      easy: this.T?.difficultyEasy || "easy",
      medium: this.T?.difficultyMedium || "medium",
      hard: this.T?.difficultyHard || "hard",
      mixed: this.T?.difficultyMixed || "mixed difficulty levels",
    }[difficulty];

    const langText = this.currentLang === "es" ? "español" : "English";

    const prompt =
      this.currentLang === "es"
        ? this.generateSpanishPrompt(
            numQuestions,
            numAnswers,
            difficultyText,
            material,
            examId,
            langText,
            materialInChat,
          )
        : this.generateEnglishPrompt(
            numQuestions,
            numAnswers,
            difficultyText,
            material,
            examId,
            langText,
            materialInChat,
          );

    // Show result
    document.getElementById("aiGeneratedPrompt").value = prompt;
    document.getElementById("aiPromptResult").classList.remove("hidden");

    // Scroll to result
    setTimeout(() => {
      document
        .getElementById("aiPromptResult")
        .scrollIntoView({ behavior: "smooth" });
    }, 100);
  }

  generateEnglishPrompt(
    numQuestions,
    numAnswers,
    difficulty,
    material,
    examId,
    lang,
    materialInChat,
  ) {
    const materialSection = materialInChat
      ? `I'll paste the study material in the chat below this prompt.`
      : `STUDY MATERIAL:
"""
${material}
"""`;

    return `Based on the following study material, create a multiple-choice exam with ${numQuestions} questions. Each question must have ${numAnswers} possible answers (labeled A, B, C${numAnswers >= 4 ? ", D" : ""}${numAnswers >= 5 ? ", E" : ""}${numAnswers >= 6 ? ", F" : ""}), with only ONE correct answer per question.

DIFFICULTY LEVEL: ${difficulty}
LANGUAGE: ${lang}

${materialSection}

Please generate a JSON object in this exact format:

{
  "title": "[Descriptive exam title based on the material]",
  "exam_id": "${examId}",
  "total_questions": ${numQuestions},
  "questions": [
    {
      "number": 1,
      "text": "[Question text here]",
      "answers": [
        {"letter": "A", "text": "[Answer text]", "isCorrect": true},
        {"letter": "B", "text": "[Answer text]", "isCorrect": false},
        {"letter": "C", "text": "[Answer text]", "isCorrect": false}${numAnswers >= 4 ? ',\n        {"letter": "D", "text": "[Answer text]", "isCorrect": false}' : ""}${numAnswers >= 5 ? ',\n        {"letter": "E", "text": "[Answer text]", "isCorrect": false}' : ""}${numAnswers >= 6 ? ',\n        {"letter": "F", "text": "[Answer text]", "isCorrect": false}' : ""}
      ],
      "wasCorrect": true,
      "correctAnswerText": "[The correct answer text]",
      "images": []
    }
    // ... repeat for all ${numQuestions} questions
  ]
}

IMPORTANT REQUIREMENTS:
1. Questions should test understanding, not just memorization
2. Distractors (wrong answers) should be plausible
3. Include a mix of question types (conceptual, application, analysis)
4. Make sure questions match the ${difficulty} difficulty level
5. Only ONE answer per question should have "isCorrect": true
6. Return ONLY the JSON, no markdown formatting or explanations`;
  }

  generateSpanishPrompt(
    numQuestions,
    numAnswers,
    difficulty,
    material,
    examId,
    lang,
    materialInChat,
  ) {
    const materialSection = materialInChat
      ? `Pegaré el material de estudio en el chat debajo de este prompt.`
      : `MATERIAL DE ESTUDIO:
"""
${material}
"""`;

    return `Basándome en el siguiente material de estudio, quiero que me generes un examen de opción múltiple con ${numQuestions} preguntas. Cada pregunta debe tener ${numAnswers} respuestas posibles (etiquetadas A, B, C${numAnswers >= 4 ? ", D" : ""}${numAnswers >= 5 ? ", E" : ""}${numAnswers >= 6 ? ", F" : ""}), con UNA sola respuesta correcta por pregunta.

NIVEL DE DIFICULTAD: ${difficulty}
IDIOMA: ${lang}

${materialSection}

Por favor genera un objeto JSON en este formato exacto:

{
  "title": "[Título descriptivo del examen basado en el material]",
  "exam_id": "${examId}",
  "total_questions": ${numQuestions},
  "questions": [
    {
      "number": 1,
      "text": "[Texto de la pregunta aquí]",
      "answers": [
        {"letter": "A", "text": "[Texto de respuesta]", "isCorrect": true},
        {"letter": "B", "text": "[Texto de respuesta]", "isCorrect": false},
        {"letter": "C", "text": "[Texto de respuesta]", "isCorrect": false}${numAnswers >= 4 ? ',\n        {"letter": "D", "text": "[Texto de respuesta]", "isCorrect": false}' : ""}${numAnswers >= 5 ? ',\n        {"letter": "E", "text": "[Texto de respuesta]", "isCorrect": false}' : ""}${numAnswers >= 6 ? ',\n        {"letter": "F", "text": "[Texto de respuesta]", "isCorrect": false}' : ""}
      ],
      "wasCorrect": true,
      "correctAnswerText": "[El texto de la respuesta correcta]",
      "images": []
    }
    // ... repetir para las ${numQuestions} preguntas
  ]
}

REQUISITOS IMPORTANTES:
1. Las preguntas deben evaluar comprensión, no solo memorización
2. Los distractores (respuestas incorrectas) deben ser plausibles
3. Incluye una mezcla de tipos de preguntas (conceptuales, aplicación, análisis)
4. Asegúrate de que las preguntas correspondan al nivel de dificultad: ${difficulty}
5. Solo UNA respuesta por pregunta debe tener "isCorrect": true
6. Devuelve SOLO el JSON, sin formato markdown ni explicaciones`;
  }

  generateExamId(material, numQuestions, difficulty) {
    // Create a simple hash from material + settings
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

  async copyGeneratedPrompt() {
    const textarea = document.getElementById("aiGeneratedPrompt");
    if (!textarea) return;

    try {
      await navigator.clipboard.writeText(textarea.value);
      const btn = document.querySelector(".ai-prompt-copy-btn");
      if (btn) {
        const originalText = btn.innerHTML;
        btn.innerHTML = "✅ " + (this.T?.copied || "Copied!");
        btn.style.background = "var(--accent-secondary)";
        btn.style.color = "var(--bg-primary)";
        btn.style.borderColor = "var(--accent-secondary)";

        // Show AI destinations after copying
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

  bindEvents() {
    // Import File Input
    const fileInput = document.getElementById("fileInput");
    if (fileInput) {
      fileInput.addEventListener("change", (e) => this.handleFileSelect(e));
    }

    // Drag & Drop
    this.setupDragAndDrop();

    // Refresh
    document
      .getElementById("txtRefresh")
      ?.parentElement.addEventListener("click", () => this.refreshLibrary());

    // Language Switcher
    document
      .getElementById("langEn")
      ?.addEventListener("click", () => this.setLanguage("en"));
    document
      .getElementById("langEs")
      ?.addEventListener("click", () => this.setLanguage("es"));

    // Close help menu when clicking outside
    document.addEventListener("click", (e) => {
      const menu = document.getElementById("helpMenuPopup");
      const btn = document.getElementById("helpToggleBtn");
      if (
        menu &&
        !menu.classList.contains("hidden") &&
        !menu.contains(e.target) &&
        !btn.contains(e.target)
      ) {
        this.toggleHelpMenu();
      }
    });

    // Close modals when clicking outside
    document.addEventListener("click", (e) => {
      // AI Prompt Modal
      const aiPromptModal = document.getElementById("aiPromptModal");
      if (
        aiPromptModal &&
        aiPromptModal.classList.contains("active") &&
        e.target === aiPromptModal
      ) {
        this.closeAIPromptGenerator();
      }

      // Choice Modal
      const choiceModal = document.getElementById("choiceModal");
      if (
        choiceModal &&
        choiceModal.classList.contains("active") &&
        e.target === choiceModal
      ) {
        this.closeChoiceModal();
      }

      // Template Modal
      const templateModal = document.getElementById("templateModal");
      if (
        templateModal &&
        templateModal.classList.contains("active") &&
        e.target === templateModal
      ) {
        this.closeTemplateModal();
      }

      // External Link Modal (don't close on outside click for safety)
    });
  }

  setupDragAndDrop() {
    const dropArea = document.querySelector(".file-input-area");
    const fileInput = document.getElementById("fileInput");
    if (!dropArea || !fileInput) return;

    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      dropArea.addEventListener(
        eventName,
        (e) => {
          e.preventDefault();
          e.stopPropagation();
        },
        false,
      );
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      dropArea.addEventListener(
        eventName,
        () => {
          dropArea.style.borderColor = "#00d4ff";
          dropArea.style.background = "#1a264a";
        },
        false,
      );
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropArea.addEventListener(
        eventName,
        () => {
          dropArea.style.borderColor = "";
          dropArea.style.background = "";
        },
        false,
      );
    });

    dropArea.addEventListener(
      "drop",
      (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          fileInput.files = files;
          this.handleFileSelect({ target: fileInput });
        }
      },
      false,
    );
  }

  // --- I18n ---

  setLanguage(lang) {
    this.currentLang = lang;
    this.T = window[`LANG_${lang.toUpperCase()}`] || window.LANG_EN;
    localStorage.setItem("ginaxams_lang", lang);

    document
      .getElementById("langEn")
      ?.classList.toggle("active", lang === "en");
    document
      .getElementById("langEs")
      ?.classList.toggle("active", lang === "es");

    this.updateReflections();
    this.renderLibrary();
  }

  updateReflections() {
    const map = {
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
      if (el && this.T[key]) {
        // Use innerHTML for elements that contain HTML tags
        if (
          [
            "txtMaterialInChatLabel",
            "txtKimiSuggestion",
            "txtEasyWayDesc",
            "txtAdvancedWayDesc",
          ].includes(id)
        ) {
          el.innerHTML = this.T[key];
        } else {
          el.textContent = this.T[key];
        }
      }
    }

    // Update placeholders
    document.querySelectorAll("[data-placeholder]").forEach((el) => {
      const key = el.dataset.placeholder;
      if (this.T[key]) el.placeholder = this.T[key];
    });

    // Update select options
    const difficultySelect = document.getElementById("aiDifficulty");
    if (difficultySelect) {
      const options = difficultySelect.querySelectorAll("option");
      options.forEach((opt) => {
        const key = opt.id;
        if (key && this.T[key]) opt.textContent = this.T[key];
      });
    }

    // Nav buttons update - update the span inside the next button
    const nextBtn = document.getElementById("nextBtn");
    const nextBtnSpan = document.getElementById("txtNext");
    if (nextBtnSpan && nextBtn) {
      const isFinish = nextBtn.classList.contains("finish");
      nextBtnSpan.textContent = isFinish
        ? this.T.finish || "Finish"
        : this.T.next || "Next";
    }

    // Update all prev buttons that don't have specific IDs
    const prevBtns = document.querySelectorAll(".nav-btn.prev");
    prevBtns.forEach((btn) => {
      const span = btn.querySelector("span");
      if (span && !span.id) {
        span.textContent = this.T.back || "Back";
      }
    });
  }

  // --- Library Management ---

  async refreshLibrary() {
    const listEl = document.getElementById("examList");
    if (listEl)
      listEl.innerHTML = `<div class="no-exams">${this.T.loading || "Loading..."}</div>`;

    try {
      this.exams = await this.storage.getExams();
      this.folders = await this.storage.getFolders();
      this.renderLibrary();
    } catch (e) {
      console.error("Load Error:", e);
      if (listEl)
        listEl.innerHTML = `<div class="no-exams">Error loading library.</div>`;
    }
  }

  async renderLibrary() {
    const listEl = document.getElementById("examList");
    if (!listEl) return;

    // Build folder map including all folders (even empty ones)
    const map = { uncategorized: [] };
    this.folders.forEach((f) => (map[f.id] = []));

    // If no exams at all, show message but still display empty folders
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
                    <p>${this.T.noExamsFound || "No exams found."}</p>
                    <p style="font-size: 0.9em; margin-top: 10px; color: #888;">${this.T.importFirst || "Import an exam to start."}</p>
                    <button onclick="window.app.importDemoData()" style="margin-top:15px; padding:8px 16px; cursor:pointer;" class="mode-btn">${this.T.loadExampleExam || this.T.loadDemoData || "Load Example Exam"}</button>
                </div>
            `;
      this.renderLibraryControls(listEl);
      return;
    }

    // Load all progress data
    const progressMap = {};
    for (const exam of this.exams) {
      progressMap[exam.id] = await this.storage.getProgress(exam.id);
    }

    let html = "";

    // Helper to render exam
    const renderExam = (exam) => {
      const progress = progressMap[exam.id];
      const attempts = progress?.attempts || 0;
      const lastScore = progress?.lastScore;
      const bestScore = progress?.bestScore;

      // Build stats display
      let statsHtml = "";
      if (attempts > 0) {
        // Progress bar showing best score
        const displayBestScore =
          bestScore !== undefined && bestScore !== null ? bestScore : 0;
        const displayLastScore =
          lastScore !== undefined && lastScore !== null ? lastScore : 0;
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
                                <span class="stat-label">${attempts === 1 ? this.T.attempt || "attempt" : this.T.attempts || "attempts"}</span>
                            </div>
                            <div class="stat-item last-stat">
                                <span class="stat-icon">⏱️</span>
                                <span class="stat-value">${displayLastScore}%</span>
                                <span class="stat-label">${this.T.lastScore || "Last"}</span>
                            </div>
                            <div class="stat-item best-stat">
                                <span class="stat-icon">🏆</span>
                                <span class="stat-value" style="color: ${bestScoreColor}">${displayBestScore}%</span>
                                <span class="stat-label">${this.T.bestScore || "Best"}</span>
                            </div>
                        </div>
                        <div class="best-score-bar">
                            <div class="best-score-fill" style="width: ${displayBestScore}%; background: ${bestScoreColor}"></div>
                        </div>
                    </div>
                `;
      } else {
        statsHtml = `<span class="exam-item-meta">${exam.data.total_questions || "?"} ${this.T.questions || "questions"}</span>`;
      }

      return `
                <div class="exam-item" data-id="${exam.id}" draggable="true" ondragstart="window.app.handleDragStart(event, '${exam.id}')" ondragend="window.app.handleDragEnd(event)">
                    <div class="exam-item-info" onclick="window.app.loadExam('${exam.id}')">
                        <div class="exam-item-title">${exam.title || exam.id}</div>
                        <div class="exam-item-stats">
                            ${statsHtml}
                        </div>
                    </div>
                    <div class="exam-actions">
                        <button class="icon-btn" onclick="event.stopPropagation(); window.app.promptRenameExam('${exam.id}')" title="${this.T.rename || "Rename"}">✏️</button>
                        <button class="icon-btn" onclick="event.stopPropagation(); window.app.promptMoveExam('${exam.id}')" title="${this.T.move || "Move"}">📁</button>
                        <button class="icon-btn" onclick="event.stopPropagation(); window.app.deleteExam('${exam.id}')" title="${this.T.delete || "Delete"}">🗑️</button>
                    </div>
                </div>
            `;
    };

    // Render Folders - show all folders including empty ones
    for (const [folderId, exams] of Object.entries(map)) {
      // Skip uncategorized only if empty and there are user folders
      if (
        folderId === "uncategorized" &&
        exams.length === 0 &&
        this.folders.length > 0
      )
        continue;

      let folderName =
        this.folders.find((f) => f.id === folderId)?.name || folderId;
      if (folderId === "uncategorized")
        folderName = this.T.uncategorized || "Uncategorized";

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
                        ${
                          !isUncat
                            ? `
                            <button class="icon-btn" onclick="event.stopPropagation(); window.app.promptRenameFolder('${folderId}')" title="${this.T.rename || "Rename"}">✏️</button>
                            <button class="icon-btn" onclick="event.stopPropagation(); window.app.deleteFolder('${folderId}')" title="${this.T.delete || "Delete Folder"}">🗑️</button>
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

    // Updates scores
    this.exams.forEach(async (exam) => {
      const p = await this.storage.getProgress(exam.id);
      const el = document.getElementById(`score-${exam.id}`);
      if (el && p) {
        const total = exam.data.total_questions || p.total;
        const pct = total > 0 ? Math.round((100 * p.correct) / total) : 0;
        const scoreClass = pct >= 70 ? "good" : pct >= 50 ? "medium" : "bad";
        el.innerHTML = `<span class="exam-item-score ${scoreClass}" style="font-size: 0.9em; padding: 2px 6px;">${pct}%</span>`;
      } else if (el) {
        el.textContent = "";
      }
    });
  }

  renderLibraryControls(container) {
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
                + ${this.T.newFolder || "New Folder"}
            </button>
            <button class="mode-btn" onclick="window.app.exportLibrary()" style="padding:10px 20px; font-size:0.9em;">
                ⬇ ${this.T.export || "Backup"}
            </button>
            <button class="mode-btn" onclick="document.getElementById('backupInput').click()" style="padding:10px 20px; font-size:0.9em;">
                ⬆ ${this.T.import || "Restore"}
            </button>
            ${
              hasData
                ? `
            <button class="mode-btn" onclick="window.app.clearAllData()" style="padding:10px 20px; font-size:0.9em; color: #ff4757; border-color: #ff4757;">
                🗑 ${this.T.clearData || "Clear All Data"}
            </button>
            `
                : ""
            }
            <input type="file" id="backupInput" accept=".json" class="hidden" onchange="window.app.handleBackupImport(event)" />
        `;
    container.appendChild(div);
  }

  // --- Actions ---

  async handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(e.target.result);
        await this.importExam(json);
      } catch (err) {
        alert("Error parsing JSON: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  async importExam(json, folderId = "uncategorized") {
    if (!json.questions || !Array.isArray(json.questions)) {
      alert(
        this.T.invalidExamFormat ||
          "Invalid exam format: missing 'questions' array.",
      );
      return;
    }

    const exam = {
      id: json.exam_id || crypto.randomUUID(),
      title: json.title || "Untitled Exam",
      data: json,
      addedAt: new Date().toISOString(),
      folderId: folderId,
    };

    try {
      await this.storage.saveExam(exam);
      this.refreshLibrary();
    } catch (e) {
      console.error(e);
      alert("Failed to save exam.");
    }
  }

  async importDemoData() {
    try {
      const response = await fetch("practice/examples/example_exam.json");
      if (!response.ok) throw new Error("Failed to load example exam");

      const json = await response.json();

      // Create a folder for the example if it doesn't exist
      const exampleFolderId = "example-folder";
      const existingFolder = this.folders.find((f) => f.id === exampleFolderId);
      if (!existingFolder) {
        await this.storage.saveFolder({
          id: exampleFolderId,
          name: this.currentLang === "es" ? "Ejemplo" : "Example",
          order: 0,
        });
      }

      // Import the exam
      const exam = {
        id: json.exam_id || crypto.randomUUID(),
        title:
          json.title ||
          (this.currentLang === "es" ? "Examen de Ejemplo" : "Example Exam"),
        data: json,
        addedAt: new Date().toISOString(),
        folderId: exampleFolderId,
      };

      await this.storage.saveExam(exam);
      this.refreshLibrary();
    } catch (e) {
      console.error("Failed to load example exam:", e);
      alert(this.T.errorLoadingExample || "Failed to load example exam");
    }
  }

  async loadExam(id) {
    try {
      const examWrapper = await this.storage.getExam(id);
      if (!examWrapper) {
        alert(this.T.examNotFound || "Exam not found!");
        return;
      }

      const examData = examWrapper.data;
      examData.exam_id = examWrapper.id;

      this.practiceManager.startPractice(examData, {
        shuffleQuestions: document.getElementById("shuffleQuestions")?.checked,
        shuffleAnswers: document.getElementById("shuffleAnswers")?.checked,
        showFeedback: document.getElementById("showFeedback")?.checked,
      });
    } catch (e) {
      console.error(e);
      alert("Failed to load exam.");
    }
  }

  // --- Management ---

  async promptCreateFolder() {
    const name = prompt(this.T.folderName || "Folder Name:");
    if (name && name.trim()) {
      try {
        await this.storage.saveFolder({ name: name.trim(), order: 0 });
        this.refreshLibrary();
      } catch (e) {
        alert(this.T.errorCreatingFolder || "Failed to create folder");
      }
    }
  }

  async deleteFolder(id) {
    const folder = this.folders.find((f) => f.id === id);
    const folderName = folder ? folder.name : id;
    if (
      !confirm(
        (this.T.delete || "Delete") +
          ' "' +
          folderName +
          '"? ' +
          (this.T.confirmDeleteFolder ||
            "Exams will be moved to Uncategorized"),
      )
    )
      return;
    try {
      await this.storage.deleteFolder(id);
      this.refreshLibrary();
    } catch (e) {
      alert(this.T.errorDeletingFolder || "Failed to delete folder");
    }
  }

  async deleteExam(id) {
    const exam = this.exams.find((e) => e.id === id);
    const examTitle = exam ? exam.title || exam.id : id;
    if (
      !confirm(
        (this.T.confirmDelete || "Delete exam?") + '\n"' + examTitle + '"',
      )
    )
      return;
    try {
      await this.storage.deleteExam(id);
      this.refreshLibrary();
    } catch (e) {
      alert(this.T.errorDeletingExam || "Failed to delete exam");
    }
  }

  async promptRenameExam(examId) {
    const exam = await this.storage.getExam(examId);
    if (!exam) return;

    const newName = prompt(
      (this.T.newName || "New name:") + "\n" + (exam.title || exam.id),
      exam.title || exam.id,
    );
    if (newName && newName.trim() && newName.trim() !== exam.title) {
      exam.title = newName.trim();
      try {
        await this.storage.saveExam(exam);
        this.refreshLibrary();
      } catch (e) {
        alert(this.T.errorRenaming || "Failed to rename");
      }
    }
  }

  async promptRenameFolder(folderId) {
    const folder = this.folders.find((f) => f.id === folderId);
    if (!folder) return;

    const newName = prompt(
      (this.T.newName || "New name:") + "\n" + folder.name,
      folder.name,
    );
    if (newName && newName.trim() && newName.trim() !== folder.name) {
      folder.name = newName.trim();
      try {
        await this.storage.saveFolder(folder);
        this.refreshLibrary();
      } catch (e) {
        alert(this.T.errorRenaming || "Failed to rename");
      }
    }
  }

  async promptMoveExam(examId) {
    // Simple prompt for now, or use a custom modal?
    // Let's use a quick prompt with numbers? No, that's bad UX.
    // Let's use a custom lightweight overlay.

    const folders = [
      { id: "uncategorized", name: this.T.uncategorized || "Uncategorized" },
      ...this.folders,
    ];

    let msg = (this.T.move || "Move to folder") + ":\n";
    folders.forEach((f, i) => (msg += `${i + 1}. ${f.name}\n`));

    const input = prompt(msg);
    if (input) {
      const idx = parseInt(input) - 1;
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

  async exportLibrary() {
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
      alert(this.T.exportFailed || "Export failed");
    }
  }

  async handleBackupImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.exams && !data.version)
          throw new Error("Invalid backup format");
        await this.storage.importData(data);
        alert("Import successful!");
        this.refreshLibrary();
      } catch (e) {
        alert((this.T.importFailed || "Import failed") + ": " + e.message);
      }
    };
    reader.readAsText(file);
  }

  async clearAllData() {
    if (
      !confirm(
        this.T.confirmClearData ||
          "This will delete ALL exams, folders and progress. This cannot be undone. Are you sure?",
      )
    )
      return;

    try {
      await this.storage.clearAll();
      this.exams = [];
      this.folders = [];
      this.refreshLibrary();
    } catch (e) {
      alert("Failed to clear data: " + e.message);
    }
  }

  async downloadTemplate() {
    try {
      const response = await fetch("practice/examples/example_exam.json");
      if (!response.ok) throw new Error("Failed to load template");

      const json = await response.json();

      // Create a clean template with instructions
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
      alert(this.T.errorLoadingExample || "Failed to download template");
    }
  }

  // --- Drag and Drop ---

  handleDragStart(event, examId) {
    event.dataTransfer.setData("text/plain", examId);
    event.dataTransfer.effectAllowed = "move";
    document.body.classList.add("dragging");
  }

  handleDragEnd(event) {
    document.body.classList.remove("dragging");
    // Remove all drop-target classes
    document.querySelectorAll(".category-section").forEach((el) => {
      el.classList.remove("drop-target");
    });
  }

  handleDragOver(event, folderId) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const section = document.getElementById(`cat-${folderId}`);
    if (section) {
      section.classList.add("drop-target");
    }
  }

  handleDragLeave(event, folderId) {
    const section = document.getElementById(`cat-${folderId}`);
    if (section) {
      section.classList.remove("drop-target");
    }
  }

  async handleDrop(event, targetFolderId) {
    event.preventDefault();
    document.body.classList.remove("dragging");

    const examId = event.dataTransfer.getData("text/plain");
    if (!examId) return;

    const exam = await this.storage.getExam(examId);
    if (!exam || exam.folderId === targetFolderId) {
      // Same folder or exam not found, just clean up
      document.querySelectorAll(".category-section").forEach((el) => {
        el.classList.remove("drop-target");
      });
      return;
    }

    // Move exam to new folder
    exam.folderId = targetFolderId;
    try {
      await this.storage.saveExam(exam);
      this.refreshLibrary();
    } catch (e) {
      alert(this.T.errorMovingExam || "Failed to move exam");
    }
  }

  // --- Progress ---

  async saveProgress(examId, questionNum, wasCorrect) {
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

  async incrementAttempt(examId) {
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
      // Ensure all fields exist to prevent data loss
      if (p.attempts === undefined) p.attempts = 0;
      if (p.lastScore === undefined) p.lastScore = null;
      if (p.bestScore === undefined) p.bestScore = null;

      p.attempts = p.attempts + 1;
      await this.storage.saveProgress(p);
    } catch (e) {
      console.warn("Increment attempt failed", e);
    }
  }

  async saveScore(examId, score) {
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

      // Ensure all fields exist to prevent data loss
      if (p.attempts === undefined) p.attempts = 0;
      if (p.lastScore === undefined) p.lastScore = null;
      if (p.bestScore === undefined) p.bestScore = null;

      // Update last score
      p.lastScore = score;

      // Update best score if applicable
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

  async getQuestionResult(examId, questionNum) {
    return null;
  }

  // --- Navigation ---

  hideAllScreens() {
    document
      .querySelectorAll('[id$="Screen"]')
      .forEach((el) => el.classList.add("hidden"));
  }

  showFileScreen() {
    this.hideAllScreens();
    document.getElementById("fileScreen").classList.remove("hidden");
    document.getElementById("examTitle").textContent = ""; // Clear specific title
    this.refreshLibrary();
  }

  showModeScreen() {
    this.hideAllScreens();
    document.getElementById("modeScreen").classList.remove("hidden");
    // ... (existing update logic) ...
    if (this.practiceManager.examData) {
      document.getElementById("examTitle").textContent =
        this.practiceManager.examData.title;

      // Async stats update
      this.storage
        .getProgress(this.practiceManager.examData.exam_id)
        .then((p) => {
          const el = document.getElementById("examStats");
          if (!el) return;
          const total = this.practiceManager.examData.total_questions || 0;
          if (p) {
            const pct = total > 0 ? Math.round((100 * p.correct) / total) : 0;
            el.textContent = `${total} ${this.T.questions} | ${this.T.bestScore}: ${p.correct}/${total} (${pct}%)`;
          } else {
            el.textContent = `${total} ${this.T.questions}`;
          }
        });
    }
  }
}

// Init
window.addEventListener("DOMContentLoaded", () => {
  window.app = new App();
});
